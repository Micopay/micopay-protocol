import i18n from '../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

interface DeleteAccountModalProps {
  username: string;
  confirmation: string;
  onConfirmationChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
  error?: string | null;
}

const DeleteAccountModal = ({
  username,
  confirmation,
  onConfirmationChange,
  onCancel,
  onConfirm,
  loading = false,
  error = null,
}: DeleteAccountModalProps) => {
  const canConfirm = confirmation.trim() === username && !loading;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label={tr('deleteAccount.closeLabel')}
        className="absolute inset-0 bg-slate-950/60 "
        onClick={onCancel}
      />

      <div className="relative w-full max-w-md rounded-sm bg-papel p-6 border-2 border-tinta">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-sm bg-[#FFECEF] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-rojo text-3xl">
              warning
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-rojo mb-1">
              {tr('deleteAccount.required')}
            </p>
            <h2 className="text-2xl font-extrabold text-tinta leading-tight">
              {tr('deleteAccount.title')}
            </h2>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-sm text-gris leading-relaxed">
            {tr('deleteAccount.irreversible')}
          </p>

          <div className="rounded-sm bg-[#FFECEF] border-2 border-tinta p-4">
            <p className="text-sm text-rojo font-medium leading-relaxed">
              {tr('deleteAccount.typePrefix')} <span className="font-bold font-mono">@{username}</span>{" "}
              {tr('deleteAccount.typeSuffix')}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-gris mb-2 uppercase tracking-wide">
              {tr('deleteAccount.confirmUser')}
            </label>
            <input
              autoFocus
              value={confirmation}
              onChange={(e) => onConfirmationChange(e.target.value)}
              placeholder={username}
              className="w-full bg-[#F7FBFD] border-2 border-tinta/70 rounded-sm px-4 py-3 text-base font-medium focus:outline-none focus:border-[#C62828] transition-colors"
            />
          </div>

          {error && (
            <div className="rounded-sm border-2 border-tinta bg-[#FFECEF] px-4 py-3">
              <p className="text-sm text-rojo font-medium">{error}</p>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border-2 border-tinta bg-papel px-4 py-3 font-bold text-tinta transition-colors hover:bg-[#F7FBFD]"
          >
            {tr('deleteAccount.cancel')}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="rounded-sm bg-[#C62828] px-4 py-3 font-bold text-papel /20 transition-all active:translate-x-[2px] active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="material-symbols-outlined animate-spin text-lg">
                  progress_activity
                </span>
                {tr('deleteAccount.deleting')}
              </span>
            ) : (
              tr('deleteAccount.confirm')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountModal;
