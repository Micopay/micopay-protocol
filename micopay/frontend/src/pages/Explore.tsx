import { useState, useEffect } from "react";
import { Logo } from "../components/Logo";
import { getHealth } from "../services/api";

interface ExploreProps {
  onBack?: () => void;
  onNavigate?: (page: string) => void;
}

const Explore = ({ onBack, onNavigate }: ExploreProps) => {
    return (
        <div className="bg-surface text-on-surface font-body min-h-screen flex flex-col pb-32">
            {/* Header */}
            <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90 border-b border-outline-variant/10">
                <Logo />
                    <div className="w-10 h-10 rounded-full border-2 border-primary-container overflow-hidden">
                    <img 
                        alt="Perfil de usuario" 
                        className="w-full h-full object-cover" 
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuB67y-i20YKZ74EdUyBhPSynmndCKS-h3EA_TY5I4DqJOMVotSw1KNKnJkRorXphGGSC2O37IzK3Ne0ucqSrLTuM5yBABSXmcqkmRAyds2slhc0jFDuu8bya9fX1W0jjxuPpCDkellmiwXSghk0lbLSUG_ZS_wCQ2m2oeltlvvyv4kQarhZZ8l-AC3gUy-wtgF301WK7zIlo5utKmx_I6CTuAQ_zqkXyiN6Di4UFiRzq5ASwVi017MoYgq_LhBYMO_AEIf4ZAHp1Dh" 
                    />
                </div>
            </header>

  useEffect(() => {
    getHealth()
      .then((data) => {
        if (data.features) setFeatures(data.features);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

                <div className="space-y-6">
                    {/* Etherfuse Cetes */}
                    <article className="bg-gradient-to-br from-primary/10 to-primary/5 p-6 rounded-[32px] border border-primary/10 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-md">
                                <span className="material-symbols-outlined text-primary text-3xl">trending_up</span>
                            </div>
                            <div>
                                <h2 className="font-headline font-bold text-xl text-on-surface">Haz crecer tus ahorros</h2>
                                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Inversión segura con Etherfuse</p>
                            </div>
                        </div>
                        <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
                            Regístrate y empieza a ganar **11.45% anual** con Cetes tokenizados. Tu dinero trabaja por ti con el respaldo del Gobierno de México.
                        </p>
                        <button
                            onClick={() => onNavigate?.('cetes')}
                            className="w-full bg-primary text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
                            Empezar a ahorrar
                            <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                    </article>

                    {/* Blend DeFi */}
                    <article className="bg-white/40 backdrop-blur-sm p-6 rounded-[32px] border border-outline-variant/10 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-md border border-outline-variant/10">
                                <span className="material-symbols-outlined text-on-surface text-3xl">account_balance</span>
                            </div>
                            <div>
                                <h2 className="font-headline font-bold text-xl text-on-surface">Pide un préstamo hoy</h2>
                                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Liquidez instantánea con Blend</p>
                            </div>
                        </div>
                        <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
                            ¿Necesitas efectivo? Usa tus criptos como garantía y recibe un préstamo digital al instante sin papeleo.
                        </p>
                        <button
                            onClick={() => onNavigate?.('blend')}
                            className="w-full border-2 border-primary text-primary font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2">
                            Ver cuánto puedo pedir
                            <span className="material-symbols-outlined text-sm">info</span>
                        </button>
                    </article>

                    {/* Etherfuse Ramps */}
                    <article className="bg-gradient-to-br from-primary/10 to-primary/5 p-6 rounded-[32px] border border-primary/10 shadow-sm relative overflow-hidden group active:scale-[0.98] transition-all">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-md">
                                <span className="material-symbols-outlined text-primary text-3xl">account_balance_wallet</span>
                            </div>
                            <div>
                                <h2 className="font-headline font-bold text-xl text-on-surface">Conecta tu Banco</h2>
                                <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Entrada y salida de fondos con Etherfuse</p>
                            </div>
                        </div>
                        <p className="text-sm text-on-surface-variant leading-relaxed mb-6">
                            Pasa dinero de tu cuenta de banco a MicoPay (o al revés) de forma segura y en segundos. Sin complicaciones.
                        </p>
                        <button className="w-full bg-on-surface text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2">
                            Mover dinero
                            <span className="material-symbols-outlined text-sm">sync_alt</span>
                        </button>
                    </article>
                </div>

                {/* Footer Section */}
                <footer className="mt-12 text-center">
                    <p className="text-xs text-outline font-medium">Impulsado por Stellar, Etherfuse y Blend</p>
                </footer>
            </main>
        </div>

        {/* Footer Section */}
        <footer className="mt-12 text-center">
          <p className="text-xs text-outline font-medium">
            Powered by Stellar, Etherfuse & Blend
          </p>
        </footer>
      </main>
    </div>
  );
};

export default Explore;
