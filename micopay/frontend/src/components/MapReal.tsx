import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { AvailableMerchant } from '../services/api';

interface MapRealProps {
    type?: 'cashout' | 'deposit';
    merchants?: AvailableMerchant[];
    selectedMerchantId?: string | null;
    onSelectMerchant?: (merchantId: string) => void;
    /** Real user position; if null, fit-bounds only over merchants (or default view if none). */
    userPosition?: { lat: number; lng: number } | null;
    /** When true, renders a single draggable pin instead of merchant markers (location picker use case). */
    pickerMode?: boolean;
    /** Current picker pin position; if null while pickerMode is on, falls back to userPosition as the initial center. */
    pickerPosition?: { lat: number; lng: number } | null;
    /** Called with the new position when the picker pin is dragged. */
    onPickerPositionChange?: (position: { lat: number; lng: number }) => void;
}

const mushroomImages = ['/mushroom_red.png', '/mushroom_green.png', '/mushroom_gold.png'];

const DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

function buildMerchantMarkerElement(
    merchant: AvailableMerchant,
    image: string,
    isSelected: boolean,
    onSelectMerchant?: (merchantId: string) => void,
): HTMLElement {
    const wrapper = document.createElement('button');
    wrapper.type = 'button';
    wrapper.setAttribute('aria-label', `Seleccionar ${merchant.username}`);
    wrapper.className = 'flex flex-col items-center focus:outline-none';
    wrapper.style.background = 'transparent';
    wrapper.style.border = 'none';
    wrapper.style.padding = '0';
    wrapper.style.cursor = onSelectMerchant ? 'pointer' : 'default';

    const pinWrap = document.createElement('span');
    pinWrap.className = `relative w-14 h-14 block transition-transform ${isSelected ? 'scale-125' : ''}`;

    const glow = document.createElement('span');
    glow.className = `absolute inset-0 rounded-full blur-md animate-pulse ${isSelected ? 'bg-primary/40' : 'bg-primary/20'}`;
    pinWrap.appendChild(glow);

    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    img.className = 'w-full h-full object-contain relative z-10 drop-shadow-lg';
    pinWrap.appendChild(img);

    const label = document.createElement('span');
    label.className = `backdrop-blur-sm px-3 py-1 rounded-full mt-1 shadow-md border text-[9px] font-bold whitespace-nowrap block ${isSelected ? 'bg-primary text-white border-primary' : 'bg-white/95 text-on-surface border-outline-variant/20'}`;
    label.textContent = merchant.username;

    wrapper.appendChild(pinWrap);
    wrapper.appendChild(label);

    wrapper.addEventListener('click', () => onSelectMerchant?.(merchant.seller_id));

    return wrapper;
}

function buildPickerMarkerElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'relative flex flex-col items-center';
    container.style.width = '48px';
    container.style.cursor = 'grab';

    const glow = document.createElement('span');
    glow.className = 'absolute -top-1 w-12 h-12 rounded-full bg-primary/30 blur-md animate-pulse';
    container.appendChild(glow);

    const pin = document.createElement('div');
    pin.className = 'relative z-10 w-9 h-9 rounded-full bg-primary border-4 border-white shadow-[0_0_15px_rgba(0,105,76,0.5)] flex items-center justify-center';
    const dot = document.createElement('span');
    dot.className = 'w-2.5 h-2.5 rounded-full bg-white';
    pin.appendChild(dot);
    container.appendChild(pin);

    return container;
}

function buildUserMarkerElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'relative flex items-center justify-center';
    container.style.width = '64px';
    container.style.height = '64px';

    const pulse = document.createElement('div');
    pulse.className = 'w-16 h-16 bg-primary/20 rounded-full animate-ping absolute';
    container.appendChild(pulse);

    const dot = document.createElement('div');
    dot.className = 'w-6 h-6 bg-primary rounded-full border-2 border-white shadow-[0_0_15px_rgba(0,105,76,0.5)] relative z-10';
    container.appendChild(dot);

    return container;
}

/**
 * Real MapLibre GL map. Drop-in replacement for the deprecated `MapSim`
 * (same visual footprint + prop-compatible superset), but renders actual
 * tiles/pan/zoom centered on the user's real GPS position instead of a
 * static PNG.
 */
