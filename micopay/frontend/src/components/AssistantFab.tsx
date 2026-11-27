import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Entrada al asistente desde cualquier pantalla principal.
 *
 * Va separado de BottomNav a proposito: la barra tiene cinco destinos fijos y
 * meter un sexto la vuelve ilegible en un telefono. El boton flota arriba de la
 * barra, con el mismo canto vivo y la misma sombra solida del sistema.
 */
const AssistantFab = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <button
      onClick={() => navigate('/assistant')}
      aria-label={t('assistant.open')}
      className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-sm border-2 border-tinta bg-verde text-papel shadow-solida transition-all duration-200 active:translate-x-[2px] active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta md:bottom-6"
    >
      <span aria-hidden="true" className="material-symbols-outlined text-[26px]">
        smart_toy
      </span>
    </button>
  );
};

export default AssistantFab;
