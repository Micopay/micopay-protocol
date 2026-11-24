import { reconcileEscrowTrades } from './escrowReconciliation.service.js';
import pino from 'pino';
import { createHash } from 'crypto';
import type { RawContractEvent } from './event-dispatcher.service.js';
import { rpcRead } from '../lib/stellarRpc.js';
import { config } from '../config.js';

const logger = pino({ name: 'event-listener' });

// ── Defaults ──────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS    = 2_000;
const BACKOFF_BASE_MS     = 1_000;
const BACKOFF_MAX_MS      = 60_000;
const HEALTH_STALE_MS     = 30_000;
const EVENTS_PAGE_LIMIT   = 200;
/** Paginas por ciclo. Si se agotan, el cursor queda antes del ultimo evento y el siguiente ciclo sigue. */
const MAX_PAGES_PER_POLL  = 25;
const SYSTEM_UUID         = '00000000-0000-0000-0000-000000000000';

// ── Pure helpers (exported for unit testing) ──────────────────────────────

/**
 * Full-jitter exponential backoff.
 * Returns a random delay in [1, min(maxMs, baseMs * 2^attempt)] ms.
 * Space complexity O(1); time complexity O(1).
 */
export function jitteredBackoff(attempt: number, baseMs: number, maxMs: number): number {
  const cap = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * cap) + 1;
}

/** True when the RPC error indicates the requested ledger predates the 7-day window. */
export function isBeforeOldestLedgerError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('oldest ledger') || msg.includes('before oldest') || msg.includes('-32600');
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface EventBatch {
  events: RawContractEvent[];
  latestLedger: number;
  /**
   * WP4 (H4): cursor de paginacion del RPC, solo cuando la pagina vino llena
   * y puede haber mas. Antes se pedia una pagina de 200 y el cursor saltaba a
   * `latestLedger`: el evento 201 se perdia.
   */
  nextCursor?: string;
}

/**
 * Injectable dependencies — the entire I/O surface of EscrowEventListener.
 * All Stellar SDK and DB calls go through these, making the class fully
 * testable without network access.
 */
export interface EventListenerDeps {
  /** Fetch contract events from startLedger onwards (inclusive), or the page after `cursor`. */
  fetchEvents: (startLedger: number, cursor?: string) => Promise<EventBatch>;
  /** Return the current on-chain latest ledger sequence. */
  currentLedger: () => Promise<number>;
  /** Load the persisted cursor. Returns 0 on first run. */
  loadCursor: () => Promise<number>;
  /** Persist the cursor after a successful batch. */
  saveCursor: (ledger: number) => Promise<void>;
  /**
   * Whether an event was already applied. `eventKey` is
   * `{contractId}:{eventId}`: the RPC event id alone does not say which
   * contract it came from.
   */
  isProcessed: (eventKey: string) => Promise<boolean>;
  /**
   * Record an event as applied. WP4 (H3): se marca DESPUES de aplicarlo. Antes
   * la marca iba primero; si `dispatch` fallaba, el evento quedaba marcado y no
   * se reintentaba nunca. Los handlers son idempotentes, asi que reaplicar uno
   * cuya marca no alcanzo a guardarse no cambia nada.
   */
  markProcessed: (eventKey: string) => Promise<void>;
  /** Apply a new deduplicated event to the database. */
  dispatch: (event: RawContractEvent) => Promise<void>;
  /**
   * WP4: el cursor salio de la ventana del RPC (caida larga). Los eventos de
   * `fromLedger` a `toLedger` ya no se pueden leer: quien implemente esto debe
   * disparar la conciliacion contra la cadena (WP5).
   */
  onGap?: (fromLedger: number, toLedger: number) => Promise<void>;
}

type ListenerState = 'running' | 'reconnecting' | 'stopped';

// ── Core class ────────────────────────────────────────────────────────────

export class EscrowEventListener {
  private state: ListenerState = 'stopped';
  private lastSuccessAt = 0;
  private failures = 0;
  private lag = 0;
  private abortController: AbortController | null = null;

  constructor(
    readonly contractId: string,
    private readonly deps: EventListenerDeps,
    private readonly opts: {
      pollIntervalMs?: number;
      backoffBaseMs?: number;
      backoffMaxMs?: number;
      healthStaleMs?: number;
    } = {},
  ) {}

  /**
   * Returns true when the listener has polled successfully within the health
   * stale window. Frontend polling is the fallback when this returns false.
   */
  isHealthy(): boolean {
    if (this.state !== 'running') return false;
    const staleMs = this.opts.healthStaleMs ?? HEALTH_STALE_MS;
    return Date.now() - this.lastSuccessAt < staleMs;
  }

  currentState(): ListenerState {
    return this.state;
  }

  /** Ledgers que el cursor quedo detras tras el ultimo ciclo (WP4). 0 = al dia. */
  lagLedgers(): number {
    return this.lag;
  }

