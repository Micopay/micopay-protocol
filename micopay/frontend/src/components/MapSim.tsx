import type { AvailableMerchant } from '../services/api';

interface MapSimProps {
    type?: 'cashout' | 'deposit';
    merchants?: AvailableMerchant[];
    selectedMerchantId?: string | null;
    onSelectMerchant?: (merchantId: string) => void;
}

interface MerchantPin {
    merchant: AvailableMerchant;
    top: number;
    left: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function getMerchantPins(merchants: AvailableMerchant[]): MerchantPin[] {
    const validMerchants = merchants.filter(
        (merchant) => Number.isFinite(merchant.latitude) && Number.isFinite(merchant.longitude),
    );

    if (validMerchants.length === 0) return [];

    const latitudes = validMerchants.map((merchant) => merchant.latitude);
    const longitudes = validMerchants.map((merchant) => merchant.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const latSpan = maxLat - minLat;
    const lngSpan = maxLng - minLng;

    return validMerchants.map((merchant, index) => {
        const fallbackOffset = validMerchants.length === 1 ? 0 : (index / Math.max(validMerchants.length - 1, 1)) - 0.5;
        const rawLeft = lngSpan === 0 ? 0.5 + fallbackOffset * 0.35 : (merchant.longitude - minLng) / lngSpan;
        const rawTop = latSpan === 0 ? 0.5 - fallbackOffset * 0.25 : (maxLat - merchant.latitude) / latSpan;

        return {
            merchant,
            left: clamp(12 + rawLeft * 76, 12, 88),
            top: clamp(16 + rawTop * 68, 16, 84),
        };
    });
}

const mushroomImages = ['/mushroom_red.png', '/mushroom_green.png', '/mushroom_gold.png'];

const MapSim = ({
    type = 'cashout',
    merchants = [],
    selectedMerchantId,
    onSelectMerchant,
}: MapSimProps) => {
    const pins = getMerchantPins(merchants);

    return (
        <div className="relative w-full h-64 bg-surface-container-low rounded-[32px] overflow-hidden border border-outline-variant/30 shadow-inner group">
            {/* Real Map Background */}
            <div className="absolute inset-0 opacity-80 group-hover:scale-105 transition-transform duration-[20s] ease-linear">
                <img
                    src="/map_bg.png"
                    alt="Mexico City Map"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent"></div>
            </div>

            {/* Simulated Street Glow Overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,rgba(255,255,255,0.1)_100%)] pointer-events-none"></div>

            {/* User Location Pulse */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 bg-primary/20 rounded-full animate-ping absolute"></div>
                <div className="w-6 h-6 bg-primary rounded-full border-2 border-white shadow-[0_0_15px_rgba(0,105,76,0.5)] relative z-10"></div>
            </div>

            {/* Merchant pins projected from API latitude/longitude. */}
            {pins.map(({ merchant, top, left }, index) => {
                const canSelect = Boolean(onSelectMerchant);
                const isSelected = selectedMerchantId === merchant.seller_id;
                const image = type === 'deposit' ? '/mushroom_green.png' : mushroomImages[index % mushroomImages.length];

                return (
                    <button
                        key={merchant.seller_id}
                        type="button"
                        onClick={() => onSelectMerchant?.(merchant.seller_id)}
                        disabled={!canSelect}
                        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-bounce-slow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full disabled:cursor-default"
                        style={{
                            top: `${top}%`,
                            left: `${left}%`,
                            animationDelay: `${index * 0.2}s`,
                        }}
                        aria-label={`Seleccionar ${merchant.username}`}
                        aria-pressed={canSelect ? isSelected : undefined}
                    >
                        <span className={`relative w-14 h-14 cursor-pointer transition-transform ${isSelected ? 'scale-125' : 'hover:scale-110'}`}>
                            <span className={`absolute inset-0 rounded-full blur-md animate-pulse ${isSelected ? 'bg-primary/40' : 'bg-primary/20'}`}></span>
                            <img src={image} alt="" className="w-full h-full object-contain relative z-10 drop-shadow-lg" />
                        </span>
                        <span className={`backdrop-blur-sm px-3 py-1 rounded-full mt-1 shadow-md border text-[9px] font-bold whitespace-nowrap ${isSelected ? 'bg-primary text-white border-primary' : 'bg-white/95 text-on-surface border-outline-variant/20'}`}>
                            {merchant.username}
                        </span>
                    </button>
                );
            })}

            {/* Location Label Floating */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-outline-variant/10 flex items-center gap-2 shadow-lg z-20">
                <span className="material-symbols-outlined text-primary text-sm font-bold">location_on</span>
                <p className="text-[10px] font-bold text-on-surface uppercase tracking-widest">CDMX · ZONA CENTRO</p>
            </div>

            {/* Live Indicator */}
            <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 z-20">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_#4ade80]"></div>
                <p className="text-[9px] font-bold text-white uppercase tracking-tighter">Agentes reales cercanos</p>
            </div>

            <style>{`
                @keyframes bounce-slow {
                    0%, 100% { transform: translate(-50%, -50%) translateY(0); }
                    50% { transform: translate(-50%, -50%) translateY(-8px); }
                }
                .animate-bounce-slow {
                    animation: bounce-slow 4s infinite ease-in-out;
                }
            `}</style>
        </div>
    );
};

export default MapSim;
