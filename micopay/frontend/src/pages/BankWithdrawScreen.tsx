import { useCallback, useEffect, useState } from 'react';
import {
  fetchBankWithdrawStatus,
  registerBankAccount,
  startBankKyc,
  type BankKycLaunchForm,
  type BankWithdrawStatusResponse,
  type StartBankKycRequest,
} from '../services/api';
import { extractApiErrorPayload } from '../utils/apiError';

interface BankWithdrawScreenProps {
  onBack: () => void;
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

export default function BankWithdrawScreen({ onBack, userToken }: BankWithdrawScreenProps) {
  const [status, setStatus] = useState<BankWithdrawStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const s = await fetchBankWithdrawStatus(userToken);
      setStatus(s);
    } catch (e) {
      setError(extractApiErrorPayload(e).message ?? 'No pudimos cargar tu estado');
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => { refresh(); }, [refresh]);

  // Si estamos esperando revision de Etherfuse, consultamos cada 10 s por si
  // ya aprobaron (el webhook escribe en la base, pero esto evita que el
  // usuario tenga que cerrar y abrir).
  useEffect(() => {
    if (status?.stage !== 'kyc_review') return;
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [status?.stage, refresh]);

  return (
    <div className="min-h-screen bg-crema text-tinta flex flex-col">
      <header className="flex items-center gap-3 p-4 border-b-2 border-tinta">
        <button onClick={onBack} className="font-bold" aria-label="Atras">←</button>
        <h1 className="font-bold text-lg">Retirar a banco</h1>
      </header>

      <main className="flex-1 p-4 flex flex-col gap-4">
        {loading && <p>Cargando…</p>}
        {!loading && error && (
          <div className="p-4 border-2 border-tinta bg-amarillo">
            <p className="font-bold">{error}</p>
            <button onClick={refresh} className="mt-2 underline">Reintentar</button>
          </div>
        )}
        {!loading && !error && status && (
          <StageView status={status} userToken={userToken} onChanged={refresh} />
        )}
      </main>
    </div>
  );
}

function StageView({
  status, userToken, onChanged,
}: { status: BankWithdrawStatusResponse; userToken: string; onChanged: () => void }) {
  switch (status.stage) {
    case 'needs_didit':
      return (
        <section className="p-4 border-2 border-tinta bg-crema">
          <h2 className="font-bold mb-2">Verifica tu identidad</h2>
          <p className="mb-4">
            Antes de retirar a tu banco necesitas verificar tu identidad. Es el
            mismo proceso de Didit que usamos para pagar entre personas.
          </p>
          <p className="text-sm opacity-70">Vuelve aqui cuando este listo.</p>
        </section>
      );
    case 'needs_kyc':
      return <KycForm userToken={userToken} onDone={onChanged} />;
    case 'kyc_review':
      return (
        <section className="p-4 border-2 border-tinta bg-amarillo">
          <h2 className="font-bold mb-2">En revisión</h2>
          <p>
            Etherfuse esta revisando tus datos. Esto suele tomar minutos.
            {status.kycMessage ? ` ${status.kycMessage}` : ''}
          </p>
        </section>
      );
    case 'needs_bank':
      return <BankAccountForm userToken={userToken} onDone={onChanged} />;
    case 'ready':
      return (
        <section className="p-4 border-2 border-tinta bg-crema">
          <h2 className="font-bold mb-2">Listo para retirar</h2>
          <p>
            Tu cuenta: {status.clabeMasked ?? '•••'}. En el siguiente paso
            escribes cuanto USDC quieres cambiar y los MXN te llegan por SPEI.
          </p>
          <p className="mt-4 text-sm opacity-70">(Pantalla de retiro proxima)</p>
        </section>
      );
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
      setError(extractApiErrorPayload(e).message ?? 'No pudimos registrar la cuenta');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 border-2 border-tinta bg-crema flex flex-col gap-4">
      <h2 className="font-bold">Tu cuenta de banco</h2>

      <label className="flex flex-col gap-1">
        <span className="font-bold">CLABE (18 dígitos)</span>
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
                ? `✓ ${banco ?? 'banco desconocido'}`
                : '✗ el dígito de control no coincide'}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">Nombre del titular</span>
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
        <span className="font-bold">RFC del titular</span>
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
        {submitting ? 'Guardando…' : 'Guardar cuenta'}
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

const RFC_RE = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

function KycForm({ userToken, onDone }: { userToken: string; onDone: () => void }) {
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [rfc, setRfc] = useState('');
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
      setError(extractApiErrorPayload(e).message ?? 'No pudimos iniciar el KYC');
    } finally {
      setSubmitting(false);
    }
  };

  if (launched) {
    return (
      <section className="p-4 border-2 border-tinta bg-amarillo flex flex-col gap-3">
        <h2 className="font-bold">Abrimos el verificador</h2>
        <p>
          Haz la selfie y acepta el contrato en la pestana que se abrio.
          Cuando termines, regresa aqui: en unos segundos esta pantalla
          cambia sola.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="p-4 border-2 border-tinta bg-crema flex flex-col gap-3">
      <h2 className="font-bold">Un paso para habilitar el retiro</h2>
      <p className="text-sm">
        Etherfuse pide estos datos la primera vez. Despues de guardarlos
        abriremos su pagina para que te tomes una selfie y aceptes su
        contrato.
      </p>

      <label className="flex flex-col gap-1">
        <span className="font-bold">Nombre completo (como en tu INE)</span>
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
        <span className="font-bold">Fecha de nacimiento</span>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="border-2 border-tinta p-2 bg-white"
          max={new Date(Date.now() - 568_000_000_000).toISOString().slice(0, 10) /* ~18 anos */}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">RFC con homoclave</span>
        <input
          type="text"
          value={rfc}
          onChange={(e) => setRfc(e.target.value.toUpperCase())}
          className="border-2 border-tinta p-2 bg-white uppercase"
          maxLength={13}
          placeholder="HEGL900101AB1"
        />
        {rfc.length > 0 && !RFC_RE.test(rfc.trim().toUpperCase()) && (
          <span className="text-sm">El RFC debe tener 12 o 13 caracteres (4 letras, 6 numeros, 3 alfanumericos).</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-bold">Correo</span>
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
        <span className="font-bold">Calle y numero</span>
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
          <span className="font-bold">Ciudad</span>
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
          <span className="font-bold">CP (opcional)</span>
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
        {submitting ? 'Enviando…' : 'Continuar con la selfie'}
      </button>

      <p className="text-xs opacity-70">
        Los datos van directo a Etherfuse. La constancia de situacion fiscal
        se pedira dentro de su pagina si la necesitan.
      </p>
    </form>
  );
}