  /**
   * Start the background polling loop.
   * Idempotent: second call while already running is a no-op.
   */
  async start(): Promise<void> {
    if (this.state !== 'stopped') return;
    this.state = 'running';
    this.abortController = new AbortController();
    // Detach the loop — errors are caught internally and trigger backoff.
    setImmediate(() => this.loop(this.abortController!.signal).catch((err) => {
      logger.error({ err, category: 'event-listener' }, '[event-listener] Unhandled loop error');
    }));
    logger.info({ contract_id: this.contractId, category: 'event-listener' }, '[event-listener] Started');
  }

  /** Graceful shutdown: aborts the sleep, lets the current poll finish. */
  stop(): void {
    this.state = 'stopped';
    this.abortController?.abort();
    logger.info({ category: 'event-listener' }, '[event-listener] Stopped');
  }

  // ── Private ──────────────────────────────────────────────────────────────

  // Indirection prevents TypeScript from over-narrowing this.state to a
  // specific literal after assignments within the same method body.
  private isStopped(): boolean {
    return this.state === 'stopped';
  }

  private async loop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && !this.isStopped()) {
      try {
        await this.pollOnce();
        this.failures = 0;
        this.lastSuccessAt = Date.now();
        await sleep(this.opts.pollIntervalMs ?? POLL_INTERVAL_MS, signal);
      } catch (err) {
        if (signal.aborted || this.isStopped()) break;

        this.failures++;
        const delay = jitteredBackoff(
          this.failures,
          this.opts.backoffBaseMs ?? BACKOFF_BASE_MS,
          this.opts.backoffMaxMs  ?? BACKOFF_MAX_MS,
        );
        logger.warn(
          { err, failures: this.failures, backoff_ms: delay, category: 'event-listener' },
          '[event-listener] Poll error — backing off',
        );
        this.state = 'reconnecting';
        await sleep(delay, signal);
        if (!signal.aborted && !this.isStopped()) this.state = 'running';
      }
    }
  }

  private async pollOnce(): Promise<void> {
    const cursor = await this.deps.loadCursor();

    if (cursor === 0) {
      // First run: anchor the cursor to the current ledger so we do not
      // replay the entire 7-day RPC history window.
      const current = await this.deps.currentLedger();
      await this.deps.saveCursor(current);
      logger.info(
        { ledger: current, contract_id: this.contractId, category: 'event-listener' },
        '[event-listener] Cursor bootstrapped to current ledger',
      );
      return;
    }

    let batch: EventBatch;
    try {
      batch = await this.deps.fetchEvents(cursor + 1);
    } catch (err) {
      if (isBeforeOldestLedgerError(err)) {
        // WP4: ya no se reinicia en silencio. Los eventos entre el cursor y
        // ahora no se pueden leer: se avisa, se salta al ledger actual y se
        // pide la conciliacion de este contrato.
        const current = await this.deps.currentLedger();
        logger.error(
          { cursor, current, contract_id: this.contractId, category: 'event-listener' },
          '[event-listener] Cursor outside RPC window — events lost, reconciliation required',
        );
        // Primero la conciliacion: si falla, el cursor sigue viejo y se reintenta.
        await this.deps.onGap?.(cursor + 1, current);
        await this.deps.saveCursor(current);
        return; // Not a failure: the next poll continues from `current`.
      }
      throw err;
    }

    // Process events in ledger order, page by page. O(n) where n = new events.
    for (let page = 1; ; page++) {
      for (const event of batch.events) {
        await this.applyOne(event, cursor);
      }
      if (!batch.nextCursor) break;
      if (page >= MAX_PAGES_PER_POLL) {
        // Quedan paginas: el cursor queda justo antes del ultimo evento
        // aplicado y el siguiente ciclo sigue desde ahi (los ya aplicados se
        // saltan por su marca).
        const last = batch.events[batch.events.length - 1];
        if (last && last.ledger - 1 > cursor) await this.deps.saveCursor(last.ledger - 1);
        this.lag = Math.max(0, batch.latestLedger - (last ? last.ledger - 1 : cursor));
        return;
      }
      batch = await this.deps.fetchEvents(cursor + 1, batch.nextCursor);
    }

    // Todas las paginas se aplicaron: el cursor puede llegar al ultimo ledger.
    if (batch.latestLedger > cursor) {
      await this.deps.saveCursor(batch.latestLedger);
    }
    this.lag = 0;
  }

  /**
   * Aplica un evento. Si falla, el cursor se deja justo antes de su ledger y
   * el error sube (backoff): el siguiente ciclo lo reintenta. Los eventos ya
   * aplicados de ese mismo ledger se saltan por su marca.
   */
  private async applyOne(event: RawContractEvent, cursor: number): Promise<void> {
    // La consulta ya filtra por este contrato; aun asi, un evento que diga
    // venir de otro no se aplica. Y si el RPC no lo trae, es el de este
    // listener: el dispatcher necesita saberlo para no cruzar contratos.
    if (event.contractId && event.contractId !== this.contractId) {
      logger.warn(
        { listener_contract: this.contractId, event_contract: event.contractId, event_id: event.id, category: 'event-listener' },
        '[event-listener] Event from another contract — skipped',
      );
      return;
    }
    const key = `${this.contractId}:${event.id}`;
    if (await this.deps.isProcessed(key)) return;

    const scoped: RawContractEvent = { ...event, contractId: this.contractId };
    try {
      await this.deps.dispatch(scoped);
    } catch (err) {
      if (event.ledger - 1 > cursor) await this.deps.saveCursor(event.ledger - 1);
      this.lag = Math.max(0, event.ledger - cursor);
      logger.error(
        { err, event_id: event.id, ledger: event.ledger, contract_id: this.contractId, category: 'event-listener' },
        '[event-listener] Event could not be applied — will retry',
      );
      throw err;
    }
    await this.deps.markProcessed(key);
  }
}

