import { useTranslation } from 'react-i18next';

interface BottomNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isMerchant?: boolean;
}

const BottomNav = ({ currentPage, onNavigate, isMerchant = false }: BottomNavProps) => {
  const { t } = useTranslation();

  const btn = (page: string, icon: string, label: string) => (
    <button
      onClick={() => onNavigate(page)}
      aria-label={label}
      aria-current={currentPage === page ? 'page' : undefined}
      className={`flex flex-col items-center justify-center rounded-full px-5 py-2 transition-all active:scale-90 duration-150 focus:outline-none focus:ring-2 focus:ring-primary ${
        currentPage === page
          ? 'bg-[#E1F5EE] dark:bg-[#00694C]/30 text-[#00694C] dark:text-[#5DCAA5]'
          : 'text-[#0B1E26] dark:text-slate-400 opacity-70 hover:opacity-100'
      }`}
    >
      <span aria-hidden="true" className="material-symbols-outlined" style={{ fontVariationSettings: currentPage === page ? '"FILL" 1' : '"FILL" 0' }}>{icon}</span>
      <span className="font-['Manrope'] font-medium text-[10px] tracking-wide">{label}</span>
    </button>
  );

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3 bg-[#F4FAFF]/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-[0_-8px_32px_rgba(11,30,38,0.04)] rounded-t-[32px]">
      {btn('home', 'home', t('nav.home'))}
      {btn('pay', 'swap_horiz', t('nav.pay'))}
      {isMerchant
        ? btn('inbox', 'inbox', t('nav.inbox'))
        : btn('cetes', 'savings', t('nav.invest'))
      }
      {btn('explore', 'explore', t('nav.explore'))}
      {btn('profile', 'person', t('nav.profile'))}
    </nav>
  );
};

export default BottomNav;
