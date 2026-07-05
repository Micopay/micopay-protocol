import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

export type PermState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'permanently_denied';

// On Android: app-settings: scheme opens app info page in Capacitor WebView.
// Falls back to text instructions shown in PermissionGate.
function openAppSettings() {
  window.open('app-settings:', '_system');
}

// check-before-request pattern:
//   checkPermissions() === 'denied'  →  permanently_denied (Don't ask again was set)
//   checkPermissions() === 'prompt'  →  request → 'granted' | 'denied'
//
// check() reads current OS state without showing any dialog.
// request() does check first; only shows dialog when state is 'prompt'.

export function useCameraPermission() {
  const [state, setState] = useState<PermState>('unknown');

  const check = useCallback(async (): Promise<PermState> => {
    if (!Capacitor.isNativePlatform()) { setState('granted'); return 'granted'; }
    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
      const result = await BarcodeScanner.checkPermissions();
      const next: PermState =
        result.camera === 'granted' || result.camera === 'limited' ? 'granted' :
        result.camera === 'denied' ? 'permanently_denied' : 'prompt';
      setState(next);
      return next;
    } catch { return 'unknown'; }
  }, []);

  const request = useCallback(async (): Promise<PermState> => {
    if (!Capacitor.isNativePlatform()) { setState('granted'); return 'granted'; }
    try {
      const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
      const checked = await BarcodeScanner.checkPermissions();
      if (checked.camera === 'granted' || checked.camera === 'limited') { setState('granted'); return 'granted'; }
      if (checked.camera === 'denied') { setState('permanently_denied'); return 'permanently_denied'; }
      const req = await BarcodeScanner.requestPermissions();
      const next: PermState = req.camera === 'granted' || req.camera === 'limited' ? 'granted' : 'denied';
      setState(next);
      return next;
    } catch { setState('unknown'); return 'unknown'; }
  }, []);

  return { state, check, request, openSettings: openAppSettings };
}

export function useLocationPermission() {
  const [state, setState] = useState<PermState>('unknown');

  const check = useCallback(async (): Promise<PermState> => {
    if (!Capacitor.isNativePlatform()) { setState('prompt'); return 'prompt'; }
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const result = await Geolocation.checkPermissions();
      const next: PermState =
        result.location === 'granted' ? 'granted' :
        result.location === 'denied' ? 'permanently_denied' : 'prompt';
      setState(next);
      return next;
    } catch { return 'unknown'; }
  }, []);

  const request = useCallback(async (): Promise<PermState> => {
    if (!Capacitor.isNativePlatform()) { setState('prompt'); return 'prompt'; }
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const checked = await Geolocation.checkPermissions();
      if (checked.location === 'granted') { setState('granted'); return 'granted'; }
      // Capacitor reports 'denied' when "Don't ask again" is checked on Android
      if (checked.location === 'denied') { setState('permanently_denied'); return 'permanently_denied'; }
      const req = await Geolocation.requestPermissions();
      const next: PermState = req.location === 'granted' ? 'granted' : 'denied';
      setState(next);
      return next;
    } catch { setState('unknown'); return 'unknown'; }
  }, []);

  return { state, check, request, openSettings: openAppSettings };
}

