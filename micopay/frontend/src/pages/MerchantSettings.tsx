import { useEffect, useState } from 'react';
import { getMerchantConfig, updateMerchantConfigWithOfflineSupport, MerchantConfig } from '../services/api';
import { useOfflineQueue } from '../hooks/useOfflineQueue';

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
        setMessage(err?.response?.data?.message ?? 'No se pudo cargar la configuración');
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
      const errorMsg = err?.response?.data?.message ?? err?.message ?? 'No se pudo guardar la configuración';
      setMessage(errorMsg);
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen px-6 pt-10 pb-32 max-w-xl mx-auto">
      <button className="mb-6 text-sm font-semibold text-primary" onClick={onBack}>← Volver</button>
      
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Ajustes de comerciante</h1>
          <p className="text-sm text-on-surface-variant">Configura tu tasa y límites operativos.</p>
        </div>
      </div>

      {/* Offline Status Banner */}
      {!offlineQueue.isOnline && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded">
          <div className="flex">
            <span className="material-symbols-outlined text-amber-600 mr-3">wifi_off</span>
            <div>
              <h3 className="font-semibold text-amber-800">Sin conexión</h3>
              <p className="text-sm text-amber-700">Los cambios se guardarán localmente y se sincronizarán cuando se restaure la conexión.</p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Sync Status */}
      {offlineQueue.hasPending && (
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 rounded">
          <div className="flex items-center justify-between">
            <div className="flex">
              <span className="material-symbols-outlined text-blue-600 mr-3 animate-spin">progress_activity</span>
              <div>
                <h3 className="font-semibold text-blue-800">Pendiente de sincronizar</h3>
                <p className="text-sm text-blue-700">Tienes cambios esperando ser sincronizados con el servidor.</p>
              </div>
            </div>
            {offlineQueue.isOnline && !offlineQueue.isSyncing && (
              <button
                onClick={() => offlineQueue.retryAsync(token)}
                className="ml-4 px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Syncing Status */}
      {offlineQueue.isSyncing && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6 rounded">
          <div className="flex">
            <span className="material-symbols-outlined text-green-600 mr-3 animate-spin">sync</span>
            <div>
              <h3 className="font-semibold text-green-800">Sincronizando...</h3>
              <p className="text-sm text-green-700">Tus cambios se están enviando al servidor.</p>
            </div>
          </div>
        </div>
      )}

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
