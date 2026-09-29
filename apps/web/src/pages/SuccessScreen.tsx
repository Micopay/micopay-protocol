import { Logo } from '../components/Logo';
import { useTranslation } from 'react-i18next';

interface SuccessScreenProps {
    type: 'cashout' | 'deposit';
    amount: string;
    commission: string;
    received: string;
    agentName: string;
    tradeId?: string;
    lockTxHash?: string | null;
    status?: string;
    onHome: () => void;
}

const STELLAR_EXPLORER = 'https://stellar.expert/explorer/testnet/tx';

const SuccessScreen = ({ type, amount, commission, received, agentName, tradeId, lockTxHash, status, onHome }: SuccessScreenProps) => {
    const { t } = useTranslation();
    return (
        <main className="min-h-screen flex flex-col items-center justify-between px-6 py-12 max-w-md mx-auto bg-surface-container-lowest font-body text-on-surface antialiased">
            {/* Success Header Section */}
            <section className="w-full flex flex-col items-center text-center mt-8">
                <div className="bg-[#E1F5EE] w-[72px] h-[72px] rounded-full flex items-center justify-center mb-8 shadow-sm">
                    <span className="material-symbols-outlined text-[#1D9E75] text-[40px]" style={{ fontVariationSettings: '"wght" 600' }}>
                        {type === 'cashout' ? 'check' : 'check_circle'}
                    </span>
                </div>
                <h1 className="font-headline font-extrabold text-4xl tracking-tight mb-2">
                    {type === 'cashout' ? '¡Listo, Juan!' : '¡Depósito exitoso!'}
                </h1>
                <p className="text-secondary font-medium text-lg opacity-70">
                    {type === 'cashout' ? 'Recibiste tu efectivo' : 'Tus MXNE ya están en tu wallet'}
                </p>
            </section>

            {/* Summary Card */}
            <section className="w-full bg-[#f6f7f8] rounded-[24px] p-6 my-8 space-y-5 shadow-sm">
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-medium text-sm">
                            {type === 'cashout' ? 'MXN enviados' : 'Efectivo entregado'}
                        </span>
                        <span className="font-bold text-on-surface">${amount}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-medium text-sm">
                            {type === 'cashout' ? 'Efectivo recibido' : 'MXNE recibidos'}
                        </span>
                        <span className="font-bold text-primary text-lg">
                            {type === 'cashout' ? received : `+${received}`}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-medium text-sm">Comisión</span>
                        <span className="font-medium text-on-surface">-${commission}</span>
                    </div>
                </div>

                <div className="h-[1px] w-full bg-outline-variant/10"></div>

                <div className="space-y-4">
                    <div className="flex justify-between items-start">
                        <span className="text-on-surface-variant font-medium text-sm">Agente</span>
                        <div className="text-right">
                            <p className="font-semibold text-on-surface text-sm">{agentName}</p>
                            <div className="flex items-center justify-end gap-1 mt-0.5 text-primary">
                                <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: '"FILL" 1' }}>verified</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider">Verificado</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-on-surface-variant font-medium text-sm">Fecha y hora</span>
                        <span className="text-on-surface text-sm font-medium">Hoy · 14:35 pm</span>
                    </div>
                    {status && (
                        <div className="flex justify-between items-center">
                            <span className="text-on-surface-variant font-medium text-sm">Estado</span>
                            <span className="font-semibold text-on-surface text-sm capitalize">
                                {t(`home.status.${status}`, { defaultValue: t('home.status.unknown') })}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            {/* Hash & Rating */}
            <div className="w-full space-y-8 text-center">
                <section>
                    {lockTxHash ? (
                        <a
                            href={`${STELLAR_EXPLORER}/${lockTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary font-bold text-sm hover:opacity-80 transition-opacity flex items-center justify-center gap-2 mx-auto"
                        >
                            Ver transacción on-chain
                            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        </a>
                    ) : (
                        <span className="text-primary font-bold text-sm opacity-40 flex items-center justify-center gap-2">
                            Ver transacción on-chain
                            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        </span>
                    )}
                    <p className="font-mono text-[11px] text-on-surface-variant opacity-60 tracking-tight mt-1">
                        {lockTxHash ? lockTxHash.substring(0, 16) + '…' : tradeId ? `Trade: ${tradeId.substring(0, 8)}…` : ''}
                    </p>
                </section>

                <section>
                    <p className="text-on-surface-variant font-medium text-sm mb-4">¿Cómo estuvo el servicio de {agentName}?</p>
                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <span 
                                key={star}
                                className="material-symbols-outlined text-outline-variant text-[32px] cursor-pointer hover:text-primary transition-colors"
                            >
                                star
                            </span>
                        ))}
                    </div>
                </section>
            </div>

            {/* Primary Action */}
            <div className="w-full pt-8">
                <button 
                    onClick={onHome}
                    className="w-full h-[54px] bg-gradient-to-r from-primary to-primary-container text-white font-bold rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                    Volver al inicio
                    <span className="material-symbols-outlined">arrow_forward</span>
                </button>
            </div>
        </main>
    );
};

export default SuccessScreen;
