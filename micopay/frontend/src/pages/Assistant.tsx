import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import i18n from '../i18n';
import { useWalletBalance } from '../hooks/useWalletBalance';
import {
  getActiveTrades,
  getMerchantsAvailable,
  getTradeHistory,
  getUsdcMxnRate,
  getXlmMxnRate,
  type AvailableMerchant,
  type TradeData,
  type TradeHistoryItem,
} from '../services/api';
import { detectIntent, type AssistantIntent } from '../lib/assistant/intents';
import {
  speak,
  startListening,
  stopSpeaking,
  voiceCapabilities,
  type ListenHandle,
} from '../lib/voice';
import { SUPPORT_EMAIL } from '../constants/contact';

/**
 * Asistente dentro de MicoPay: chat y voz, sin mensajeria externa.
 *
 * LO QUE ESTE ASISTENTE ES, Y LO QUE NO
 * -------------------------------------
 * Es una capa de guia y consulta sobre la API que ya existe. Puede leer saldo,
 * tasa, operaciones y agentes, y puede llevar a la pantalla correcta. No firma,
 * no libera, no revela la llave y no mueve dinero: eso sigue pasando por
 * `requireUserPresence` en la pantalla de la operacion, con huella o PIN.
 *
 * La voz usa el plugin nativo en el APK y la Web Speech API en el navegador.
 * Si el dispositivo no puede escuchar, el microfono se desactiva y el teclado
 * sigue funcionando. Nunca se simula que escucho.
 */

interface AssistantAction {
  id: string;
  labelKey: string;
  kind: 'navigate' | 'mailto' | 'prompt';
  value: string;
}

interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: AssistantAction[];
  error?: boolean;
}

const STATUS_KEYS: Record<string, string> = {
  pending: 'assistant.statusPending',
  locked: 'assistant.statusLocked',
  revealing: 'assistant.statusRevealing',
  completed: 'assistant.statusCompleted',
  cancelled: 'assistant.statusCancelled',
  refunded: 'assistant.statusRefunded',
};

const SUGGESTIONS = [
  'assistant.suggestionRate',
  'assistant.suggestionBalance',
  'assistant.suggestionTrades',
  'assistant.suggestionMerchants',
  'assistant.suggestionDeposit',
  'assistant.suggestionCashout',
];

const locale = () => (i18n.language === 'en' ? 'en-US' : 'es-MX');

const isAffirmative = (text: string) =>
  /^(si|yes|dale|ok|va|adelante|claro)$/i.test(
    text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  );

