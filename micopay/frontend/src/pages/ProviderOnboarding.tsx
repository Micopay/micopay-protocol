/**
 * Incorporacion de agente: alta, no comprension.
 *
 * Al terminar esto, el servidor tiene datos nuevos y esta persona es visible
 * para desconocidos en un mapa publico. Por eso, a diferencia del onboarding de
 * persona, cada paso aqui corresponde a un hecho verificable y la elegibilidad
 * la decide el servidor (`/merchants/me/readiness`), no la app.
 *
 * Reglas que la pantalla respeta y que vienen de RED-1:
 *
 *   · Unirse NO es activarse. Unirse deja la cuenta pendiente.
 *   · Activarse NO es ponerse disponible. Empezar a recibir operaciones es una
 *     tercera decision consciente.
 *   · La lista no se cachea como verdad: se relee del servidor al volver, para
 *     que el progreso sobreviva a cerrar la app y no dependa del telefono.
 *   · Ser agente no es un modo permanente: se puede seguir pidiendo cash-out
 *     como cliente sin cambiar nada.
 */

import { useCallback, useEffect, useState } from 'react';
import OnboardingFlow, {
  StepText,
  StepPoint,
  ChecklistItem,
  type OnboardingStep,
} from '../components/onboarding/OnboardingFlow';
import {
  enrollAsProvider,
  fetchProviderReadiness,
  activateProvider,
  type ProviderReadiness,
} from '../services/api';

interface Props {
  token: string;
  onExit: () => void;
  /** Lleva a la verificación de identidad (Didit). */
  onOpenKyc: () => void;
  /** Lleva a los ajustes de agente: zona, comisión y límites. */
  onOpenSettings: () => void;
  /** Se llama cuando la persona queda activa, para refrescar la sesión. */
  onActivated?: () => void;
}

const ITEM_TITLES: Record<string, string> = {
  kyc: 'Verifica tu identidad',
  location: 'Indica tu zona',
  limits: 'Fija tu comisión y tus montos',
};

