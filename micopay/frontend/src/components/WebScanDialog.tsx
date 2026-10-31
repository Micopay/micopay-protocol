import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { finishWebScan, onWebScanRequest, pickScannedValue, usKeyToChar } from '../lib/webScan';

/* Escaneo en PC. El campo siempre tiene el foco: un lector USB o Bluetooth
   escribe ahi como un teclado y termina con Enter. La camara se enciende solo
   si la persona la pide, para no lanzar el permiso a quien usa un lector. */

export default function WebScanDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onWebScanRequest(setOpen);
    return () => onWebScanRequest(null);
  }, []);

  if (!open) return null;
  return createPortal(<Dialog />, document.body);
}

function Dialog() {
  const [text, setText] = useState('');
  const [camera, setCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const keys = useRef('');

  useEffect(() => {
    inputRef.current?.focus();
  }, [camera]);

  useEffect(() => {
    if (!camera) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        const { default: jsQR } = await import('jsqr');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        const tick = () => {
          if (stopped) return;
          if (video.videoWidth) {
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = video.videoWidth * scale;
            canvas.height = video.videoHeight * scale;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(image.data, image.width, image.height);
            if (code?.data) {
              finishWebScan(code.data);
              return;
            }
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        console.error('[WebScanDialog]', e);
        const denied = e instanceof DOMException && e.name === 'NotAllowedError';
        setCameraError(denied
          ? 'El navegador no dio permiso para usar la cámara. Actívalo junto a la dirección de la página.'
          : 'No encontramos una cámara disponible. Usa un lector externo o pega el código.');
        setCamera(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [camera]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') finishWebScan(null);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') keys.current = keys.current.slice(0, -1);
    const char = usKeyToChar(e.code, e.shiftKey);
    if (char) keys.current += char;
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = pickScannedValue(text, keys.current);
    if (value) finishWebScan(value);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-tinta/70 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="web-scan-title" className="w-full max-w-md rounded-sm border-2 border-tinta bg-papel shadow-solida">
        <div className="flex items-center justify-between bg-tinta px-5 py-3 text-papel">
          <h2 id="web-scan-title" className="text-[12px] font-bold uppercase tracking-[.14em]">Escanear código</h2>
          <button type="button" onClick={() => finishWebScan(null)} aria-label="Cerrar" className="flex min-h-8 min-w-8 items-center justify-center">
            <span aria-hidden="true" className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block">
            <span className="text-sm font-bold text-tinta">Lector externo o código pegado</span>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (!e.target.value) keys.current = '';
              }}
              onKeyDown={onKeyDown}
              onPaste={() => { keys.current = ''; }}
              autoComplete="off"
              spellCheck={false}
              className="mt-1.5 min-h-12 w-full rounded-sm border-2 border-tinta bg-fondo px-3 py-2 text-[15px] text-tinta outline-none focus:border-naranja"
            />
            <span className="mt-1.5 block text-xs text-gris">
              Con un lector USB o Bluetooth, apunta al QR y dispara. El código aparece aquí solo.
            </span>
          </label>

          {camera && <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-sm border-2 border-tinta bg-tinta object-cover" />}
          {cameraError && <p role="alert" className="text-sm font-medium text-rojo">{cameraError}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setCameraError(null); setCamera((on) => !on); }}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-sm border-2 border-tinta font-bold text-tinta"
            >
              <span aria-hidden="true" className="material-symbols-outlined">{camera ? 'close' : 'qr_code_scanner'}</span>
              {camera ? 'Apagar cámara' : 'Usar cámara'}
            </button>
            <button type="submit" disabled={!text.trim()} className="min-h-12 flex-1 rounded-sm bg-verde font-bold text-papel disabled:opacity-50">
              Continuar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
