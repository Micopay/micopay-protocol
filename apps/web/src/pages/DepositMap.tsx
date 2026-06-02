import { useState, useEffect } from 'react';
import MapSim from '../components/MapSim';
import { getMerchants } from '../services/api';

interface MerchantData {
  id: string;
  display_name: string;
  latitude: number;
  longitude: number;
  address_text: string;
  hours_open: string;
  hours_close: string;
  base_rate: number;
  spread_percent: number;
  min_amount: number;
  max_amount: number;
  trades_completed: number;
  completion_rate: number;
  avg_time_minutes: number;
  tier: string;
  total_volume_usdc: number;
  last_trade_at: string | null;
}

interface DepositMapProps {
    onBack: () => void;
    onSelectOffer: (offerId: string) => void;
    loading?: boolean;
}

const DepositMap = ({ onBack, onSelectOffer, loading }: DepositMapProps) => {
    const [merchants, setMerchants] = useState<MerchantData[]>([]);
    const [loadingMerchants, setLoadingMerchants] = useState(true);

    useEffect(() => {
        const fetchMerchants = async () => {
            try {
                const data = await getMerchants();
                setMerchants(data);
            } catch (error) {
                console.error('Failed to fetch merchants:', error);
            } finally {
                setLoadingMerchants(false);
            }
        };
        fetchMerchants();
    }, []);

    // Mock offers for demo when no merchants available
    const demoMerchants: MerchantData[] = [
        {
            id: 'don_pepe',
            display_name: 'Tienda Don Pepe',
            latitude: 19.4326,
            longitude: -99.1332,
            address_text: 'Roma Norte, CDMX',
            hours_open: '08:00',
            hours_close: '21:00',
            base_rate: 17.0,
            spread_percent: 0.5,
            min_amount: 100,
            max_amount: 5000,
            trades_completed: 89,
            completion_rate: 0.94,
            avg_time_minutes: 7,
            tier: 'experto',
            total_volume_usdc: 2310.75,
            last_trade_at: new Date().toISOString(),
        },
        {
            id: 'ana_m',
            display_name: 'Usuario @ana_m',
            latitude: 19.4326,
            longitude: -99.1332,
            address_text: 'Roma Norte, CDMX',
            hours_open: '09:00',
            hours_close: '20:00',
            base_rate: 17.0,
            spread_percent: 0.8,
            min_amount: 50,
            max_amount: 3000,
            trades_completed: 45,
            completion_rate: 0.98,
            avg_time_minutes: 5,
            tier: 'maestro',
            total_volume_usdc: 5200.00,
            last_trade_at: new Date().toISOString(),
        },
    ];

    const displayMerchants = loadingMerchants ? [] : merchants.length > 0 ? merchants : demoMerchants;

    return (
        <div className="bg-surface text-on-surface min-h-screen pb-24">
            {/* TopAppBar */}
            <header className="w-full top-0 sticky bg-[#E7F6FF] transition-colors duration-300 shadow-[0px_32px_32px_rgba(11,30,38,0.04)] z-50">
                <div className="flex items-center justify-between px-6 py-4 w-full">
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={onBack}
                            className="text-[#00694C] active:scale-95 duration-200"
                        >
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <h1 className="font-headline font-bold text-xl text-[#00694C]">Ofertas de depósito</h1>
                    </div>
                </div>
            </header>

            <main className="max-w-xl mx-auto px-6 pt-8 space-y-8">
                {/* Summary Context */}
                <section className="space-y-2">
                    <span className="text-on-surface-variant font-label text-sm uppercase tracking-widest">Solicitud de depósito</span>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-4xl font-headline font-extrabold text-on-surface tracking-tight">$500</h2>
                        <span className="text-xl font-headline font-bold text-on-surface-variant">MXN</span>
                    </div>
                    <p className="text-on-surface-variant text-sm font-body">Buscando agentes y usuarios verificados cerca de ti.</p>
                </section>

                {/* Map View Section */}
                <section>
                    <MapSim type="deposit" />
                </section>

                {/* Offers List */}
                <div className="space-y-6">
                    {displayMerchants.map((merchant, index) => (
                        <div key={merchant.id} className="relative group">
                            {index === 0 && (
                                <div className="absolute -top-3 left-6 z-10">
                                    <span className="bg-primary text-on-primary text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">Mejor oferta</span>
                                </div>
                            )}
                            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-[0px_32px_32px_rgba(11,30,38,0.04)] ring-1 ring-outline-variant/10 flex flex-col gap-5 transition-transform hover:scale-[1.01] duration-300">
                                <div className="flex justify-between items-start">
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 bg-primary-fixed rounded-xl flex items-center justify-center text-primary">
                                            <span className="material-symbols-outlined" style={{ fontVariationSettings: '"FILL" 1' }}>storefront</span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-1">
                                                <h3 className="font-bold text-lg">{merchant.display_name}</h3>
                                                {merchant.completion_rate >= 0.88 && (
                                                    <span className="material-symbols-outlined text-accent text-sm" style={{ fontVariationSettings: '"FILL" 1' }}>verified</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 text-on-surface-variant text-xs">
                                                <span className="material-symbols-outlined text-xs">near_me</span>
                                                <span>120m de distancia</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-xs text-on-surface-variant font-label uppercase">Comisión</span>
                                        <span className="text-primary font-bold">${(merchant.max_amount * 0.005).toFixed(0)} MXN</span>
                                    </div>
                                </div>
                                <div className="bg-surface-container-low rounded-lg p-4 flex justify-between items-center">
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-tight">Recibimos</p>
                                        <p className="font-bold text-on-surface">$500 MXN</p>
                                    </div>
                                    <span className="material-symbols-outlined text-outline-variant">trending_flat</span>
                                    <div className="space-y-1 text-right">
                                        <p className="text-[10px] text-accent uppercase font-bold tracking-tight">Recibes</p>
                                        <p className="font-bold text-on-surface text-lg">{(500 - (500 * 0.005)).toFixed(0)} MXN</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onSelectOffer(merchant.id)}
                                    disabled={loading}
                                    className="w-full h-[46px] bg-gradient-to-r from-primary to-primary-container text-white font-semibold rounded-lg shadow-md active:scale-95 duration-200 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-wait"
                                >
                                    {loading ? 'Bloqueando fondos…' : 'Aceptar esta oferta'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Informative note */}
                <div className="bg-surface-container-low rounded-2xl p-6 border border-primary/10">
                    <div className="flex gap-4">
                        <span className="material-symbols-outlined text-primary">info</span>
                        <p className="text-sm text-on-surface-variant leading-relaxed">
                            Las ofertas están basadas en la tasa de cambio actual y la cercanía de los agentes. Todas las transacciones están protegidas por el contrato de depósito en garantía de MicoPay.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default DepositMap;
