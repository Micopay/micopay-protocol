import { useEffect, useState } from 'react';
import { getMerchantConfig, updateMerchantConfig, MerchantConfig } from '../services/api';
import { resolveErrorMessage } from '../constants/errorMap';

interface MerchantSettingsProps {
  token: string | null;
  onBack: () => void;
}

export default function MerchantSettings({ token, onBack }: MerchantSettingsProps) {
  const [form, setForm] = useState({ rate_percent: 1, min_trade_mxn: 100, max_trade_mxn: 50000, daily_cap_mxn: 250000 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | 'warning' | null>(null);
  const offlineQueue = useOfflineQueue(token);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const data = await getMerchantConfig(token);
        setForm(data);
      } catch (err: any) {
        setMessage(resolveErrorMessage(err).message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    setMessageType(null);
    try {
      const result = await updateMerchantConfigWithOfflineSupport(
        token,
        form,
        offlineQueue.queueMutationAsync,
      );
      
      setForm(result.config);
      
      if (result.queued) {
        setMessage('⏳ Cambios guardados localmente. Se sincronizarán cuando la conexión se restaure.');
        setMessageType('warning');
      } else {
        setMessage('✅ Configuración guardada exitosamente. El límite diario se reinicia a las 00:00 UTC.');
        setMessageType('success');
      }
    } catch (err: any) {
      setMessage(resolveErrorMessage(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen px-6 pt-10 pb-32 max-w-xl mx-auto">
      <button className="mb-6 text-sm font-semibold text-primary" onClick={onBack}>← Volver</button>
      <h1 className="text-2xl font-bold mb-2">Ajustes del comerciante</h1>
      <p className="text-sm text-on-surface-variant mb-8">Configura tu tasa y límites de operación.</p>

      {loading ? <p>Cargando…</p> : (
        <div className="space-y-5">
          <Field label="Tasa (%)" value={form.rate_percent} step="0.1" onChange={(v) => setForm((f) => ({ ...f, rate_percent: Number(v) }))} />
          <Field label="Monto mínimo (MXN)" value={form.min_trade_mxn} onChange={(v) => setForm((f) => ({ ...f, min_trade_mxn: Number(v) }))} />
          <Field label="Monto máximo (MXN)" value={form.max_trade_mxn} onChange={(v) => setForm((f) => ({ ...f, max_trade_mxn: Number(v) }))} />
          <Field label="Tope diario (MXN)" value={form.daily_cap_mxn} onChange={(v) => setForm((f) => ({ ...f, daily_cap_mxn: Number(v) }))} />

          <button
            className="w-full rounded-xl bg-primary text-white font-semibold py-3 disabled:opacity-60"
            disabled={saving || !token || offlineQueue.isSyncing}
            onClick={save}
          >
            {saving ? 'Guardando…' : offlineQueue.isSyncing ? 'Sincronizando...' : 'Guardar cambios'}
          </button>

          {message && (
            <p className={`text-sm font-medium p-3 rounded ${
              messageType === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
              messageType === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
              'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, step = '1' }: { label: string; value: number; onChange: (v: string) => void; step?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-2">{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 px-4 py-3"
      />
    </label>
  );
}
