import type { PermState } from '../hooks/usePermission';
import i18n from '../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

interface PermissionGateProps {
  state: PermState;
  onRequest: () => void;
  onOpenSettings: () => void;
  /** Rendered when feature works (state === 'granted' or unknown on web) */
  children: React.ReactNode;
  /** Shown below the denied card as an alternative path */
  fallback?: React.ReactNode;
  /** Rationale shown before the first permission prompt */
  title: string;
  description: string;
  icon: string;
}

// Funcion y no constante: se lee al pintar, asi sigue el idioma activo.
const copyFor = () => ({
  denied: {
    title: tr('permissionGate.deniedTitle'),
    body: tr('permissionGate.deniedBody'),
  },
  permanently_denied: {
    title: tr('permissionGate.blockedTitle'),
    body: tr('permissionGate.blockedBody'),
    settingsNote: tr('permissionGate.settingsPath'),
  },
});

export function PermissionGate({
  state,
  onRequest,
  onOpenSettings,
  children,
  fallback,
  title,
  description,
  icon,
}: PermissionGateProps) {
  if (state === 'granted') return <>{children}</>;

  const isPermanent = state === 'permanently_denied';
  const COPY = copyFor();
  const copy = isPermanent ? COPY.permanently_denied : COPY.denied;
  const isRationale = state === 'unknown' || state === 'prompt';

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
      {/* Icon bubble */}
      <div
        className={`w-16 h-16 rounded-sm flex items-center justify-center ${
          isPermanent
            ? 'bg-error/10'
            : isRationale
            ? 'bg-primary/10'
            : 'bg-outline/10'
        }`}
      >
        <span
          className={`material-symbols-outlined text-3xl ${
            isPermanent ? 'text-error' : isRationale ? 'text-primary' : 'text-gris'
          }`}
        >
          {isPermanent ? 'lock' : isRationale ? icon : 'block'}
        </span>
      </div>

      {/* Text */}
      <div className="space-y-1">
        <h3 className="font-headline font-bold text-lg text-on-surface">
          {isRationale ? title : copy.title}
        </h3>
        <p className="text-sm text-gris leading-snug max-w-[280px] mx-auto">
          {isRationale ? description : copy.body}
        </p>
        {isPermanent && (
          <p className="text-xs text-gris/60 font-mono mt-1">{COPY.permanently_denied.settingsNote}</p>
        )}
      </div>

      {/* Primary CTA */}
      {isPermanent ? (
        <button
          onClick={onOpenSettings}
          className="mt-2 h-[48px] px-8 bg-primary text-papel font-bold rounded-sm active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">settings</span>
          {tr('permissionGate.openSettings')}
        </button>
      ) : (
        <button
          onClick={onRequest}
          className="mt-2 h-[48px] px-8 bg-primary text-papel font-bold rounded-sm active:translate-x-[2px] active:translate-y-[2px] transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">{icon}</span>
          {isRationale ? tr('permissionGate.allow') : tr('permissionGate.retry')}
        </button>
      )}

      {/* Fallback alternative */}
      {fallback && (
        <div className="w-full mt-2 pt-4 border-t border-surface-container-high">
          {fallback}
        </div>
      )}
    </div>
  );
}
