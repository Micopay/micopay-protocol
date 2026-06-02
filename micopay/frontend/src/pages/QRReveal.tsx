import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { getSecret, completeTrade, TradeData } from '../services/api';
import { getTradeStateDebugOverride, normalizeTradeState, TradeState } from '../components/TradeStateBadge';
import SupportLink from '../components/SupportLink';

interface QRRevealProps {
    activeTrade: TradeData | null;
    sellerToken: string | null;
    buyerToken: string | null;
    amount: number;
    onBack: () => void;
    onChat: () => void;
    onSuccess: (releaseTxHash: string) => void;
}

const QRReveal = ({ activeTrade, sellerToken, buyerToken, amount, onBack, onChat, onSuccess }: QRRevealProps) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [qrPayload, setQrPayload] = useState<string>('MICOPAY:DEMO:mock_secret_for_ui_preview');
    const [secretLoaded, setSecretLoaded] = useState(false);
    const [tradeState, setTradeState] = useState<TradeState>('locked');

    // Fetch real HTLC secret from backend
    useEffect(() => {
        if (!activeTrade || !sellerToken) return;

        getSecret(activeTrade.id, sellerToken)
            .then(({ qr_payload }) => {
                setQrPayload(qr_payload);
                setSecretLoaded(true);
            })
            .catch((e) => {
                console.warn('Could not fetch secret, using demo QR', e);
            });
    }, [activeTrade, sellerToken]);

    useEffect(() => {
        const fallbackState: TradeState = secretLoaded ? 'revealed' : 'locked';
        const backendState = normalizeTradeState(activeTrade?.status, fallbackState);
        setTradeState(getTradeStateDebugOverride(backendState));
    }, [activeTrade?.status, secretLoaded]);

    const [completeError, setCompleteError] = useState<string | null>(null);

    const completePurchase = async () => {
        if (isConfirming || !activeTrade || !buyerToken) return;
        setIsConfirming(true);
        setCompleteError(null);
        setTradeState('pending_cash');
        try {
            const result = await completeTrade(activeTrade.id, buyerToken);
            setTradeState('completed');
            setTimeout(() => onSuccess(result.release_tx_hash), 1500);
        } catch (e) {
            console.error('Trade completion failed', e);
            setTradeState('revealed');
            setIsConfirming(false);
            setCompleteError('No se pudo completar la operación. Intenta de nuevo.');
        }
    };

    return (
        <div className="bg-surface font-body text-on-surface min-h-screen">
            {/* Top Navigation */}
            <header className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-md bg-white/90 border-b border-outline-variant/20">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} aria-label="Volver" className="p-2 hover:bg-surface-container-low rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary">
                        <span aria-hidden="true" className="material-symbols-outlined text-primary">arrow_back</span>
                    </button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <h1 className="font-headline font-bold text-lg text-on-surface">Farmacia Guadalupe</h1>
                            <span className="bg-secondary-container text-secondary text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Verificado</span>
                        </div>
                    </div>
                </div>
                <button aria-label="Más opciones" className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary">
                    <span aria-hidden="true" className="material-symbols-outlined text-primary">more_vert</span>
                </button>
            </header>

            <main className="pt-24 pb-12 px-6 max-w-md mx-auto">
                {/* Status Banner */}
                <div className="mb-8">
                    <div className="inline-flex items-center gap-2 bg-primary-container/10 border border-primary-container/20 px-4 py-2 rounded-full">
                        <span aria-hidden="true" className="material-symbols-outlined text-primary text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
                        <span className="text-primary font-semibold text-sm">
                            {secretLoaded ? '✓ Garantía en cadena · Fondos bloqueados' : '✓ Oferta aceptada · Saldo bloqueado'}
                        </span>
                    </div>
                </div>

                {/* Chat Preview Section */}
                <section className="mb-10">
                    <div className="bg-surface-container-lowest border border-surface-container-low p-4 rounded-2xl shadow-sm">
                        <div className="flex gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-surface-container-high flex-shrink-0 flex items-center justify-center overflow-hidden">
                                <img
                                    className="w-full h-full object-cover"
                                    alt="Pharmacist"
                                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuBKVHp5dyl0kxM83DVzGyzATg7Y2rWOd2uBB75zzCKjwdx5XBJ1hm2cpi0EmKLMdkS2b7KqgqNnQAO-bISXYa8IukOGxVY7WxThGBL_y_Mh2mQIdpi7A4P4yQFSg89545NSeRagiTRwjV-R0x8HVCIMo_BzpCAriGHdw3jgs8Wtw-D-3iFQYRhj1_1yo_b2o8RrrHMvwhxouUN3a-9SHvBQKrguCmQQV5tKNj1I70aK59bJHEhfMvqnNOvKg6gU9Tc834bGs8Xah50H"
                                />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-on-surface-variant">
                                    <span className="font-bold text-on-surface">Farmacia:</span>&nbsp;Estamos en Av. Juárez 34, a un costado del banco.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onChat}
                                aria-label="Abrir chat con el agente"
                                className="flex-1 py-2 px-4 rounded-lg border border-primary text-primary font-bold text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">chat</span>
                                Abrir chat
                            </button>
                            <button aria-label="Ver ubicación del agente" className="flex-1 py-2 px-4 rounded-lg border border-primary text-primary font-bold text-sm hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary">
                                <span aria-hidden="true" className="material-symbols-outlined text-sm">location_on</span>
                                Ubicación
                            </button>
                        </div>
                    </div>
                </section>

                {/* QR Section */}
                <section className="mb-10 text-center">
                    <h2 className="text-[11px] font-bold text-outline-variant uppercase tracking-[0.2em] mb-6">TU CÓDIGO DE OPERACIÓN</h2>
                    <div className="bg-surface-container-low p-8 rounded-[32px] inline-block mx-auto mb-6 border border-outline-variant/10 shadow-sm">
                        {/* Real QR generated from HTLC secret */}
                        <QRCodeSVG
                            value={qrPayload}
                            size={224}
                            bgColor="transparent"
                            fgColor="#1A1C1E"
                            level="M"
                            style={{ borderRadius: '12px' }}
                        />
                        <div className="mt-6">
                            <h3 className="font-headline font-extrabold text-xl text-on-surface">Juan Pérez</h3>
                            <p className="text-primary font-bold text-sm">@juanp</p>
                            <p className="mt-2 font-headline font-black text-2xl text-on-surface">${amount} MXN</p>
                            {secretLoaded && (
                                <p className="text-[10px] text-primary mt-1 font-mono opacity-70">
                                    Soroban HTLC · Testnet
                                </p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Confirm Section */}
                <section className="mb-10 text-center">
                    {completeError && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                            {completeError}
                        </div>
                    )}
                    {!isConfirming ? (
                        <button
                            onClick={completePurchase}
                            disabled={!activeTrade || !buyerToken}
                            aria-label="Confirmar recepción de efectivo"
                            className="w-full py-4 rounded-2xl bg-primary text-on-primary font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
                        >
                            <span aria-hidden="true" className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>check_circle</span>
                            Ya recibí el efectivo
                        </button>
                    ) : (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <div className="relative w-8 h-8">
                                <div className="absolute inset-0 border-4 border-surface-container-high rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            </div>
                            <p className="text-sm font-medium text-outline">Confirmando operación…</p>
                        </div>
                    )}
                </section>

                <footer className="mt-12 text-center pb-10 space-y-3">
                    <p className="text-[12px] text-outline leading-relaxed px-6 font-medium">
                        Si no se confirma en 30 min, la operación se cancelará automáticamente y tus fondos serán liberados.
                    </p>
                    <SupportLink tradeId={activeTrade?.id} state="QR_REVEAL" />
                </footer>
            </main>
        </div>
    );
};

export default QRReveal;
