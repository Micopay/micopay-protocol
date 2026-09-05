import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { getMerchantsAvailable, type AvailableMerchant } from '../services/api';

/** Una posición de hace unos minutos sirve igual para un radio de kilómetros. */
const FIVE_MINUTES_MS = 5 * 60 * 1000;

export type MerchantsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'location_denied'; error: string }
  | { status: 'error'; error: string }
  | { status: 'empty' }
  | { status: 'success'; merchants: AvailableMerchant[]; userPosition: { lat: number; lng: number } };

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
          // Pedimos el alias `coarseLocation`, NO `location`.
          //
          // El plugin define dos alias: `location` = ACCESS_COARSE_LOCATION +
          // ACCESS_FINE_LOCATION, y `coarseLocation` = solo la aproximada.
          // T-19 (faff4b2) retiró FINE del manifiesto porque el mapa de agentes
          // no la necesita, pero esta verja siguió preguntando por `location`:
          // un alias que incluye un permiso no declarado nunca puede concederse,
          // así que el descubrimiento quedó muerto en el dispositivo aunque el
          // usuario tuviera la ubicación aproximada concedida.
          //
          // `getCurrentPosition({ enableHighAccuracy: false })` ya elige por su
          // cuenta el alias aproximado en Android 12+; esto solo alinea la
          // comprobación previa con lo que la app realmente usa.
          const perm = await Geolocation.checkPermissions();
          if (perm.coarseLocation !== 'granted') {
            const req = await Geolocation.requestPermissions({
              permissions: ['coarseLocation'],
            });
            if (req.coarseLocation !== 'granted') {
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

        // `maximumAge` por defecto es 0: el plugin rechaza cualquier posición
        // cacheada y se queda esperando un fix nuevo. En un teléfono con solo
        // ubicación aproximada, bajo techo, ese fix puede no llegar nunca dentro
        // del timeout — y la pantalla se queda en "Buscando ofertas" hasta que
        // expira, aunque el sistema tenga una posición perfectamente buena de
        // hace unos minutos.
        //
        // Para buscar agentes en un radio de kilómetros, una posición de hace
        // cinco minutos es indistinguible de una recién tomada.
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: FIVE_MINUTES_MS,
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
                timeout: 15000,
                maximumAge: FIVE_MINUTES_MS,
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

        setState(
          merchants.length === 0
            ? { status: 'empty' }
            : { status: 'success', merchants, userPosition: { lat, lng } },
        );
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            // Distinto del fallo de ubicación a propósito: son dos causas que
            // la pantalla mostraba igual, y confundirlas cuesta horas.
            error: 'No se pudo contactar al servidor de ofertas. Revisa tu conexión.',
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
