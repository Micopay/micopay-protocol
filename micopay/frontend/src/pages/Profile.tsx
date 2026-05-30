import { useEffect, useState } from "react";
import DeleteAccountModal from "../components/DeleteAccountModal";
import {
  deleteAccount,
  getCurrentUser,
  type CurrentUserProfile,
} from "../services/api";

interface ProfileProps {
  token: string | null;
  onBack: () => void;
  onDeleted: () => void;
  onNavigatePrivacy?: () => void;
  onNavigateTerms?: () => void;
  onNavigateMerchantSettings?: () => void;
}

const Profile = ({
  token,
  onBack,
  onDeleted,
  onNavigatePrivacy,
  onNavigateTerms,
  onNavigateMerchantSettings,
}: ProfileProps) => {
  const [profile, setProfile] = useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("No hay una cuenta autenticada para mostrar.");
      return;
    }

    let cancelled = false;

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const currentUser = await getCurrentUser(token);
        if (!cancelled) {
          setProfile(currentUser);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ?? "No se pudo cargar tu perfil",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [token]);

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
    if (!token || !profile || confirmation.trim() !== profile.username) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      await deleteAccount(token, profile.username);
      setSuccess(true);
      setShowDeleteModal(false);
      setTimeout(() => {
        onDeleted();
      }, 800);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "No se pudo eliminar tu cuenta");
    } finally {
      setDeleting(false);
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
          <h1 className="font-bold text-lg leading-tight">Perfil</h1>
          <p className="text-[11px] text-[#67808C]">
            Gestiona tu cuenta y privacidad
          </p>
        </div>
      </header>

      <main className="flex-1 mt-20 px-4 pt-4 space-y-5">
        {loading && (
          <div className="bg-white rounded-[24px] p-6 border border-[#D7E3EA]/60 shadow-sm text-center">
            <span className="material-symbols-outlined animate-spin text-[#00694C] text-3xl">
              progress_activity
            </span>
            <p className="mt-3 text-sm text-[#67808C]">Cargando perfil…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-[#FFECEF] border border-[#F5B6C0] rounded-2xl px-4 py-3">
            <p className="text-sm text-[#C62828] font-medium">{error}</p>
          </div>
        )}

        {!loading && profile && (
          <>
            <section className="bg-gradient-to-br from-[#E1F5EE] to-[#F0FBF7] rounded-[28px] p-5 border border-[#BFE7D9]/70 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#00694C] text-3xl">
                    person
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#00694C]">
                    Cuenta activa
                  </p>
                  <h2 className="text-2xl font-extrabold text-[#0B1E26] truncate">
                    @{profile.username}
                  </h2>
                  <p className="text-xs text-[#67808C] truncate font-mono">
                    {profile.stellar_address}
                  </p>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C] mb-2">
                  Detalles
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#67808C]">
                      Nombre de usuario
                    </span>
                    <span className="text-sm font-bold text-[#0B1E26]">
                      @{profile.username}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#67808C]">
                      Dirección Stellar
                    </span>
                    <span className="text-sm font-mono text-[#0B1E26] truncate max-w-[55%] text-right">
                      {profile.stellar_address}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-[#67808C]">Wallet</span>
                    <span className="text-sm font-bold text-[#0B1E26]">
                      {profile.wallet_type ?? "self_custodial"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C] mb-2">
                  Configuración
                </p>
                <div className="space-y-1">
                  <button
                    onClick={onNavigateMerchantSettings}
                    className="w-full flex items-center justify-between py-2.5 text-sm text-[#0B1E26] hover:text-[#00694C] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-lg">
                        storefront
                      </span>
                      <span>Ajustes de Comerciante</span>
                    </div>
                    <span className="material-symbols-outlined text-base text-[#67808C]">
                      chevron_right
                    </span>
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#67808C] mb-3">
                Legal
              </p>
              <div className="space-y-1">
                <button
                  onClick={onNavigatePrivacy}
                  className="w-full flex items-center justify-between py-2.5 text-sm text-[#0B1E26] hover:text-[#00694C] transition-colors"
                >
                  <span>Política de Privacidad</span>
                  <span className="material-symbols-outlined text-base text-[#67808C]">
                    chevron_right
                  </span>
                </button>
                <div className="border-t border-[#D7E3EA]/40" />
                <button
                  onClick={onNavigateTerms}
                  className="w-full flex items-center justify-between py-2.5 text-sm text-[#0B1E26] hover:text-[#00694C] transition-colors"
                >
                  <span>Términos de Servicio</span>
                  <span className="material-symbols-outlined text-base text-[#67808C]">
                    chevron_right
                  </span>
                </button>
              </div>
            </section>

            <section className="bg-white rounded-[24px] p-5 border border-[#F5B6C0] shadow-sm space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#C62828] mb-2">
                  Zona peligrosa
                </p>
                <h3 className="text-xl font-bold text-[#0B1E26] mb-2">
                  Eliminar cuenta permanentemente
                </h3>
                <p className="text-sm text-[#67808C] leading-relaxed">
                  Esta acción borra tu cuenta y anonimiza tus datos. No podrás
                  recuperar la cuenta después de confirmar.
                </p>
              </div>

              <div className="bg-[#FFECEF] rounded-2xl p-4 border border-[#F5B6C0]">
                <p className="text-sm text-[#C62828] font-medium">
                  Antes de continuar, abre la confirmación y escribe tu usuario
                  exacto para habilitar la eliminación.
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
                Eliminar mi cuenta
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
              No hay perfil disponible.
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

      {success && (
        <div className="fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 rounded-2xl bg-[#E6F9F1] border border-[#1D9E75]/20 px-4 py-3 shadow-lg">
          <p className="text-sm text-[#1D9E75] font-medium">
            Cuenta eliminada correctamente.
          </p>
        </div>
      )}
    </div>
  );
};

export default Profile;
