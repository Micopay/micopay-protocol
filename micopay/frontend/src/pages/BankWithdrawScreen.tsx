import { STELLAR_NETWORK_LABEL } from '../utils/stellarExplorer';
import { noKeyMessage } from '../lib/signer/mode';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  confirmBankWithdrawOrder,
  createBankWithdrawQuote,
  fetchBankWithdrawOrders,
  fetchBankWithdrawStatus,
  registerBankAccount,
  relaunchBankKyc,
  startBankKyc,
  type BankKycLaunchForm,
  type BankWithdrawOrder,
  type BankWithdrawOrderSummary,
  type BankWithdrawQuote,
  type BankWithdrawStatusResponse,
  type StartBankKycRequest,
} from '../services/api';
import { extractApiErrorPayload } from '../utils/apiError';
import { getPublicKey } from '../lib/keystore';
import {
  getStellarAssetBalance,
  signAndSubmitBankWithdrawPathPayment,
  WithdrawTxMismatchError,
  type ExpectedBankWithdraw,
} from '../services/stellarRamp';
import i18n from '../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

interface BankWithdrawScreenProps {
  onBack: () => void;
  onVerifyIdentity: () => void;
  userToken: string;
}

// ---- validacion de CLABE (misma formula que el backend) -----------------

const CLABE_WEIGHTS = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];
function validateClabeFront(clabe: string): boolean {
  if (!/^[0-9]{18}$/.test(clabe)) return false;
  let acc = 0;
  for (let i = 0; i < 17; i++) acc += (Number(clabe[i]) * CLABE_WEIGHTS[i]) % 10;
  return ((10 - (acc % 10)) % 10) === Number(clabe[17]);
}

// Mapa minimo CLABE -> banco. Los primeros 3 digitos son el codigo del banco
// (publicado por el Banco de Mexico). Suficiente para el ejemplo; se ira
// ampliando cuando pintemos la lista real.
const BANCOS: Record<string, string> = {
  '002': 'Banamex',
  '012': 'BBVA',
  '014': 'Santander',
  '021': 'HSBC',
  '030': 'Bajio',
  '032': 'IXE',
  '036': 'Inbursa',
  '037': 'Interacciones',
  '040': 'ABC Capital',
  '044': 'Scotiabank',
  '058': 'Banregio',
  '059': 'Invex',
  '060': 'Bansi',
  '062': 'Afirme',
  '072': 'Banorte',
  '127': 'Azteca',
  '137': 'BanCoppel',
  '646': 'STP',
};
function bankFromClabe(clabe: string): string | null {
  if (clabe.length < 3) return null;
  return BANCOS[clabe.slice(0, 3)] ?? null;
}

// ---- Pantalla ------------------------------------------------------------

