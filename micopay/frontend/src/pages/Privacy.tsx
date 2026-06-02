interface PrivacyProps {
  onBack: () => void;
}

const Privacy = ({ onBack }: PrivacyProps) => {
  return (
    <div className="bg-[#F4FAFF] text-[#0B1E26] min-h-screen flex flex-col pb-10">
      <header className="fixed top-0 left-0 w-full z-50 flex items-center gap-4 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90 border-b border-[#D7E3EA]/60">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#EFF6FA] transition-colors"
          aria-label="Regresar"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div>
          <h1 className="font-bold text-lg leading-tight">Política de Privacidad</h1>
          <p className="text-[11px] text-[#67808C]">Última actualización: mayo 2026</p>
        </div>
      </header>

      <main className="flex-1 mt-20 px-4 pt-4 space-y-5 max-w-lg mx-auto w-full">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-amber-600 mt-0.5 text-lg">info</span>
          <p className="text-sm text-amber-800 font-medium">
            BORRADOR — Pendiente de revisión legal. No constituye asesoramiento jurídico.
          </p>
        </div>

        <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
          <h2 className="font-bold text-base text-[#0B1E26]">1. Información que recopilamos</h2>
          <p className="text-sm text-[#67808C] leading-relaxed">
            Recopilamos únicamente la información necesaria para operar el servicio: tu nombre de usuario,
            tu dirección pública de Stellar y el historial de transacciones asociado a tu cuenta.
            No recopilamos datos personales sensibles como nombre legal, CURP o datos bancarios completos.
          </p>
        </section>

        <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
          <h2 className="font-bold text-base text-[#0B1E26]">2. Cómo usamos tu información</h2>
          <p className="text-sm text-[#67808C] leading-relaxed">
            Usamos tu información exclusivamente para:
          </p>
          <ul className="text-sm text-[#67808C] leading-relaxed list-disc pl-5 space-y-1">
            <li>Procesar y verificar transacciones P2P</li>
            <li>Mostrar tu historial de operaciones</li>
            <li>Prevenir fraudes y operaciones duplicadas</li>
            <li>Cumplir con obligaciones legales aplicables</li>
          </ul>
        </section>

        <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
          <h2 className="font-bold text-base text-[#0B1E26]">3. Compartir datos con terceros</h2>
          <p className="text-sm text-[#67808C] leading-relaxed">
            No vendemos ni compartimos tu información personal con terceros con fines comerciales.
            Las transacciones se registran en la red pública de Stellar, lo cual es inherente al
            funcionamiento de la cadena de bloques.
          </p>
        </section>

        <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
          <h2 className="font-bold text-base text-[#0B1E26]">4. Seguridad</h2>
          <p className="text-sm text-[#67808C] leading-relaxed">
            Implementamos medidas técnicas razonables para proteger tu información, incluyendo
            cifrado en tránsito (HTTPS) y en reposo para datos sensibles. Sin embargo, ningún
            sistema es 100% seguro.
          </p>
        </section>

        <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
          <h2 className="font-bold text-base text-[#0B1E26]">5. Tus derechos</h2>
          <p className="text-sm text-[#67808C] leading-relaxed">
            Puedes solicitar la eliminación de tu cuenta y la anonimización de tus datos
            directamente desde la sección de Perfil de la app. Para otras solicitudes,
            contáctanos en privacidad@micopay.app.
          </p>
        </section>

        <section className="bg-white rounded-[24px] p-5 border border-[#D7E3EA]/60 shadow-sm space-y-4">
          <h2 className="font-bold text-base text-[#0B1E26]">6. Cambios a esta política</h2>
          <p className="text-sm text-[#67808C] leading-relaxed">
            Notificaremos cambios relevantes a través de la app. El uso continuo del servicio
            implica aceptación de la política vigente.
          </p>
        </section>
      </main>
    </div>
  );
};

export default Privacy;
