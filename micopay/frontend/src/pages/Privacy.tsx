import { PRIVACY_EMAIL } from '../constants/contact';
import i18n from '../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

interface PrivacyProps {
  onBack: () => void;
}

const Privacy = ({ onBack }: PrivacyProps) => {
  return (
    <div className="bg-fondo text-tinta min-h-screen flex flex-col pb-10">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center gap-4 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] bg-papel border-b-2 border-tinta/60">
        <button
          onClick={onBack}
          className="min-h-12 min-w-12 flex items-center justify-center rounded-sm hover:bg-[#EFF6FA] transition-colors"
          aria-label={tr('privacy.back')}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="font-bold text-lg leading-tight">{tr('privacy.title')}</h1>
          <p className="text-[11px] text-gris">{tr('privacy.updated')}</p>
        </div>
      </header>

      <main className="flex-1 mt-[calc(5rem+env(safe-area-inset-top))] px-4 pt-4 space-y-5 max-w-lg mx-auto w-full">
        <div className="bg-amber-50 border border-amber-200 rounded-sm px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 mt-0.5 text-lg">info</span>
          <p className="text-sm text-amber-800 font-medium">{tr('privacy.draft')}</p>
        </div>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('privacy.s1Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('privacy.s1Body')}</p>
          <p className="text-sm text-gris leading-relaxed">
            <strong>{tr('privacy.s1IdvTitle')}</strong> {tr('privacy.s1IdvBody')} <strong>{tr('privacy.s1IdvSensitive')}</strong>{tr('privacy.s1IdvConsent')}
          </p>
          <p className="text-sm text-gris leading-relaxed">{tr('privacy.s1Storage')}</p>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('privacy.s2Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('privacy.s2Intro')}</p>
          <ul className="text-sm text-gris leading-relaxed list-disc pl-5 space-y-1">
            <li>{tr('privacy.s2Item1')}</li>
            <li>{tr('privacy.s2Item2')}</li>
            <li>{tr('privacy.s2Item3')}</li>
            <li>{tr('privacy.s2Item4')}</li>
          </ul>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('privacy.s3Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('privacy.s3Body')}</p>
          <p className="text-sm text-gris leading-relaxed">{tr('privacy.s3Providers')}</p>
          <ul className="text-sm text-gris leading-relaxed list-disc pl-5 space-y-1">
            <li><strong>Didit:</strong> {tr('privacy.s3Didit')}</li>
            <li><strong>Etherfuse:</strong> {tr('privacy.s3Etherfuse')}</li>
          </ul>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('privacy.s4Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('privacy.s4Body')}</p>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('privacy.s5Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('privacy.s5Intro')}</p>
          <ul className="text-sm text-gris leading-relaxed list-disc pl-5 space-y-2">
            <li><strong>{tr('privacy.s5AnonTitle')}</strong> {tr('privacy.s5AnonBody')}</li>
            <li><strong>{tr('privacy.s5DeleteTitle')}</strong> {tr('privacy.s5DeleteBody')}</li>
            <li><strong>{tr('privacy.s5ChatTitle')}</strong> {tr('privacy.s5ChatBody')}</li>
            <li><strong>{tr('privacy.s5LedgerTitle')}</strong> {tr('privacy.s5LedgerBody')}</li>
          </ul>
          <p className="text-sm text-gris leading-relaxed">
            {tr('privacy.s5Contact')} <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary hover:underline">{PRIVACY_EMAIL}</a>.
          </p>
        </section>

        <section className="bg-papel rounded-sm p-5 border-2 border-tinta/60 space-y-4">
          <h2 className="font-bold text-base text-tinta">{tr('privacy.s6Title')}</h2>
          <p className="text-sm text-gris leading-relaxed">{tr('privacy.s6Body')}</p>
        </section>
      </main>
    </div>
  );
};

export default Privacy;
