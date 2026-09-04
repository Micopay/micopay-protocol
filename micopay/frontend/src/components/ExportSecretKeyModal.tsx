import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { exportSecretKey } from "../lib/keystore";

interface ExportSecretKeyModalProps {
  onClose: () => void;
}

/**
 * Session-level rate-limit: max 1 export attempt per 5 minutes.
 * Resets on page reload (intentional — no persistent storage of the timer).
 */
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
let lastExportTime = 0;

const ExportSecretKeyModal = ({ onClose }: ExportSecretKeyModalProps) => {
  const { t } = useTranslation();
  const [secretKey, setSecretKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clipboardWarning, setClipboardWarning] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitRemaining, setRateLimitRemaining] = useState(0);
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    return () => {
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
    };
  }, []);

  /** Check if the user is rate-limited. */
  const checkRateLimit = useCallback((): boolean => {
    const now = Date.now();
    const elapsed = now - lastExportTime;
    if (elapsed < RATE_LIMIT_MS) {
      const remaining = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
      setRateLimited(true);
      setRateLimitRemaining(remaining);
      // Countdown tick
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
      rateLimitTimerRef.current = setTimeout(() => {
        setRateLimited(false);
        setRateLimitRemaining(0);
      }, RATE_LIMIT_MS - elapsed);
      return false;
    }
    return true;
  }, []);

  const handleCopy = async () => {
    if (!secretKey) return;
    if (!checkRateLimit()) return;

    try {
      await navigator.clipboard.writeText(secretKey);
      setCopied(true);
      lastExportTime = Date.now();
      setClipboardWarning(true);

      // Show clipboard warning before auto-clearing
      setClipboardWarning(true);

      // Auto-clear clipboard after 30 seconds
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
      clipboardTimerRef.current = setTimeout(() => {
        navigator.clipboard.writeText("").catch(() => {});
        setClipboardWarning(false);
      }, 30000);

      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);

      // Start rate-limit countdown
      setRateLimited(true);
      const remaining = RATE_LIMIT_MS / 1000;
      setRateLimitRemaining(remaining);
      if (rateLimitTimerRef.current) clearTimeout(rateLimitTimerRef.current);
      rateLimitTimerRef.current = setTimeout(() => {
        setRateLimited(false);
        setRateLimitRemaining(0);
      }, RATE_LIMIT_MS);
    } catch (err) {
      console.error("Failed to copy secret key:", err);
    }
  };

  /** Format remaining time as mm:ss */
  const formatRemaining = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label={t('profile.exportKeyClose')}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl border border-[#D7E3EA] max-h-[90vh] overflow-y-auto">
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
          {/* Strong warning banner */}
          <div className="rounded-2xl bg-[#FFECEF] border border-[#F5B6C0] p-4">
            <p className="text-sm text-[#C62828] font-bold leading-relaxed">
              {t('profile.exportKeyWarning')}
            </p>
          </div>

          {/* Clipboard warning banner — shown after clipboard copy */}
          {clipboardWarning && (
            <div className="rounded-2xl bg-[#FFF6DB] border border-[#E6D6B8] p-4 animate-fadeIn">
              <p className="text-sm text-[#7A5F16] font-medium leading-relaxed">
                {t('profile.exportClipboardWarning')}
              </p>
            </div>
          )}

          {/* QR Code section — primary backup method */}
          <div className="rounded-2xl bg-[#F4FAFF] border border-[#D7E3EA] p-4 text-center">
            <label className="block text-xs font-bold uppercase tracking-[0.15em] text-[#67808C] mb-3">
              {t('profile.exportKeyQR')}
            </label>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-pulse w-48 h-48 bg-[#D7E3EA]/50 rounded-xl" />
              </div>
            ) : secretKey ? (
              <div className="inline-flex flex-col items-center gap-3">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#D7E3EA]/40">
                  <QRCodeSVG
                    value={secretKey}
                    size={180}
                    bgColor="#FFFFFF"
                    fgColor="#0B1E26"
                    level="M"
                  />
                </div>
                <p className="text-[11px] text-[#67808C] leading-tight max-w-xs">
                  {t('profile.exportKeyQRHint')}
                </p>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-[#C62828]">
                {t('profile.exportKeyError')}
              </div>
            )}
          </div>

          {/* Secret key text display (hidden by default) */}
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

        {/* Rate limit indicator */}
        {rateLimited && (
          <div className="mt-3 rounded-2xl bg-[#FFF6DB] border border-[#E6D6B8] p-3 text-center">
            <p className="text-xs text-[#7A5F16] font-bold">
              {t('profile.exportRateLimited')} {formatRemaining(rateLimitRemaining)}
            </p>
          </div>
        )}

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
            disabled={!secretKey || loading || rateLimited}
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