const MapReal = ({
    type = 'cashout',
    merchants = [],
    selectedMerchantId,
    onSelectMerchant,
    userPosition = null,
    pickerMode = false,
    pickerPosition = null,
    onPickerPositionChange,
}: MapRealProps) => {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const userMarkerRef = useRef<maplibregl.Marker | null>(null);
    const pickerMarkerRef = useRef<maplibregl.Marker | null>(null);
    // Keep the latest callback in a ref so the marker's dragend listener (bound once
    // per marker instance) always calls the current handler without re-creating the marker.
    const onPickerPositionChangeRef = useRef(onPickerPositionChange);
    onPickerPositionChangeRef.current = onPickerPositionChange;

    const styleUrl = import.meta.env.VITE_MAP_STYLE_URL || DEMO_STYLE_URL;
    const usingFallbackStyle = !import.meta.env.VITE_MAP_STYLE_URL;

    // Create the map once on mount.
    useEffect(() => {
        if (!containerRef.current) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: styleUrl,
            center: [-99.1332, 19.4326], // Mexico City default, used only until fitBounds/setCenter runs below.
            zoom: 11,
            attributionControl: false,
        });

        mapRef.current = map;

        return () => {
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
            userMarkerRef.current?.remove();
            userMarkerRef.current = null;
            pickerMarkerRef.current?.remove();
            pickerMarkerRef.current = null;
            map.remove();
            mapRef.current = null;
        };
        // Intentionally only on mount: style URL is effectively static per build.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Picker mode: single draggable pin, no merchant markers, no fitBounds-over-merchants logic.
    useEffect(() => {
        if (!pickerMode) return;
        const map = mapRef.current;
        if (!map) return;

        const applyPickerUpdate = () => {
            const initialPosition = pickerPosition ?? userPosition;

            if (!pickerMarkerRef.current) {
                if (!initialPosition) return;
                const element = buildPickerMarkerElement();
                const marker = new maplibregl.Marker({ element, draggable: true })
                    .setLngLat([initialPosition.lng, initialPosition.lat])
                    .addTo(map);
                marker.on('dragend', () => {
                    const lngLat = marker.getLngLat();
                    onPickerPositionChangeRef.current?.({ lat: lngLat.lat, lng: lngLat.lng });
                });
                pickerMarkerRef.current = marker;
                map.setCenter([initialPosition.lng, initialPosition.lat]);
                map.setZoom(16);
            } else if (pickerPosition) {
                pickerMarkerRef.current.setLngLat([pickerPosition.lng, pickerPosition.lat]);
            }
        };

        if (map.isStyleLoaded()) {
            applyPickerUpdate();
        } else {
            map.once('load', applyPickerUpdate);
        }
    }, [pickerMode, pickerPosition, userPosition]);

    // Update markers + camera whenever merchants/selection/user position change.
    // Skipped entirely in picker mode — the picker effect above owns the map in that case.
    useEffect(() => {
        if (pickerMode) return;
        const map = mapRef.current;
        if (!map) return;

        const applyUpdate = () => {
            // Clear previous merchant markers.
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];

            const validMerchants = merchants.filter(
                (merchant) => Number.isFinite(merchant.latitude) && Number.isFinite(merchant.longitude),
            );

            validMerchants.forEach((merchant, index) => {
                const isSelected = selectedMerchantId === merchant.seller_id;
                const image = type === 'deposit' ? '/mushroom_green.png' : mushroomImages[index % mushroomImages.length];
                const element = buildMerchantMarkerElement(merchant, image, isSelected, onSelectMerchant);

                const marker = new maplibregl.Marker({ element })
                    .setLngLat([merchant.longitude, merchant.latitude])
                    .addTo(map);

                markersRef.current.push(marker);
            });

            // User marker.
            userMarkerRef.current?.remove();
            userMarkerRef.current = null;
            if (userPosition) {
                const userEl = buildUserMarkerElement();
                userMarkerRef.current = new maplibregl.Marker({ element: userEl })
                    .setLngLat([userPosition.lng, userPosition.lat])
                    .addTo(map);
            }

            // Camera.
            if (userPosition && validMerchants.length > 0) {
                const bounds = new maplibregl.LngLatBounds();
                bounds.extend([userPosition.lng, userPosition.lat]);
                validMerchants.forEach((merchant) => bounds.extend([merchant.longitude, merchant.latitude]));
                map.fitBounds(bounds, { padding: 48, maxZoom: 16 });
            } else if (validMerchants.length > 0) {
                const bounds = new maplibregl.LngLatBounds();
                validMerchants.forEach((merchant) => bounds.extend([merchant.longitude, merchant.latitude]));
                map.fitBounds(bounds, { padding: 48, maxZoom: 16 });
            } else if (userPosition) {
                map.setCenter([userPosition.lng, userPosition.lat]);
                map.setZoom(14);
            }
            // Neither user nor merchants: leave the map at its default style center/zoom.
        };

        if (map.isStyleLoaded()) {
            applyUpdate();
        } else {
            map.once('load', applyUpdate);
        }
    }, [merchants, selectedMerchantId, userPosition, type, onSelectMerchant, pickerMode]);

    return (
        <div className="relative w-full h-64 bg-surface-container-low rounded-[32px] overflow-hidden border border-outline-variant/30 shadow-inner group">
            <div ref={containerRef} className="absolute inset-0" />

            {merchants.length > 0 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-outline-variant/10 flex items-center gap-2 shadow-lg z-20 pointer-events-none">
                    <span className="material-symbols-outlined text-primary text-sm font-bold">location_on</span>
                    <p className="text-[10px] font-bold text-on-surface uppercase tracking-widest">
                        {t('map.agentsNearby', { count: merchants.length })}
                    </p>
                </div>
            )}

            {usingFallbackStyle && (
                <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2 z-20 pointer-events-none">
                    <p className="text-[9px] font-bold text-white uppercase tracking-tighter">{t('map.devMapNotice')}</p>
                </div>
            )}
        </div>
    );
};

export default MapReal;