export default function BankWithdrawScreen({ onBack, onVerifyIdentity, userToken }: BankWithdrawScreenProps) {
  const [status, setStatus] = useState<BankWithdrawStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (detail = false) => {
    try {
      setError(null);
      const s = await fetchBankWithdrawStatus(userToken, { detail });
      setStatus(s);
    } catch (e) {
      setError(extractApiErrorPayload(e).message ?? tr('bankWithdraw.loadError'));
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => { refresh(true); }, [refresh]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Si estamos esperando revision de Etherfuse, consultamos cada 10 s por si
  // ya aprobaron (el webhook escribe en la base, pero esto evita que el
  // usuario tenga que cerrar y abrir).
  useEffect(() => {
    if (status?.stage !== 'kyc_review') return;
    const t = setInterval(() => refresh(), 10_000);
    return () => clearInterval(t);
  }, [status?.stage, refresh]);

  return (
    <div className="min-h-screen bg-crema text-tinta flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b-2 border-tinta">
        <button onClick={onBack} className="font-bold" aria-label={tr('bankWithdraw.back')}>←</button>
        <h1 className="font-bold text-lg">{tr('bankWithdraw.title')}</h1>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4">
        {STELLAR_NETWORK_LABEL === 'Testnet' && (
          <p className="p-3 border-2 border-naranja bg-naranja-suave text-tinta text-sm font-bold rounded-sm">
            {tr('bankWithdraw.testnetWarning')}
          </p>
        )}
        {loading && <p>{tr('bankWithdraw.loading')}</p>}
        {!loading && error && (
          <div className="p-4 border-2 border-naranja bg-naranja-suave">
            <p className="font-bold">{error}</p>
            <button onClick={() => refresh(true)} className="mt-2 underline">{tr('bankWithdraw.retry')}</button>
          </div>
        )}
        {!loading && !error && status && (
          <StageView
            status={status}
            userToken={userToken}
            onChanged={() => refresh(true)}
            onVerifyIdentity={onVerifyIdentity}
          />
        )}
      </main>
    </div>
  );
}

function StageView({
  status, userToken, onChanged, onVerifyIdentity,
}: {
  status: BankWithdrawStatusResponse;
  userToken: string;
  onChanged: () => void;
  onVerifyIdentity: () => void;
}) {
  switch (status.stage) {
    case 'needs_didit':
      return (
        <section className="p-4 border-2 border-tinta bg-crema flex flex-col gap-3">
          <h2 className="font-bold mb-2">{tr('bankWithdraw.diditTitle')}</h2>
          <p>{tr('bankWithdraw.diditBody')}</p>
          <button
            type="button"
            onClick={onVerifyIdentity}
            className="min-h-12 bg-verde text-papel font-bold rounded-sm"
          >
            {tr('bankWithdraw.diditButton')}
          </button>
          <p className="text-sm opacity-70">{tr('bankWithdraw.diditReturn')}</p>
        </section>
      );
    case 'kyc_action':
      return <KycActionView userToken={userToken} message={status.kycMessage ?? null} />;
    case 'needs_kyc':
      return <KycForm userToken={userToken} onDone={onChanged} />;
    case 'kyc_review':
      return (
        <section className="p-4 border-2 border-naranja bg-naranja-suave">
          <h2 className="font-bold mb-2">{tr('bankWithdraw.reviewTitle')}</h2>
          <p>
            {tr('bankWithdraw.reviewBody')}
            {status.kycMessage ? ` ${status.kycMessage}` : ''}
          </p>
        </section>
      );
    case 'needs_bank':
      return <BankAccountForm userToken={userToken} onDone={onChanged} />;
    case 'ready':
      return <WithdrawForm userToken={userToken} clabeMasked={status.clabeMasked} />;
  }
}

function BankAccountForm({ userToken, onDone }: { userToken: string; onDone: () => void }) {
  const [clabe, setClabe] = useState('');
  const [holder, setHolder] = useState('');
  const [rfc, setRfc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clabeOk = validateClabeFront(clabe);
  const banco = bankFromClabe(clabe);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clabeOk || !holder.trim() || !rfc.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      await registerBankAccount(userToken, {
        clabe,
        accountHolderName: holder.trim(),
        taxId: rfc.trim().toUpperCase(),
      });
      onDone();
    } catch (e) {
      setError(extractApiErrorPayload(e).message ?? tr('bankWithdraw.registerError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 border-2 border-tinta bg-crema flex flex-col gap-4">
      <h2 className="font-bold">{tr('bankWithdraw.accountTitle')}</h2>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.clabeLabel')}</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={18}
          value={clabe}
          onChange={(e) => setClabe(e.target.value.replace(/[^0-9]/g, ''))}
          className="border-2 border-tinta p-2 bg-white"
        />
        {clabe.length > 0 && (
          <span className="text-sm">
            {clabe.length < 18
              ? `${clabe.length}/18`
              : clabeOk
                ? `✓ ${banco ?? tr('bankWithdraw.unknownBank')}`
                : tr('bankWithdraw.clabeCheckFailed')}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.holderName')}</span>
        <input
          type="text"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          className="border-2 border-tinta p-2 bg-white"
          autoComplete="name"
          maxLength={200}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.holderRfc')}</span>
        <input
          type="text"
          value={rfc}
          onChange={(e) => setRfc(e.target.value.toUpperCase())}
          className="border-2 border-tinta p-2 bg-white"
          maxLength={13}
          placeholder="XAXX010101000"
        />
      </label>

      {error && <p className="text-red-600 font-bold">{error}</p>}

      <button
        type="submit"
        disabled={!clabeOk || !holder.trim() || !rfc.trim() || submitting}
        className="min-h-12 bg-tinta text-crema font-bold disabled:opacity-50"
      >
        {submitting ? tr('bankWithdraw.saving') : tr('bankWithdraw.saveAccount')}
      </button>
    </form>
  );
}

// ---- KYC: formulario y launch de /idv -----------------------------------

/**
 * Abre /auth/launch de Etherfuse con un POST (como pide la especificacion de
 * JWT bearer). Crea un <form> en el DOM, lo submitea con target="_blank" para
 * que el navegador del sistema se encargue, y lo limpia enseguida. En
 * Capacitor el WebView delega a Chrome Custom Tabs / Safari View Controller.
 */
function submitLaunchForm(launch: BankKycLaunchForm) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = launch.url;
  form.target = '_blank';
  form.rel = 'noopener';
  for (const [k, v] of Object.entries(launch.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  try { form.submit(); } finally { form.remove(); }
}

function KycActionView({ userToken, message }: { userToken: string; message: string | null }) {
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    try {
      setOpening(true);
      setError(null);
      submitLaunchForm(await relaunchBankKyc(userToken));
      setOpened(true);
    } catch (e) {
      setError(extractApiErrorPayload(e).message ?? tr('bankWithdraw.openError'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <section className="p-4 border-2 border-tinta bg-naranja-suave flex flex-col gap-3">
      <h2 className="font-bold">{tr('bankWithdraw.actionTitle')}</h2>
      <p>
        {message
          ?? tr('bankWithdraw.actionDefault')}
      </p>
      {opened && (
        <p className="text-sm">{tr('bankWithdraw.actionReturn')}</p>
      )}
      {error && <p className="text-red-600 font-bold">{error}</p>}
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className="min-h-12 bg-tinta text-crema font-bold disabled:opacity-50"
      >
        {opening ? tr('bankWithdraw.opening') : opened ? tr('bankWithdraw.openAgain') : tr('bankWithdraw.continueEtherfuse')}
      </button>
    </section>
  );
}

const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const CURP_RE = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/;

function KycForm({ userToken, onDone }: { userToken: string; onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [rfc, setRfc] = useState('');
  const [curp, setCurp] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostal] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);

  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts.slice(0, nameParts.length > 2 ? -2 : -1).join(' ') || nameParts[0] || '';
  const lastName = nameParts.length > 1 ? nameParts.slice(nameParts.length > 2 ? -2 : -1).join(' ') : '';
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(dob) &&
    RFC_RE.test(rfc.trim().toUpperCase()) &&
    CURP_RE.test(curp.trim().toUpperCase()) &&
    street.trim().length > 0 &&
    city.trim().length > 0 &&
    email.includes('@');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const req: StartBankKycRequest = {
      firstName,
      lastName,
      dateOfBirth: dob,
      taxId: rfc.trim().toUpperCase(),
      curp: curp.trim().toUpperCase(),
      country: 'MEX',
      address: {
        street: street.trim(),
        city: city.trim(),
        country: 'MEX',
        postalCode: postalCode.trim() || undefined,
      },
      email: email.trim(),
      displayName: fullName.trim(),
    };
    try {
      setSubmitting(true);
      setError(null);
      const res = await startBankKyc(userToken, req);
      submitLaunchForm(res.launch);
      setLaunched(true);
      // El webhook kycUpdated marca el estado desde el backend; mientras tanto
      // onDone trae needs_kyc -> kyc_review y empieza el polling de 10 s.
      setTimeout(onDone, 1500);
    } catch (e) {
      setError(extractApiErrorPayload(e).message ?? tr('bankWithdraw.kycStartError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (launched) {
    return (
      <section className="p-4 border-2 border-tinta bg-naranja-suave flex flex-col gap-3">
        <h2 className="font-bold">{tr('bankWithdraw.launchedTitle')}</h2>
        <p>{tr('bankWithdraw.launchedBody')}</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="p-4 border-2 border-tinta bg-crema flex flex-col gap-3">
      <h2 className="font-bold">{tr('bankWithdraw.kycTitle')}</h2>
      <p className="text-sm">{tr('bankWithdraw.kycIntro')}</p>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.fullName')}</span>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="border-2 border-tinta p-2 bg-white"
          autoComplete="name"
          maxLength={120}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.birthDate')}</span>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="border-2 border-tinta p-2 bg-white"
          max={new Date(Date.now() - 568_000_000_000).toISOString().slice(0, 10) /* ~18 anos */}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.rfcLabel')}</span>
        <input
          type="text"
          value={rfc}
          onChange={(e) => setRfc(e.target.value.toUpperCase())}
          className="border-2 border-tinta p-2 bg-white uppercase"
          maxLength={13}
          placeholder="HEGL900101AB1"
        />
        {rfc.length > 0 && !RFC_RE.test(rfc.trim().toUpperCase()) && (
          <span className="text-sm">{tr('bankWithdraw.rfcInvalid')}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.email')}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-2 border-tinta p-2 bg-white"
          autoComplete="email"
          maxLength={254}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">CURP</span>
        <input
          type="text"
          value={curp}
          onChange={(e) => setCurp(e.target.value.toUpperCase())}
          className="border-2 border-tinta p-2 bg-white uppercase"
          maxLength={18}
          placeholder="HEGL900101MDFRNT00"
        />
        {curp.length > 0 && !CURP_RE.test(curp.trim().toUpperCase()) && (
          <span className="text-sm">{tr('bankWithdraw.curpInvalid')}</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.street')}</span>
        <input
          type="text"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          className="border-2 border-tinta p-2 bg-white"
          autoComplete="address-line1"
          maxLength={200}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-bold">{tr('bankWithdraw.city')}</span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border-2 border-tinta p-2 bg-white"
            autoComplete="address-level2"
            maxLength={100}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-bold">{tr('bankWithdraw.postalCode')}</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={postalCode}
            onChange={(e) => setPostal(e.target.value.replace(/[^0-9]/g, ''))}
            className="border-2 border-tinta p-2 bg-white"
            maxLength={5}
          />
        </label>
      </div>

      {error && <p className="text-red-600 font-bold">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="min-h-12 bg-tinta text-crema font-bold disabled:opacity-50"
      >
        {submitting ? tr('bankWithdraw.sending') : tr('bankWithdraw.continueSelfie')}
      </button>

      <p className="text-xs opacity-70">{tr('bankWithdraw.kycFootnote')}</p>
    </form>
  );
}

// ---- Retiro: monto, cotizacion, firma y seguimiento ---------------------

type WithdrawStage =
  | { kind: 'idle' }
  | { kind: 'quoted'; quote: BankWithdrawQuote }
  | { kind: 'signing'; order: BankWithdrawOrder; quote: BankWithdrawQuote }
  | { kind: 'tracking'; orderId: string; status: BankWithdrawOrderSummary['status']; destinationMxn: string | null };

function useCountdown(targetIso?: string): number {
  const target = targetIso ? new Date(targetIso).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  return target ? Math.max(0, Math.floor((target - now) / 1000)) : 0;
}

function WithdrawForm({ userToken, clabeMasked }: { userToken: string; clabeMasked?: string }) {
  const [amount, setAmount] = useState('');
  const [stage, setStage] = useState<WithdrawStage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const quote = stage.kind === 'quoted' ? stage.quote : (stage.kind === 'signing' ? stage.quote : null);
  const secondsLeft = useCountdown(quote?.expiresAt);
  const expired = quote !== null && secondsLeft === 0;

  const amountOk = /^[0-9]+(\.[0-9]{1,7})?$/.test(amount) && Number(amount) > 0;

  const requestQuote = async () => {
    if (!amountOk) return;
    try {
      setBusy(true); setError(null);
      const q = await createBankWithdrawQuote(userToken, { asset: 'USDC', amount });
      setStage({ kind: 'quoted', quote: q });
    } catch (e) {
      setError(extractApiErrorPayload(e).message ?? tr('bankWithdraw.quoteError'));
    } finally { setBusy(false); }
  };

  const confirmAndSign = async () => {
    if (stage.kind !== 'quoted') return;
    const q = stage.quote;
    try {
      setBusy(true); setError(null);
      const pub = await getPublicKey();
      if (!pub) throw new Error(noKeyMessage());
      const [sourceCode, sourceIssuer] = q.sourceAsset.split(':');
      const sourceBalance = await getStellarAssetBalance(pub, { code: sourceCode, issuer: sourceIssuer });
      if (Number(sourceBalance) < Number(q.sourceAmount)) {
        throw new Error(tr('bankWithdraw.insufficientBalance', { balance: Number(sourceBalance).toFixed(2), needed: q.sourceAmount }));
      }

      const order = await confirmBankWithdrawOrder(userToken, q.quoteId);
      setStage({ kind: 'signing', order, quote: q });

      const dest = order.fundingInstructions?.destination;
      if (!order.preparedTransaction || !dest?.address) {
        throw new Error(tr('bankWithdraw.noTransaction'));
      }

      const expected: ExpectedBankWithdraw = {
        fromAddress: pub,
        toAddress: dest.address,
        memo: dest.memo ?? null,
        assetCode: order.swap.destinationAsset.code,
        assetIssuer: order.swap.destinationAsset.issuer ?? '',
        amount: order.swap.destinationAmount,
      };
      await signAndSubmitBankWithdrawPathPayment(order.preparedTransaction, expected, order.swap);

      setStage({
        kind: 'tracking',
        orderId: order.orderId,
        status: order.status,
        destinationMxn: q.destinationAmount,
      });
    } catch (e) {
      if (e instanceof WithdrawTxMismatchError) {
        setError(tr('bankWithdraw.txMismatch', { reason: e.reason }));
      } else {
        setError(extractApiErrorPayload(e).message ?? (e as Error).message);
      }
      setStage({ kind: 'idle' });
    } finally { setBusy(false); }
  };

  // Mientras hacemos seguimiento, consultamos /orders cada 10 s.
  useEffect(() => {
    if (stage.kind !== 'tracking') return;
    const orderId = stage.orderId;
    const t = setInterval(async () => {
      try {
        const orders = await fetchBankWithdrawOrders(userToken);
        const found = orders.find((o) => o.orderId === orderId);
        if (found) {
          setStage((s) => s.kind === 'tracking' && s.orderId === orderId
            ? { ...s, status: found.status, destinationMxn: found.destinationMxn ?? s.destinationMxn }
            : s);
        }
      } catch { /* seguimos intentando */ }
    }, 10_000);
    return () => clearInterval(t);
  }, [stage.kind === 'tracking' ? stage.orderId : null, userToken]);

  if (stage.kind === 'tracking') {
    const title = stage.status === 'completed'
      ? tr('bankWithdraw.arrived')
      : stage.status === 'failed' || stage.status === 'refunded' || stage.status === 'canceled'
        ? tr('bankWithdraw.failed')
        : tr('bankWithdraw.processing');
    const detail = stage.status === 'completed'
      ? tr('bankWithdraw.arrivedDetail', { amount: stage.destinationMxn ?? '--', account: clabeMasked ?? '' })
      : tr('bankWithdraw.statusDetail', { status: stage.status });
    return (
      <section className="p-4 border-2 border-naranja bg-naranja-suave">
        <h2 className="font-bold mb-2">{title}</h2>
        <p>{detail}</p>
      </section>
    );
  }

  return (
    <section className="p-4 border-2 border-tinta bg-crema flex flex-col gap-4">
      <h2 className="font-bold">{tr('bankWithdraw.withdrawTo', { account: clabeMasked ?? tr('bankWithdraw.yourAccount') })}</h2>

      <label className="flex flex-col gap-1">
        <span className="font-bold">{tr('bankWithdraw.amountUsdc')}</span>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          className="border-2 border-tinta p-2 bg-white"
          placeholder="0.00"
          disabled={stage.kind !== 'idle'}
        />
      </label>

      {stage.kind === 'idle' && (
        <button
          type="button"
          onClick={requestQuote}
          disabled={!amountOk || busy}
          className="min-h-12 bg-tinta text-crema font-bold disabled:opacity-50"
        >
          {busy ? tr('bankWithdraw.quoting') : tr('bankWithdraw.quote')}
        </button>
      )}

      {stage.kind === 'quoted' && (
        <div className="flex flex-col gap-3 border-2 border-tinta p-3 bg-naranja-suave">
          <p>{tr('bankWithdraw.youReceive')} <strong>${stage.quote.destinationAmount} MXN</strong></p>
          <p className="text-sm">{tr('bankWithdraw.conversion', { source: stage.quote.sourceAmount, funding: stage.quote.fundingAmount })}</p>
          <p className="text-sm">{tr('bankWithdraw.fee', { amount: stage.quote.feeAmount, asset: stage.quote.feeAsset.split(':')[0], percent: stage.quote.feeBps / 100 })}</p>
          <p className="text-sm">
            {expired
              ? tr('bankWithdraw.quoteExpired')
              : tr('bankWithdraw.quoteExpiresIn', { time: `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}` })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStage({ kind: 'idle' })}
              className="flex-1 min-h-12 border-2 border-tinta font-bold"
            >
              {tr('bankWithdraw.cancel')}
            </button>
            {expired ? (
              <button
                type="button"
                onClick={requestQuote}
                disabled={busy}
                className="flex-1 min-h-12 bg-tinta text-crema font-bold disabled:opacity-50"
              >
                {tr('bankWithdraw.newQuote')}
              </button>
            ) : (
              <button
                type="button"
                onClick={confirmAndSign}
                disabled={busy}
                className="flex-1 min-h-12 bg-tinta text-crema font-bold disabled:opacity-50"
              >
                {busy ? tr('bankWithdraw.signing') : tr('bankWithdraw.confirmSign')}
              </button>
            )}
          </div>
        </div>
      )}

      {stage.kind === 'signing' && (
        <p className="text-sm">{tr('bankWithdraw.signingNetwork')}</p>
      )}

      {error && <p className="text-red-600 font-bold">{error}</p>}
    </section>
  );
}