async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        const requested = await Geolocation.requestPermissions();
        if (requested.location !== 'granted') return null;
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 8000,
      });
      return { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch {
      return null;
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}

interface AssistantProps {
  token: string | null;
}

const Assistant = ({ token }: AssistantProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tokens, stellarAddress, loading: balanceLoading } = useWalletBalance();

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState({ recognition: true, synthesis: true });
  const [pendingAction, setPendingAction] = useState<AssistantAction | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const listenHandleRef = useRef<ListenHandle | null>(null);
  const handleSendRef = useRef<(text: string) => void>(() => {});
  const voiceOnRef = useRef(false);
  const greetedRef = useRef(false);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
    if (!voiceOn) void stopSpeaking();
  }, [voiceOn]);

  useEffect(() => {
    voiceCapabilities()
      .then(setVoiceAvailable)
      .catch(() => setVoiceAvailable({ recognition: false, synthesis: false }));
  }, []);

  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    setMessages([
      {
        id: 'greeting',
        role: 'assistant',
        text: t('assistant.greeting'),
      },
    ]);
  }, [t]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking, listening]);

  useEffect(
    () => () => {
      void listenHandleRef.current?.stop();
      void stopSpeaking();
    },
    [],
  );

  const formatMoney = (amount: number) =>
    amount.toLocaleString(locale(), { maximumFractionDigits: 0 });

  const statusLabel = (status: string) => t(STATUS_KEYS[status] ?? 'assistant.statusPending');

  const describeTrade = (trade: Pick<TradeData | TradeHistoryItem, 'amount_mxn' | 'status'>) =>
    `${formatMoney(trade.amount_mxn)} MXN · ${statusLabel(trade.status)}`;

  const speakIfVoice = (text: string) => {
    if (voiceOnRef.current) void speak(text, locale());
  };

  const pushMessage = (role: AssistantMessage['role'], text: string, actions?: AssistantAction[], error = false) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role,
        text,
        actions,
        error,
      },
    ]);
  };

  const pushAssistant = (text: string, actions?: AssistantAction[]) => {
    pushMessage('assistant', text, actions);
    speakIfVoice(text);
  };

  const offer = (text: string, action: AssistantAction) => {
    setPendingAction(action);
    pushAssistant(text, [action]);
  };

  const handleAction = (action: AssistantAction) => {
    setPendingAction(null);
    if (action.kind === 'navigate') {
      navigate(action.value);
      return;
    }
    if (action.kind === 'prompt') {
      void handleSend(action.value);
    }
  };

  const describeMerchant = (merchant: AvailableMerchant) =>
    `${merchant.username} (${merchant.distance_km.toFixed(1)} km)`;

  const respond = async (intent: AssistantIntent) => {
    switch (intent.id) {
      case 'greeting':
      case 'help':
        pushAssistant(t(intent.id === 'help' ? 'assistant.help' : 'assistant.greeting'), [
          { id: 'rate', labelKey: 'assistant.suggestionRate', kind: 'prompt', value: t('assistant.suggestionRate') },
          { id: 'balance', labelKey: 'assistant.suggestionBalance', kind: 'prompt', value: t('assistant.suggestionBalance') },
          { id: 'trades', labelKey: 'assistant.suggestionTrades', kind: 'prompt', value: t('assistant.suggestionTrades') },
        ]);
        return;

      case 'rate': {
        const asset = intent.asset ?? 'XLM';
        try {
          const quote = asset === 'USDC' ? await getUsdcMxnRate() : await getXlmMxnRate();
          const rate = Number(quote.rate).toLocaleString(locale(), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const stale = quote.stale ? t('assistant.rateStale') : '';
          pushAssistant(t('assistant.rateReply', { asset, rate }) + stale);
        } catch {
          pushAssistant(t('assistant.rateError'));
        }
        return;
      }

      case 'balance': {
        if (balanceLoading) {
          pushAssistant(t('assistant.balanceLoading'));
          return;
        }
        if (!stellarAddress) {
          pushAssistant(t('assistant.balanceNoWallet'));
          return;
        }
        const balances = tokens.length
          ? tokens
              .map((token) => `${token.balance.toLocaleString(locale(), { maximumFractionDigits: 7 })} ${token.code}`)
              .join(' · ')
          : '—';
        pushAssistant(t('assistant.balanceReply', { balances }));
        return;
      }

      case 'active_trades': {
        if (!token) {
          pushAssistant(t('assistant.needLogin'));
          return;
        }
        try {
          const trades = await getActiveTrades(token);
          if (!trades.length) {
            pushAssistant(t('assistant.noActiveTrades'), [
              { id: 'history', labelKey: 'assistant.actionHistory', kind: 'navigate', value: '/history' },
            ]);
            return;
          }
          const list = trades.slice(0, 3).map(describeTrade).join('; ');
          pushAssistant(t('assistant.activeTrades', { count: trades.length, list }), [
            { id: 'open', labelKey: 'assistant.actionTrade', kind: 'navigate', value: `/trade/${trades[0].id}` },
            { id: 'history', labelKey: 'assistant.actionHistory', kind: 'navigate', value: '/history' },
          ]);
        } catch {
          pushAssistant(t('assistant.historyError'));
        }
        return;
      }

      case 'history': {
        if (!token) {
          pushAssistant(t('assistant.needLogin'));
          return;
        }
        try {
          const trades = await getTradeHistory(token);
          if (!trades.length) {
            pushAssistant(t('assistant.noHistory'));
            return;
          }
          const list = trades.slice(0, 3).map(describeTrade).join('; ');
          pushAssistant(t('assistant.historyReply', { list }), [
            { id: 'history', labelKey: 'assistant.actionHistory', kind: 'navigate', value: '/history' },
          ]);
        } catch {
          pushAssistant(t('assistant.historyError'));
        }
        return;
      }

      case 'merchants': {
        const position = await currentPosition();
        if (!position) {
          offer(t('assistant.merchantsNoLocation'), {
            id: 'map',
            labelKey: 'assistant.actionMap',
            kind: 'navigate',
            value: '/map',
          });
          return;
        }
        try {
          const merchants = await getMerchantsAvailable({
            lat: position.lat,
            lng: position.lng,
            radius_km: 5,
            amount_mxn: intent.amountMxn ?? 500,
          });
          if (!merchants.length) {
            offer(t('assistant.noMerchants'), {
              id: 'map',
              labelKey: 'assistant.actionMap',
              kind: 'navigate',
              value: '/map',
            });
            return;
          }
          const list = merchants.slice(0, 3).map(describeMerchant).join('; ');
          pushAssistant(t('assistant.merchantsReply', { list }), [
            { id: 'map', labelKey: 'assistant.actionMap', kind: 'navigate', value: '/map' },
          ]);
        } catch {
          pushAssistant(t('assistant.merchantsError'));
        }
        return;
      }

      case 'deposit':
        offer(t('assistant.deposit'), {
          id: 'deposit',
          labelKey: 'assistant.actionDeposit',
          kind: 'navigate',
          value: '/deposit',
        });
        return;

      case 'cashout':
        offer(t('assistant.cashout'), {
          id: 'cashout',
          labelKey: 'assistant.actionCashout',
          kind: 'navigate',
          value: '/cashout',
        });
        return;

      case 'send':
        offer(t('assistant.send'), {
          id: 'send',
          labelKey: 'assistant.actionSend',
          kind: 'navigate',
          value: '/pay/send',
        });
        return;

      case 'receive':
        offer(t('assistant.receive'), {
          id: 'receive',
          labelKey: 'assistant.actionReceive',
          kind: 'navigate',
          value: '/pay/receive',
        });
        return;

      case 'kyc':
        offer(t('assistant.kyc'), {
          id: 'kyc',
          labelKey: 'assistant.actionKyc',
          kind: 'navigate',
          value: '/kyc/didit',
        });
        return;

      case 'support': {
        if (!token) {
          pushAssistant(t('assistant.support', { email: SUPPORT_EMAIL }), [
            {
              id: 'mail',
              labelKey: 'assistant.actionSupport',
              kind: 'mailto',
              value: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Soporte MicoPay')}`,
            },
          ]);
          return;
        }
        try {
          const trades = await getActiveTrades(token);
          if (trades.length) {
            const trade = trades[0];
            pushAssistant(
              t('assistant.supportWithTrade', { id: trade.id.slice(0, 8), email: SUPPORT_EMAIL }),
              [
                {
                  id: 'trade',
                  labelKey: 'assistant.actionTrade',
                  kind: 'navigate',
                  value: `/trade/${trade.id}`,
                },
                {
                  id: 'mail',
                  labelKey: 'assistant.actionSupport',
                  kind: 'mailto',
                  value: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Soporte MicoPay')}`,
                },
              ],
            );
            return;
          }
        } catch {
          // Sin operaciones legibles, el correo sigue siendo la salida.
        }
        pushAssistant(t('assistant.support', { email: SUPPORT_EMAIL }), [
          {
            id: 'mail',
            labelKey: 'assistant.actionSupport',
            kind: 'mailto',
            value: `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Soporte MicoPay')}`,
          },
          { id: 'history', labelKey: 'assistant.actionHistory', kind: 'navigate', value: '/history' },
        ]);
        return;
      }

      case 'security':
        pushAssistant(t('assistant.security'));
        return;

      case 'cancel':
        setPendingAction(null);
        void stopSpeaking();
        pushAssistant(t('assistant.cancel'));
        return;

      default:
        pushAssistant(t('assistant.unknown'), [
          { id: 'rate', labelKey: 'assistant.suggestionRate', kind: 'prompt', value: t('assistant.suggestionRate') },
          { id: 'balance', labelKey: 'assistant.suggestionBalance', kind: 'prompt', value: t('assistant.suggestionBalance') },
          { id: 'help', labelKey: 'assistant.actionHelp', kind: 'prompt', value: t('assistant.actionHelp') },
        ]);
    }
  };

  const handleSend = async (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;

    pushMessage('user', text);
    setInput('');
    setThinking(true);

    try {
      if (pendingAction && isAffirmative(text)) {
        const action = pendingAction;
        setPendingAction(null);
        pushAssistant(t('assistant.confirmYes'));
        handleAction(action);
        return;
      }
      await respond(detectIntent(text));
    } catch {
      pushAssistant(t('assistant.unknown'));
    } finally {
      setThinking(false);
    }
  };

  handleSendRef.current = handleSend;

  const toggleVoice = () => {
    setVoiceOn((prev) => !prev);
  };

  const handleMic = async () => {
    if (listening) {
      await listenHandleRef.current?.stop();
      listenHandleRef.current = null;
      setListening(false);
      return;
    }

    if (!voiceAvailable.recognition) {
      pushAssistant(t('assistant.voiceUnavailable'));
      return;
    }

    setVoiceOn(true);
    setListening(true);
    try {
      const handle = await startListening({
        lang: locale(),
        onPartial: (text) => setInput(text),
        onResult: (text) => {
          setListening(false);
          setInput('');
          void handleSendRef.current(text);
        },
        onError: (code) => {
          setListening(false);
          pushAssistant(
            code === 'not-allowed' || code === 'MIC_PERMISSION_DENIED'
              ? t('assistant.micDenied')
              : t('assistant.speechError'),
          );
        },
      });
      listenHandleRef.current = handle;
    } catch (error) {
      setListening(false);
      const code = error instanceof Error ? error.message : '';
      pushAssistant(
        code === 'MIC_PERMISSION_DENIED' ? t('assistant.micDenied') : t('assistant.voiceUnavailable'),
      );
    }
  };

  const showSuggestions = !thinking;

  return (
    <div className="flex min-h-screen flex-col bg-surface font-body text-on-surface">
      <header className="fixed left-0 top-0 z-50 flex w-full items-center justify-between border-b-2 border-tinta bg-papel px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('assistant.back')}
            className="flex min-h-12 min-w-12 items-center justify-center rounded-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta"
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              arrow_back
            </span>
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="material-symbols-outlined flex h-10 w-10 items-center justify-center rounded-sm border-2 border-tinta bg-verde text-papel"
            >
              smart_toy
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-headline text-lg font-extrabold leading-tight">
                {t('assistant.title')}
              </h1>
              <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-gris">
                {t('assistant.subtitle')}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={toggleVoice}
          aria-label={voiceOn ? t('assistant.voiceDisable') : t('assistant.voiceEnable')}
          aria-pressed={voiceOn}
          className={`flex min-h-12 min-w-12 items-center justify-center rounded-sm border-2 border-tinta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta ${
            voiceOn ? 'bg-verde text-papel' : 'bg-papel text-tinta'
          }`}
        >
          <span aria-hidden="true" className="material-symbols-outlined">
            {voiceOn ? 'volume_up' : 'volume_off'}
          </span>
        </button>
      </header>

      <main
        role="log"
        aria-live="polite"
        aria-label={t('assistant.title')}
        className="mt-[5.5rem] flex-1 px-4 pb-44"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((message) => {
            const own = message.role === 'user';
            return (
              <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-sm border-2 px-3 py-2 shadow-solida-sm ${
                    own
                      ? 'border-tinta bg-tinta text-papel'
                      : message.error
                        ? 'border-error bg-papel text-error'
                        : 'border-tinta bg-papel text-tinta'
                  }`}
                >
                  <p className="whitespace-pre-line text-sm leading-relaxed">{message.text}</p>

                  {!own && message.actions?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.actions.map((action) =>
                        action.kind === 'mailto' ? (
                          <a
                            key={action.id}
                            href={action.value}
                            className="inline-flex min-h-12 items-center gap-1 rounded-sm border-2 border-tinta bg-verde px-3 text-xs font-bold text-papel shadow-solida-xs active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            {t(action.labelKey)}
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                              arrow_forward
                            </span>
                          </a>
                        ) : (
                          <button
                            key={action.id}
                            onClick={() => handleAction(action)}
                            className="inline-flex min-h-12 items-center gap-1 rounded-sm border-2 border-tinta bg-verde px-3 text-xs font-bold text-papel shadow-solida-xs active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            {t(action.labelKey)}
                            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                              arrow_forward
                            </span>
                          </button>
                        ),
                      )}
                    </div>
                  ) : null}

                  {!own && voiceAvailable.synthesis ? (
                    <button
                      onClick={() => void speak(message.text, locale())}
                      aria-label={t('assistant.listen')}
                      className="mt-2 inline-flex min-h-12 items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gris"
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-[16px]">
                        volume_up
                      </span>
                      {t('assistant.listen')}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {thinking ? (
            <div className="flex justify-start">
              <div className="rounded-sm border-2 border-tinta bg-papel px-3 py-2 text-sm text-gris shadow-solida-sm">
                {t('assistant.thinking')}
              </div>
            </div>
          ) : null}

          {showSuggestions ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((key) => (
                <button
                  key={key}
                  onClick={() => void handleSend(t(key))}
                  className="min-h-12 rounded-sm border-2 border-tinta bg-papel px-3 text-xs font-bold text-tinta shadow-solida-xs active:translate-x-[1px] active:translate-y-[1px]"
                >
                  {t(key)}
                </button>
              ))}
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 z-50 w-full border-t-2 border-tinta bg-papel px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {listening ? (
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-verde">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-verde" />
            {t('assistant.listening')}
          </div>
        ) : null}

        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend(input);
              }
            }}
            aria-label={t('assistant.inputLabel')}
            placeholder={t('assistant.placeholder')}
            className="min-h-12 flex-1 rounded-sm border-2 border-tinta bg-papel px-3 text-sm text-tinta outline-none focus-visible:ring-2 focus-visible:ring-verde"
          />
          <button
            onClick={() => void handleMic()}
            aria-label={listening ? t('assistant.micStop') : t('assistant.mic')}
            aria-pressed={listening}
            disabled={!voiceAvailable.recognition}
            className={`flex min-h-12 min-w-12 items-center justify-center rounded-sm border-2 border-tinta shadow-solida-xs active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40 ${
              listening ? 'bg-naranja text-papel' : 'bg-papel text-tinta'
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              {listening ? 'stop_circle' : 'mic'}
            </span>
          </button>
          <button
            onClick={() => void handleSend(input)}
            aria-label={t('assistant.sendAction')}
            disabled={!input.trim() || thinking}
            className="flex min-h-12 min-w-12 items-center justify-center rounded-sm border-2 border-tinta bg-verde text-papel shadow-solida-xs active:translate-x-[1px] active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span aria-hidden="true" className="material-symbols-outlined">
              send
            </span>
          </button>
        </div>

        {!voiceAvailable.recognition ? (
          <p className="mx-auto mt-2 max-w-2xl text-[11px] font-semibold text-gris">
            {t('assistant.voiceUnavailable')}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default Assistant;
