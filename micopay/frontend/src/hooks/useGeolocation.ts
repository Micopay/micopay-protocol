import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface GeoState {
  lat: number | null;
  lng: number | null;
  loading: boolean;
  error: string | null;
}

export function useGeolocation(enabled = true): GeoState {
  const [state, setState] = useState<GeoState>({
    lat: null,
    lng: null,
    loading: enabled,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const fetchPosition = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== 'granted') {
            const req = await Geolocation.requestPermissions();
            if (req.location !== 'granted') {
              if (!cancelled) {
                setState({ lat: null, lng: null, loading: false, error: 'No se permitió usar la ubicación' });
              }
              return;
            }
          }
        }

        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000 });
        if (cancelled) return;
        setState({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          lat: null,
          lng: null,
          loading: false,
          error: e instanceof Error ? e.message : 'No se pudo obtener la ubicación',
        });
      }
    };

    fetchPosition();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
