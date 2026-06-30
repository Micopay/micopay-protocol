import { useState } from 'react';
import { completeTrade, TradeData } from '../services/api';

interface DepositQRProps {
    activeTrade: TradeData | null;
    buyerToken: string | null;
    onBack: () => void;
    onChat: () => void;
    onSuccess: (releaseTxHash: string) => void;
}

const DepositQR = ({ activeTrade, buyerToken, onBack, onChat, onSuccess }: DepositQRProps) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleComplete = async () => {
        if (!activeTrade || !buyerToken) return;
        setIsConfirming(true);
        setError(null);
        try {
            const result = await completeTrade(activeTrade.id, buyerToken);
            setTimeout(() => onSuccess(result.release_tx_hash), 1500);
        } catch (e) {
            console.error('Deposit completion failed', e);
            setIsConfirming(false);
            setPin('');
            setError('No se pudo completar el depósito. Intenta de nuevo.');
        }
    };

    return (
        <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col">
            {/* TopAppBar */}
            <header className="bg-[#F4FAFF] w-full top-0 sticky flex items-center justify-between px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] z-50">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="text-[#00694C] active:scale-95 duration-200">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                            <h1 className="font-headline font-bold text-xl text-[#0B1E26]">Depósito</h1>
                            <span className="material-symbols-outlined text-[#00694C] text-[18px]" style={{ fontVariationSettings: '"FILL" 1' }}>verified</span>
                        </div>
                        <span className="text-[10px] tracking-wide uppercase font-semibold text-primary">Agente Autorizado</span>
                    </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center overflow-hidden">
                    <img
                        alt="User Profile"
                        className="w-full h-full object-cover"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKtGmlK9lRTQqDgKWWxCpzzjhH6AVdcuHK_OmrECeSWTtfYZXttDqAXUbcUt3N7mNRgIrdDC-rzkm7QhL5aHJEIj66NQsWFL7blIxtsKfz7sW8xoE84bcZwZQKFjTbC0ctzIeMHkkVA4Poc4OAKPNmnJMNi0CmKIcJewWKQ04I4ZRF0NALv8PTBEcuApZVwafge5pjDjodq-9720hX1TTnUKImWXRphyYvkmvVuw_UtZQWopSZJmJAU7v5slxmO6QXYEgh_F5WKn2v"
                    />
                </div>
            </header>

            <main className="flex-1 px-6 pt-4 pb-32 max-w-md mx-auto w-full space-y-6">
                {/* Status Banner */}
                <div className="bg-primary/10 rounded-xl p-4 flex items-center gap-3 border border-primary/20">
                    <div className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </div>
                    <p className="font-headline font-bold text-primary tracking-tight">Ve al agente y entrégale el efectivo</p>
                </div>

                {/* Chat Preview */}
                <section>
                    <div className="bg-surface-container-lowest border border-surface-container-low p-4 rounded-2xl shadow-sm">
                        <div className="flex gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-surface-container-high flex-shrink-0 flex items-center justify-center overflow-hidden">
                                <img
                                    alt="Store"
                                    className="w-full h-full object-cover"
                                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCdc2bgOszS_GKqShcTimO9xO4li98JYZSAM4J3KUtr7ijh1lTKkR5cnkCMKc7uRs8byC-L448t0UzSmCUqUw6O0VLxfByjMAPP2kke6OMAIpP5OjjibElzXxTD2RDaQY4dGSpUFVW_QsKBoNFIEuFfUBwpm2E_UyBumuFY-bAqxUJm7qV0lrGnPncQVbTVDhHVdTiXjwIEifagwUVn0mdIlcEAaa_teXFSFlQ2m9v0sl035tRphrFRbUDk4K4xjlEBqPNHWTlVdmUs"
                                />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-on-surface-variant leading-snug">
                                    <span className="font-bold text-on-surface">Agente:</span> Ya recibí tu solicitud.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onChat}
                                className="flex-1 py-2 px-4 rounded-lg border border-primary text-primary font-bold text-xs hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">chat</span>
                                Abrir chat
                            </button>
                            <button className="flex-1 py-2 px-4 rounded-lg border border-primary text-primary font-bold text-xs hover:bg-primary/5 transition-colors flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-sm">location_on</span>
                                Compartir ubicación
                            </button>
                        </div>
                    </div>
                </section>

                {/* QR Content Card */}
                <div className="bg-surface-container-low rounded-[32px] p-8 flex flex-col items-center space-y-6 shadow-[0px_32px_32px_rgba(11,30,38,0.04)]">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-outline-variant/20">
                        <img
                            alt="QR Code"
                            className="w-48 h-48"
                            src="https://lh3.googleusercontent.com/aida/ADBb0uiC4aumVX9b9_8EmaEY8cUXAiLnd8nTUFBI5mmLaPtMT3Clyhlnx0gH5SJ6Uj5VFZY0Sr8ws-esCWamCmWmfHoLXVuxzM4bhUTbxi-B54COrpyDslbaq5D1WXUJC-uBsG4aOoYcWhaIOQ_l6y11PbO3csV4TeweeHBGVvYt_RVlDPMWI7MEJQzUn67vmoW9Vs2vfWqZieZanDJZspbHwmIGca0ZjTvSQJXQF-e280fi32GIZ6Wwypi8ULwoObokwnr02p-rf_buYsI"
                        />
                    </div>
                    <div className="text-center space-y-2">
                        <p className="font-bold text-[11px] tracking-[0.15em] text-primary uppercase">MUESTRA ESTE CÓDIGO AL AGENTE</p>
                    </div>
                </div>

                {/* Info */}
                <div className="bg-surface-container-lowest rounded-2xl p-4 flex gap-4 items-start border border-surface-container-low shadow-sm">
                    <span className="material-symbols-outlined text-primary shrink-0">info</span>
                        <p className="text-[13px] leading-relaxed text-on-surface/80">
                        El comerciante acreditará el saldo a tu billetera después de recibir el efectivo y escanear este código.
                    </p>
                </div>

                {/* Error display */}
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium text-center">
                        {error}
                    </div>
                )}

                {/* Confirm Section */}
                <div className="pt-4">
                    {!isConfirming ? (
                        <button
                            onClick={handleComplete}
                            disabled={!activeTrade || !buyerToken}
                            className="w-full h-[52px] bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40"
                        >
                            <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
                            Ya entregué el efectivo al agente
                        </button>
                    ) : (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <div className="relative w-8 h-8">
                                <div className="absolute inset-0 border-4 border-surface-container-high rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            </div>
                            <p className="text-sm font-medium text-outline">Liberando tus activos digitales…</p>
                        </div>
                    )}
                    <p className="text-[11px] text-outline text-center mt-4 leading-relaxed px-2">
                        Solo confirma después de que el agente haya escaneado tu QR y hayas entregado el efectivo.
                    </p>
                </div>
            </main>
        </div>
    );
};

export default DepositQR;