// ── Production factory ────────────────────────────────────────────────────

/**
 * Construct an EscrowEventListener wired to the real Stellar RPC and DB.
 *
 * All I/O is expressed through lazy closures so this factory remains
 * synchronous. ESM module cache makes repeated dynamic imports O(1).
 */
export function createProductionListener(
  contractId: string,
  rpcUrl: string,
  opts: { pollIntervalMs?: number; healthStaleMs?: number } = {},
): EscrowEventListener {
  // The listener has its own backoff loop, so these reads are not retried
  // here; they still count towards the shared Stellar RPC breaker.
  const fetchEvents = async (startLedger: number, cursor?: string): Promise<EventBatch> => {
    const filters = [{ type: 'contract' as const, contractIds: [contractId] }];
    const res = await rpcRead(rpcUrl, (server) => server.getEvents(
      cursor
        ? { filters, cursor, limit: EVENTS_PAGE_LIMIT }
        : { filters, startLedger, limit: EVENTS_PAGE_LIMIT },
    ), { retry: false });
    return {
      events: res.events.map((e: import('@stellar/stellar-sdk').rpc.Api.EventResponse) => ({
        id: e.id,
        // El SDK lo entrega como `Contract`; el dispatcher compara cadenas.
        contractId: e.contractId?.contractId(),
        inSuccessfulContractCall: e.inSuccessfulContractCall,
        topic: e.topic,
        value: e.value,
        txHash: e.txHash,
        ledger: e.ledger,
      })),
      latestLedger: res.latestLedger,
      // Pagina llena: puede haber mas despues de este cursor.
      ...(res.events.length >= EVENTS_PAGE_LIMIT && res.cursor ? { nextCursor: res.cursor } : {}),
    };
  };

  const currentLedger = async (): Promise<number> => {
    const info = await rpcRead(rpcUrl, (server) => server.getLatestLedger(), { retry: false });
    return info.sequence;
  };

  // Reuse processed_tx for event deduplication. La clave lleva red, contrato y
  // evento; resumida con sha256 para caber en VARCHAR(64) ("evt:" + 43).
  const processedKey = (eventKey: string) =>
    `evt:${createHash('sha256').update(`${config.stellarNetwork}:${eventKey}`).digest('base64url')}`;

  const isProcessed = async (eventKey: string): Promise<boolean> => {
    const db = (await import('../db/schema.js')).default;
    const row = await db.getOne('SELECT tx_hash FROM processed_tx WHERE tx_hash = $1', [processedKey(eventKey)]);
    return Boolean(row);
  };

  const markProcessed = async (eventKey: string): Promise<void> => {
    const db = (await import('../db/schema.js')).default;
    // Si otro ciclo ya lo marco, ON CONFLICT lo deja como esta.
    await db.insertUnique(
      `INSERT INTO processed_tx (tx_hash, source_route, user_id, processed_at)
       VALUES ($1, 'event-listener', $2, NOW())
       RETURNING tx_hash`,
      [processedKey(eventKey), SYSTEM_UUID],
      'tx_hash',
    );
  };

  const onGap = async (fromLedger: number, toLedger: number): Promise<void> => {
    logger.error(
      { contract_id: contractId, from_ledger: fromLedger, to_ledger: toLedger, category: 'event-listener-gap' },
      '[event-listener] Gap in event history — reconciling this contract against the chain',
    );
    const counts = await reconcileEscrowTrades({ contractId });
    logger.warn({ ...counts, contract_id: contractId, category: 'event-listener-gap' }, '[event-listener] Gap reconciliation finished');
  };

  const loadCursor = async (): Promise<number> => {
    const { getEventCursor } = await import('../db/event-cursor.model.js');
    return getEventCursor(contractId);
  };

  const saveCursor = async (ledger: number): Promise<void> => {
    const { setEventCursor } = await import('../db/event-cursor.model.js');
    return setEventCursor(contractId, ledger);
  };

  const dispatch = async (event: RawContractEvent): Promise<void> => {
    const { dispatchEscrowEvent } = await import('./event-dispatcher.service.js');
    return dispatchEscrowEvent(event);
  };

  return new EscrowEventListener(contractId, {
    fetchEvents,
    currentLedger,
    loadCursor,
    saveCursor,
    isProcessed,
    markProcessed,
    dispatch,
    onGap,
  }, opts);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('sleep aborted'));
    }, { once: true });
  });
}
