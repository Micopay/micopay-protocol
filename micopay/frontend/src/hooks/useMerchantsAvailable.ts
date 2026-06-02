import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { getMerchantsAvailable, type AvailableMerchant } from '../services/api';

export type MerchantsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'location_denied'; error: string }
  | { status: 'error'; error: string }
  | { status: 'empty' }
  | { status: 'success'; merchants: AvailableMerchant[] };

interface Options {
  amount_mxn: number;
  radius_km?: number;
  flow?: 'cashout' | 'deposit';
  /** Skip fetching until this is true (e.g. wait for geolocation) */
  enabled?: boolean;
}

/**
 * Fetches available merchants near the user's current position.
 *
 * Handles:
 *  - Geolocation permission request (Capacitor-aware)
 *  - Loading / empty / error / location-denied states
 *  - Re-fetch when amount or position changes
 */
export function useMerchantsAvailable(options: Options): {
  state: MerchantsState;
  refetch: () => void;
} {
  const { amount_mxn, radius_km = 5, flow, enabled = true } = options;

  const [state, setState] = useState<MerchantsState>({ status: 'idle' });
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t: number) => t + 1), []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setState({ status: 'loading' });

    async function run() {
      // ── 1. Acquire geolocation ──────────────────────────────────────────
      let lat: number;
      let lng: number;

      try {
        if (Capacitor.isNativePlatform()) {
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== 'granted') {
            const req = await Geolocation.requestPermissions();
            if (req.location !== 'granted') {
              if (!cancelled) {
                setState({
                  status: 'location_denied',
                  error: 'Permiso de ubicación denegado. Actívalo en Ajustes para ver agentes cercanos.',
                });
              }
              return;
            }
          }
        }

        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 8000,
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch (geoErr: unknown) {
        if (cancelled) return;

        // On web, fall back to browser Geolocation API
        if (!Capacitor.isNativePlatform() && navigator.geolocation) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 8000,
              });
            });
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
          } catch (browserErr: unknown) {
            if (!cancelled) {
              const isPermissionDenied =
                browserErr instanceof GeolocationPositionError &&
                browserErr.code === GeolocationPositionError.PERMISSION_DENIED;

              setState({
                status: isPermissionDenied ? 'location_denied' : 'error',
                error: isPermissionDenied
                  ? 'Permiso de ubicación denegado. Actívalo en Ajustes para ver agentes cercanos.'
                  : 'No se pudo obtener tu ubicación. Intenta de nuevo.',
              });
            }
            return;
          }
        } else {
          setState({
            status: 'error',
            error: geoErr instanceof Error ? geoErr.message : 'No se pudo obtener tu ubicación.',
          });
          return;
        }
      }

      if (cancelled) return;

      // ── 2. Fetch merchants ──────────────────────────────────────────────
      try {
        const merchants = await getMerchantsAvailable({
          lat,
          lng,
          radius_km,
          amount_mxn,
          flow,
        });

        if (cancelled) return;

        setState(merchants.length === 0 ? { status: 'empty' } : { status: 'success', merchants });
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            error: 'No pudimos cargar las ofertas. Revisa tu conexión e intenta de nuevo.',
          });
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [enabled, amount_mxn, radius_km, flow, tick]);

  return { state, refetch };
}
