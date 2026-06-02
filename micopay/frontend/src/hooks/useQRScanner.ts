import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { resolveErrorMessage } from '../constants/errorMap';

export interface ScanResult {
  value: string | null;
  error?: string;
}

export function useQRScanner() {
  const scan = useCallback(async (): Promise<ScanResult> => {
    if (!Capacitor.isNativePlatform()) {
      const value = window.prompt('El escáner de QR sólo está disponible en el teléfono. Pega el contenido aquí:');
      return { value: value && value.trim() ? value.trim() : null };
    }

    const mod = await import('@capacitor-mlkit/barcode-scanning');
    const { BarcodeScanner, BarcodeFormat } = mod;

    const perm = await BarcodeScanner.requestPermissions();
    if (perm.camera !== 'granted' && perm.camera !== 'limited') {
      return { value: null, error: resolveErrorMessage({ message: 'camera_denied' }).message };
    }

    const supported = await BarcodeScanner.isSupported();
    if (!supported.supported) {
      return { value: null, error: resolveErrorMessage({ message: 'scan_failed' }).message };
    }

    try {
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode],
      });
      return { value: barcodes[0]?.rawValue ?? null };
    } catch (e) {
      return { value: null, error: resolveErrorMessage({ message: 'scan_failed' }).message };
    }
  }, []);

  return { scan };
}
