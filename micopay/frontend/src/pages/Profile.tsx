import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import DeleteAccountModal from "../components/DeleteAccountModal";
import { exportSecretKey, importKeypair } from '../lib/keystore';
import {
  deleteAccount,
  getCurrentUser,
  getAuthToken,
  type CurrentUserProfile,
} from "../services/api";
import { setLanguage } from "../i18n";

/** Deterministic avatar gradient seeded by the Stellar address (no external images). */
function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 40) % 360} 60% 35%))`;
}

const TIER_STYLE: Record<string, { bg: string; text: string; icon: string }> = {
  Oro: { bg: "#FFF6DB", text: "#9A7B12", icon: "workspace_premium" },
  Plata: { bg: "#EEF1F4", text: "#5A6B78", icon: "military_tech" },
  Bronce: { bg: "#F6E8DE", text: "#9A5B2E", icon: "verified" },
  Nuevo: { bg: "#E1F5EE", text: "#00694C", icon: "spa" },
};

interface ProfileProps {
  token: string | null;
  username?: string | null;
  devicePublicKey?: string | null;
  onBack: () => void;
  onDeleted: () => void;
  onLogout: () => void;
  onNavigatePrivacy?: () => void;
  onNavigateTerms?: () => void;
  onToggleDebug?: () => void;
}

const Profile = ({ token, username, devicePublicKey, onBack, onDeleted, onLogout, onNavigatePrivacy, onNavigateTerms }: ProfileProps) => {
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [activeToken, setActiveToken] = useState<string | null>(token);

  // Keep activeToken in sync with token prop (e.g., after parent refreshes session)
  useEffect(() => {
    if (token) setActiveToken(token);
  }, [token]);

  useEffect(() => {
    let cancelled = false;

    const load = async (tkn: string) => {
      try {
        setLoading(true);
        setError(null);
        const currentUser = await getCurrentUser(tkn);
        if (!cancelled) setProfile(currentUser);
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status;
        // 401 / 403 → try to get a fresh token with device keypair
        if ((status === 401 || status === 403) && username) {
          try {
            const fresh = await getAuthToken(username);
            setActiveToken(fresh);
            const currentUser = await getCurrentUser(fresh);
            if (!cancelled) setProfile(currentUser);
          } catch {
            if (!cancelled) setError('Tu sesión expiró. Vuelve a iniciar sesión.');
          }
        } else {
          setError(err?.response?.data?.message ?? 'No se pudo cargar el perfil. Revisa tu conexión.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (activeToken) {
      load(activeToken);
    } else if (username) {
      // No token at all → try to get one with device keypair
      setLoading(true);
      getAuthToken(username)
        .then((fresh) => {
          if (!cancelled) {
            setActiveToken(fresh);
            return load(fresh);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLoading(false);
            setError('Tu sesión expiró. Vuelve a iniciar sesión.');
          }
        });
    } else {
      setLoading(false);
      setError('Tu sesión expiró. Vuelve a iniciar sesión.');
    }

    return () => { cancelled = true; };
  }, [activeToken, username]);


  const openDeleteModal = () => {
    setConfirmation("");
    setError(null);
    setShowDeleteModal(true);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setShowDeleteModal(false);
    setConfirmation("");
    setError(null);
  };

  const handleDelete = async () => {
    if (!activeToken || !profile || confirmation.trim() !== profile.username) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await deleteAccount(activeToken, profile.username);
      setSuccess(true);
      setShowDeleteModal(false);
      setTimeout(() => {
        onDeleted();
      }, 800);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'No se pudo eliminar la cuenta.');
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyAddress = () => {
    if (devicePublicKey) navigator.clipboard.writeText(devicePublicKey);
  };

  const handleExport = async () => {
    const confirmed = window.confirm(
        'Tu clave secreta da control total de tu cuenta. Nunca la compartas. Cópiala en un lugar seguro sin conexión.'
    );
    if (!confirmed) return;
    const secret = await exportSecretKey();
    await navigator.clipboard.writeText(secret);
    alert('Clave secreta copiada. Limpia tu portapapeles después de guardarla.');
  };

  const handleImport = async () => {
    try {
      const newPub = await importKeypair(importInput.trim());
      alert(`Clave importada. Nueva dirección:\n${newPub}`);
      setShowImportModal(false);
      setImportInput('');
    } catch {
      alert('Clave inválida. Las claves secretas de Stellar empiezan con "S" y tienen 56 caracteres.');
    }
  };

  return (
      <div className="bg-[#F4FAFF] text-[#0B1E26] min-h-screen flex flex-col pb-28">
        <header className="fixed top-0 left-0 w-full z-50 flex items-center gap-4 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90 border-b border-[#D7E3EA]/60">
          <button
              onClick={onBack}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#EFF6FA] transition-colors"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="font-bold text-lg leading-tight">{t('profile.title')}</h1>
            <p className="text-[11px] text-[#67808C]">
              {t('profile.subtitle')}
            </p>
          </div>
        </header>

        <main className="flex-1 mt-[calc(5rem+env(safe-area-inset-top))] px-4 pt-4 space-y-5">
          {loading && (
              <div className="bg-white rounded-[24px] p-6 border border-[#D7E3EA]/60 shadow-sm text-center">
            <span className="material-symbols-outlined animate-spin text-[#00694C] text-3xl">
              progress_activity
            </span>
                <p className="mt-3 text-sm text-[#67808C]">{t('profile.loadingProfile')}</p>
              </div>
          )}

          {!loading && error && (
              <div className="bg-[#FFECEF] border border-[#F5B6C0] rounded-2xl px-5 py-4 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-[#C62828] text-xl mt-0.5" style={{ fontVariationSettings: '"FILL" 1' }}>error</span>
                  <p className="text-sm text-[#C62828] font-medium leading-snug">{error}</p>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full h-10 text-sm font-bold bg-[#C62828] text-white rounded-xl active:scale-95 transition-all"
                >
                  Iniciar sesión de nuevo
                </button>
              </div>
          )}

          {!loading && profile && (
              <>
                <section className="bg-gradient-to-br from-[#E1F5EE] to-[#F0FBF7] rounded-[28px] p-5 border border-[#BFE7D9]/70 shadow-sm">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-16 h-16 rounded-2xl shadow-sm flex items-center justify-center text-white font-extrabold text-2xl flex-shrink-0"
                      style={{ background: avatarGradient(profile.stellar_address) }}
                    >
                      {profile.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#00694C]">
                          {t('profile.activeAccount')}
                        </p>
                        {(() => {
                          const tier = profile.reputation_tier ?? "Nuevo";
                          const s = TIER_STYLE[tier] ?? TIER_STYLE.Nuevo;
                          return (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                              style={{ backgroundColor: s.bg, color: s.text }}
                            >
                              <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: '"FILL" 1' }}>{s.icon}</span>
                              {tier}
                            </span>
                          );
                        })()}
                      </div>
                      <h2 className="text-2xl font-extrabold text-[#0B1E26] truncate">
                        @{profile.username}
                      </h2>
                      <p className="text-xs text-[#67808C] truncate font-mono">
                        {profile.stellar_address}
                      </p>
                    </div>
                  </div>

                  {/* Reputation stats */}
                  <div className="grid grid-cols-3 gap-2 mt-5">
                    <div className="bg-white/70 rounded-2xl p-3 text-center">
                      <p className="text-xl font-extrabold text-[#0B1E26]">{profile.trades_completed ?? 0}</p>
                      <p className="text-[10px] text-[#67808C] mt-0.5 leading-tight">{t('profile.ops')}</p>
                    </div>
                    <div className="bg-white/70 rounded-2xl p-3 text-center">
                      <p className="text-xl font-extrabold text-[#0B1E26]">
                        {profile.completion_rate != null ? `${profile.completion_rate}%` : '—'}
                      </p>
                      <p className="text-[10px] text-[#67808C] mt-0.5 leading-tight">{t('profile.completed')}</p>
                    </div>
                    <div className="bg-white/70 rounded-2xl p-3 text-center">
                      <p className="text-xl font-extrabold text-[#0B1E26]">
                        {profile.created_at
                          ? new Date(profile.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'es-MX', { month: 'short', year: '2-digit' })
                          : '—'}
                      </p>
                      <p className="text-[10px] text-[#67808C] mt-0.5 leading-tight">{t('profile.memberSince')}</p>
                    </div>
                  </div>
                </section>

                <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C] mb-2">
                      {t('profile.details')}
                    </p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#67808C]">
                      {t('profile.username')}
                    </span>
                        <span className="text-sm font-bold text-[#0B1E26]">
                      @{profile.username}
                    </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#67808C]">
                      {t('profile.stellarAddress')}
                    </span>
                        <span className="text-sm font-mono text-[#0B1E26] truncate max-w-[55%] text-right">
                      {profile.stellar_address}
                    </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-[#67808C]">{t('profile.wallet')}</span>
                        <span className="text-sm font-bold text-[#0B1E26]">
                      {profile.wallet_type ?? "self_custodial"}
                    </span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C]">
                    {t('profile.deviceKey')}
                  </p>
                  <p className="font-mono text-xs text-[#0B1E26] break-all select-all bg-[#F4FAFF] rounded-xl p-3">
                    {devicePublicKey ?? t('profile.noKeyGenerated')}
                  </p>
                  <div className="flex gap-2">
                    <button
                        onClick={handleCopyAddress}
                        disabled={!devicePublicKey}
                        className="flex-1 h-10 text-sm font-bold border border-[#00694C] text-[#00694C] rounded-xl active:scale-95 transition-all disabled:opacity-40"
                    >
                      {t('profile.copyAddress')}
                    </button>
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="flex-1 h-10 text-sm font-bold border border-[#D7E3EA] text-[#67808C] rounded-xl active:scale-95 transition-all"
                    >
                      {t('profile.importKey')}
                    </button>
                  </div>
                  <button
                      onClick={handleExport}
                      className="w-full h-10 text-sm font-bold text-[#C62828] border border-[#F5B6C0] rounded-xl active:scale-95 transition-all"
                  >
                    {t('profile.exportKey')}
                  </button>
                </section>

                {/* Language switcher */}
                <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C] mb-3">{t('profile.language')}</p>
                  <div className="flex gap-2">
                    {(['es', 'en'] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`flex-1 h-11 rounded-xl font-bold text-sm border transition-all active:scale-95 ${
                          i18n.language === lang
                            ? 'bg-[#00694C] text-white border-transparent'
                            : 'bg-white text-[#67808C] border-[#D7E3EA]'
                        }`}
                      >
                        {lang === 'es' ? '🇲🇽 Español' : '🇺🇸 English'}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C] mb-3">{t('profile.legal')}</p>
                  <div className="space-y-1">
                    <button
                        onClick={onNavigatePrivacy}
                        className="w-full flex items-center justify-between py-2.5 text-sm text-[#0B1E26] hover:text-[#00694C] transition-colors"
                    >
                      <span>{t('profile.privacy')}</span>
                      <span className="material-symbols-outlined text-base text-[#67808C]">chevron_right</span>
                    </button>
                    <div className="border-t border-[#D7E3EA]/40" />
                    <button
                        onClick={onNavigateTerms}
                        className="w-full flex items-center justify-between py-2.5 text-sm text-[#0B1E26] hover:text-[#00694C] transition-colors"
                    >
                      <span>{t('profile.terms')}</span>
                      <span className="material-symbols-outlined text-base text-[#67808C]">chevron_right</span>
                    </button>
                  </div>
                </section>

                <section className="bg-white rounded-[24px] p-5 border border-[#F5B6C0] shadow-sm space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#C62828] mb-2">
                      {t('profile.dangerZone')}
                    </p>
                    <h3 className="text-xl font-bold text-[#0B1E26] mb-2">
                      {t('profile.deleteTitle')}
                    </h3>
                    <p className="text-sm text-[#67808C] leading-relaxed">
                      {t('profile.deleteDesc')}
                    </p>
                  </div>

                  <div className="bg-[#FFECEF] rounded-2xl p-4 border border-[#F5B6C0]">
                    <p className="text-sm text-[#C62828] font-medium">
                      {t('profile.deleteWarning')}
                    </p>
                  </div>

                  <button
                      type="button"
                      onClick={openDeleteModal}
                      className="w-full bg-[#C62828] text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#C62828]/20 transition-all active:scale-[0.98]"
                  >
                <span className="material-symbols-outlined text-lg">
                  delete_forever
                </span>
                    {t('profile.deleteBtn')}
                  </button>
                </section>

                <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C] mb-3">{t('profile.session')}</p>
                  <button
                      type="button"
                      onClick={onLogout}
                      className="w-full bg-gray-200 text-gray-800 font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                <span className="material-symbols-outlined text-lg">
                  logout
                </span>
                    {t('profile.logout')}
                  </button>
                </section>
              </>
          )}

          {!loading && !profile && !error && (
              <div className="bg-white rounded-[24px] p-6 border border-[#D7E3EA]/60 shadow-sm text-center">
            <span className="material-symbols-outlined text-[#67808C] text-3xl">
              person_off
            </span>
                <p className="mt-3 text-sm text-[#67808C]">
                  {t('profile.noProfile')}
                </p>
              </div>
          )}
        </main>

        {showDeleteModal && profile && (
            <DeleteAccountModal
                username={profile.username}
                confirmation={confirmation}
                onConfirmationChange={setConfirmation}
                onCancel={closeDeleteModal}
                onConfirm={handleDelete}
                loading={deleting}
                error={error}
            />
        )}

        {showImportModal && (
            <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="w-full bg-white rounded-[28px] p-6 space-y-4 shadow-2xl">
                <h3 className="text-lg font-bold text-[#0B1E26]">{t('profile.importKeyTitle')}</h3>
                <p className="text-sm text-[#67808C]">
                  {t('profile.importKeyDesc')}
                </p>
                <textarea
                    value={importInput}
                    onChange={e => setImportInput(e.target.value)}
                    placeholder={t('profile.importPlaceholder')}
                    rows={3}
                    className="w-full font-mono text-xs border border-[#D7E3EA] rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#00694C]"
                />
                <div className="flex gap-3">
                  <button
                      onClick={() => { setShowImportModal(false); setImportInput(''); }}
                      className="flex-1 h-12 font-bold border border-[#D7E3EA] text-[#67808C] rounded-2xl"
                  >
                    {t('profile.importCancel')}
                  </button>
                  <button
                      onClick={handleImport}
                      disabled={!importInput.trim()}
                      className="flex-1 h-12 font-bold bg-[#00694C] text-white rounded-2xl disabled:opacity-40"
                  >
                    {t('profile.importConfirm')}
                  </button>
                </div>
              </div>
            </div>
        )}

        {success && (
            <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-2xl bg-[#E6F9F1] border border-[#1D9E75]/20 px-4 py-3 shadow-lg">
              <p className="text-sm text-[#1D9E75] font-medium">
                {t('profile.accountDeleted')}
              </p>
            </div>
        )}
      </div>
  );
};

export default Profile;