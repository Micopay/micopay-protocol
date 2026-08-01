
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { exportSecretKey } from "../lib/keystore";

interface ExportSecretKeyModalProps {
  onClose: () => void;
}

const ExportSecretKeyModal = ({ onClose }: ExportSecretKeyModalProps) => {
  const { t } = useTranslation();
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadSecretKey = async () => {
    try {
      setLoading(true);
      const key = await exportSecretKey();
      setSecretKey(key);
    } catch (err) {
      console.error("Failed to load secret key:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSecretKey();
  }, []);

  const handleCopy = async () => {
    if (!secretKey) return;
    try {
      await navigator.clipboard.writeText(secretKey);
      setCopied(true);
      // Auto-clear clipboard after 30 seconds
      setTimeout(() => {
        navigator.clipboard.writeText("").catch(() => {});
      }, 30000);
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy secret key:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label={t('profile.exportKeyClose')}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl border border-[#D7E3EA]">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FFF6DB] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#9A7B12] text-3xl">
              security
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#9A7B12] mb-1">
              {t('profile.exportKeyTitle')}
            </p>
            <h2 className="text-2xl font-extrabold text-[#0B1E26] leading-tight">
              {t('profile.exportKeyHeading')}
            </h2>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-[#FFF6DB] border border-[#E6D6B8] p-4">
            <p className="text-sm text-[#7A5F16] font-medium leading-relaxed">
              {t('profile.exportKeyWarning')}
            </p>
          </div>

          <div className="rounded-2xl bg-[#F4FAFF] border border-[#D7E3EA] p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C]">
                {t('profile.exportKeyLabel')}
              </label>
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="text-[#00694C] text-sm font-bold hover:underline"
              >
                {showKey ? t('profile.exportKeyHide') : t('profile.exportKeyShow')}
              </button>
            </div>
            {loading ? (
              <div className="animate-pulse h-12 bg-[#D7E3EA]/50 rounded-xl" />
            ) : (
              <p className="font-mono text-sm text-[#0B1E26] break-all select-all">
                {showKey ? secretKey : "•".repeat(56)}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#D7E3EA] bg-white px-4 py-3 font-bold text-[#0B1E26] transition-colors hover:bg-[#F7FBFD]"
          >
            {t('profile.exportKeyClose')}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!secretKey || loading}
            className="rounded-2xl bg-[#00694C] px-4 py-3 font-bold text-white shadow-lg shadow-[#00694C]/20 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">
              {copied ? "check_circle" : "content_copy"}
            </span>
            {copied ? t('profile.exportKeyCopied') : t('profile.exportKeyCopy')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportSecretKeyModal;