export default function ProviderOnboarding({
  token,
  onExit,
  onOpenKyc,
  onOpenSettings,
  onActivated,
}: Props) {
  const [index, setIndex] = useState(0);
  const [readiness, setReadiness] = useState<ProviderReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La verdad la manda el servidor, y se relee cada vez que se vuelve a esta
  // pantalla: si la persona completo el KYC en otra parte, aqui se refleja sin
  // que tenga que reiniciar nada.
  const refresh = useCallback(async () => {
    try {
      setReadiness(await fetchProviderReadiness(token));
      setError(null);
    } catch {
      setError('No pudimos consultar tu estado. Revisa tu conexión.');
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Al volver de KYC o de ajustes (la app queda en segundo plano) se recarga:
  // sin esto la lista muestra un estado viejo y la persona cree que fallo.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const status = readiness?.status ?? 'not_enrolled';

  const handleEnroll = async () => {
    setBusy(true);
    try {
      setReadiness(await enrollAsProvider(token));
      setError(null);
      setIndex((i) => i + 1);
    } catch (err) {
      setError(messageFrom(err, 'No pudimos iniciar tu alta. Inténtalo de nuevo.'));
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async () => {
    setBusy(true);
    try {
      const next = await activateProvider(token);
      setReadiness(next);
      setError(null);
      onActivated?.();
      setIndex((i) => i + 1);
    } catch (err) {
      // La activación falla cerrada en el servidor. Si llega aquí es que la
      // lista cambió por debajo, así que se recarga en vez de insistir.
      setError(messageFrom(err, 'Todavía te faltan pasos para activarte.'));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const steps: OnboardingStep[] = [
    {
      id: 'what',
      title: 'Únete a Red MicoPay',
      lead: 'Da efectivo a quien lo necesita y gana una comisión por hacerlo.',
      body: (
        <>
          <StepText>
            Los agentes son quienes hacen posible el efectivo en MicoPay. Cuando alguien cerca de
            ti quiere convertir cripto a billetes, tú se los entregas en mano y recibes cripto más
            tu comisión.
          </StepText>
          <StepPoint icon="storefront">
            <strong>No necesitas tener un negocio.</strong> Puede ser una tienda, un puesto o una
            persona. No pedimos papeles de empresa.
          </StepPoint>
          <StepPoint icon="tune">
            Tú decides <strong>tu comisión, tus montos y tu horario</strong>. Nadie te asigna
            operaciones: aceptas las que quieras.
          </StepPoint>
          <StepPoint icon="swap_horiz">
            Seguirás usando MicoPay como siempre.{' '}
            <strong>Ser agente no te encierra en un modo aparte</strong>: puedes pedir un cash-out
            como cliente cuando quieras.
          </StepPoint>
        </>
      ),
      nextLabel: status === 'not_enrolled' ? 'Quiero unirme' : 'Continuar',
    },
    {
      id: 'expect',
      title: 'Lo que implica',
      lead: 'Conviene saberlo antes, no después.',
      body: (
        <>
          <StepPoint icon="badge">
            Tendrás que <strong>verificar tu identidad</strong>. No es opcional: manejar efectivo a
            cambio de activos digitales lo exige la ley desde el primer peso.
          </StepPoint>
          <StepPoint icon="location_on">
            Publicaremos <strong>tu zona</strong>, no tu dirección. El punto exacto de encuentro
            solo lo ve la otra persona cuando ya hay una operación en marcha, y deja de verlo
            cuando termina.
          </StepPoint>
          <StepPoint icon="account_balance_wallet">
            Necesitas <strong>tener efectivo disponible</strong> cuando aceptes una operación. Si
            no lo tienes, ponte en pausa: se hace con un toque.
          </StepPoint>
          <StepPoint icon="schedule">
            Quedarás con desconocidos en persona. Elige un{' '}
            <strong>lugar público y concurrido</strong>.
          </StepPoint>
        </>
      ),
    },
    {
      id: 'checklist',
      title: 'Lo que falta',
      lead: 'Puedes salir y volver: tu avance se guarda.',
      body: (
        <>
          {!readiness && !error && <StepText>Consultando tu estado…</StepText>}
          {readiness?.items.map((item) => (
            <ChecklistItem
              key={item.key}
              done={item.done}
              title={ITEM_TITLES[item.key] ?? item.key}
              detail={item.detail}
              actionLabel={item.key === 'kyc' ? 'Verificarme' : 'Configurar'}
              onAction={item.key === 'kyc' ? onOpenKyc : onOpenSettings}
            />
          ))}
          {readiness && !readiness.can_activate && (
            <StepText>
              Cuando completes los tres puntos podrás activarte. Si acabas de terminar alguno,
              vuelve a esta pantalla para actualizarlo.
            </StepText>
          )}
        </>
      ),
      nextLabel: 'Activarme como agente',
      // La app no deduce la elegibilidad sumando casillas: usa la decisión del
      // servidor, que es quien la va a aplicar de todos modos.
      canAdvance: readiness?.can_activate === true || status === 'active',
      blockedReason:
        status === 'suspended'
          ? 'Tu cuenta está suspendida. Escríbenos para revisarlo.'
          : 'Completa los puntos pendientes para activarte.',
    },
    {
      id: 'done',
      title: '¡Ya eres agente!',
      lead: 'Falta un último paso, y lo decides tú.',
      body: (
        <>
          <StepText>
            Ya perteneces a Red MicoPay, pero <strong>todavía no apareces en el mapa</strong>. Nos
            pareció más honesto no publicarte de golpe: tú eliges cuándo empiezas.
          </StepText>
          <StepPoint icon="toggle_on">
            Cuando tengas efectivo a la mano, ponte <strong>disponible</strong> desde tu perfil y
            empezarás a recibir solicitudes.
          </StepPoint>
          <StepPoint icon="pause_circle">
            Ponte en <strong>pausa</strong> cuando no puedas atender. Seguirás siendo agente; solo
            dejas de aparecer.
          </StepPoint>
        </>
      ),
      nextLabel: 'Ir a mi perfil',
    },
  ];

  const handleFinish = () => onExit();

  const handleIndexChange = (next: number) => {
    // Avanzar desde el primer paso ES el alta. Se hace aquí para que unirse sea
    // un acto explícito de la persona y no un efecto de abrir la pantalla.
    if (next === 1 && index === 0 && status === 'not_enrolled') {
      void handleEnroll();
      return;
    }
    if (next === 3 && index === 2 && status !== 'active') {
      void handleActivate();
      return;
    }
    setIndex(next);
  };

  return (
    <>
      {error && (
        <div
          role="alert"
          className="bg-error/10 border-b-2 border-error px-6 py-3 text-sm font-bold text-error"
        >
          {error}
        </div>
      )}
      <OnboardingFlow
        steps={steps}
        index={index}
        onIndexChange={handleIndexChange}
        onFinish={handleFinish}
        onExit={onExit}
        busy={busy}
      />
    </>
  );
}

function messageFrom(err: unknown, fallback: string): string {
  const res = (err as { response?: { data?: { message?: string } } })?.response;
  return res?.data?.message || fallback;
}
