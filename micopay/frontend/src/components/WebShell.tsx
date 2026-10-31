import { useEffect, useRef, type ReactNode, type WheelEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';
import NetworkBanner from './NetworkBanner';

/* Armazon de la web en PC, con el esquema de MicoPay Cafe: barra lateral de
   tinta a la izquierda y contenido con ancho limitado.

   Abajo de md no hace nada: la web en un telefono se ve igual que la APK.

   Las pantallas se escribieron para un telefono y traen barras con
   fijas a la ventana. La transformacion de la columna vuelve a esa columna su
   marco, y el desplazamiento vive en el div de adentro: asi esas barras quedan
   en la columna y no se mueven al bajar, sin tocar cada pantalla. */

export interface WebNavItem {
  page: string;
  icon: string;
  label: string;
}

const COLUMNA_ANCHA = new Set(['/']);

function Grupo({ titulo, items, actual, onNavigate }: {
  titulo: string;
  items: WebNavItem[];
  actual: string;
  onNavigate: (page: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-col">
      <div className="px-5 pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-[.14em] text-gris-3">{titulo}</div>
      {items.map((n) => {
        const activa = actual === n.page;
        return (
          <button
            key={n.page}
            type="button"
            onClick={() => onNavigate(n.page)}
            aria-current={activa ? 'page' : undefined}
            className={`flex min-h-12 items-center gap-3 border-l-4 px-5 py-3 text-left text-[15px] font-bold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-papel ${
              activa ? 'border-naranja-claro bg-tinta-2 text-papel' : 'border-transparent text-gris-3'
            }`}
          >
            <span
              aria-hidden="true"
              className="material-symbols-outlined"
              style={{ fontVariationSettings: activa ? '"FILL" 1' : '"FILL" 0' }}
            >
              {n.icon}
            </span>
            {n.label}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  /** Sin barra lateral en el inicio de sesion y el recorrido de bienvenida. */
  showSidebar: boolean;
  operation: WebNavItem[];
  account: WebNavItem[];
  currentPage: string;
  onNavigate: (page: string) => void;
  username?: string | null;
  address?: string | null;
  children: ReactNode;
}

export default function WebShell({
  showSidebar,
  operation,
  account,
  currentPage,
  onNavigate,
  username,
  address,
  children,
}: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);

  // Cada pantalla empieza arriba: el contenedor sobrevive al cambio de ruta.
  useEffect(() => {
    scroller.current?.scrollTo?.({ top: 0 });
  }, [pathname]);

  // La rueda tambien mueve la pagina con el puntero en los margenes.
  const onGutterWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && scroller.current) scroller.current.scrollTop += e.deltaY;
  };

  return (
    <div className="flex min-h-screen flex-col bg-fondo md:h-dvh md:min-h-0 md:flex-row md:overflow-hidden">
      {showSidebar && (
        <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto bg-tinta text-papel md:flex">
          <div className="border-b-2 border-tinta-3 px-5 py-5"><Logo tone="oscuro" /></div>
          <nav aria-label={t('a11y.mainNav')} className="flex flex-col py-2">
            <Grupo titulo="Operación" items={operation} actual={currentPage} onNavigate={onNavigate} />
            <Grupo titulo="Cuenta" items={account} actual={currentPage} onNavigate={onNavigate} />
          </nav>
          <div className="mt-auto border-t-2 border-tinta-3 px-5 py-4">
            <div className="truncate text-[15px] font-bold">{username}</div>
            {address && (
              <div className="num mt-0.5 text-[12px] text-gris-3" title={address}>
                {`${address.slice(0, 6)}…${address.slice(-6)}`}
              </div>
            )}
          </div>
        </aside>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <NetworkBanner />
        <div className="flex min-h-0 flex-1 flex-col md:items-center md:overflow-hidden" onWheel={onGutterWheel}>
          <div
            className={`flex w-full flex-1 flex-col md:min-h-0 md:border-x-2 md:border-tinta md:[transform:translateZ(0)] ${
              COLUMNA_ANCHA.has(pathname) ? 'md:max-w-[1120px]' : 'md:max-w-[720px]'
            }`}
          >
            <div ref={scroller} className="flex flex-1 flex-col md:min-h-0 md:overflow-y-auto md:[&_.min-h-screen]:min-h-full">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
