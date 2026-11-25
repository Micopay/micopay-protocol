import { SUPPORT_EMAIL } from '../constants/contact';
import i18n from '../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

interface TermsProps {
  onBack: () => void;
}

const Terms = ({ onBack }: TermsProps) => {
  return (
    <div className="bg-fondo text-tinta min-h-screen flex flex-col pb-10">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center gap-4 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-papel border-b-2 border-tinta/60">
        <button
          onClick={onBack}
          className="min-h-12 min-w-12 flex items-center justify-center rounded-sm hover:bg-[#EFF6FA] transition-colors"
          aria-label={tr('terms.back')}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="font-bold text-lg leading-tight">{tr('terms.title')}</h1>
          <p className="text-[11px] text-gris">{tr('terms.updated')}</p>
        </div>
      </header>

      <main className="flex-1 mt-[calc(5rem+env(safe-area-inset-top))] px-4 pt-4 space-y-5 max-w-lg mx-auto w-full">
        <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 mt-0.5 text-lg">info</span>
          <p className="text-sm text-amber-800 font-medium">{tr('terms.draft')}</p>
        </div>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('terms.s1Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('terms.s1Body')}</p>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('terms.s2Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('terms.s2Body')}</p>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('terms.s3Title')}</h2>
          <ul className="text-sm text-gris leading-relaxed list-disc pl-5 space-y-1">
            <li>{tr('terms.s3Item1')}</li>
            <li>{tr('terms.s3Item2')}</li>
            <li>{tr('terms.s3Item3')}</li>
            <li>{tr('terms.s3Item4')}</li>
          </ul>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('terms.s4Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('terms.s4Body')}</p>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('terms.s5Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('terms.s5Body')}</p>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('terms.s6Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('terms.s6Body')}</p>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('terms.s7Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('terms.s7Body', { email: SUPPORT_EMAIL })}</p>
        </section>
      </main>
    </div>
  );
};

export default Terms;
