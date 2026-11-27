import { Capacitor } from '@capacitor/core';

/**
 * Voz del asistente.
 *
 * En el APK se usan los plugins nativos (SpeechRecognizer y TextToSpeech de
 * Android). En web/PWA se usa la Web Speech API cuando existe. La interfaz es
 * la misma para que la pantalla no tenga que saber en que plataforma corre.
 *
 * Si no hay reconocimiento disponible, la app no finge que escucha: la pantalla
 * desactiva el microfono y deja el teclado.
 */

type WebRecognitionCtor = new () => any;

let recognitionLoaded = false;
let recognitionPlugin: any = null;
let ttsLoaded = false;
let ttsPlugin: any = null;

function webRecognitionCtor(): WebRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as WebRecognitionCtor | null;
}

async function loadRecognition(): Promise<any | null> {
  if (recognitionLoaded) return recognitionPlugin;
  recognitionLoaded = true;
  try {
    const mod = await import('@capacitor-community/speech-recognition');
    recognitionPlugin = mod.SpeechRecognition ?? null;
  } catch {
    recognitionPlugin = null;
  }
  return recognitionPlugin;
}

async function loadTts(): Promise<any | null> {
  if (ttsLoaded) return ttsPlugin;
  ttsLoaded = true;
  try {
    const mod = await import('@capacitor-community/text-to-speech');
    ttsPlugin = mod.TextToSpeech ?? null;
  } catch {
    ttsPlugin = null;
  }
  return ttsPlugin;
}

export interface VoiceCapabilities {
  recognition: boolean;
  synthesis: boolean;
}

export async function voiceCapabilities(): Promise<VoiceCapabilities> {
  let recognition = Boolean(webRecognitionCtor());
  let synthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

  if (Capacitor.isNativePlatform()) {
    const sr = await loadRecognition();
    if (sr) {
      try {
        const available = await sr.available();
        recognition = Boolean(available?.available);
      } catch {
        recognition = false;
      }
    } else {
      recognition = false;
    }

    const tts = await loadTts();
    synthesis = Boolean(tts);
  }

  return { recognition, synthesis };
}

export interface ListenOptions {
  /** BCP-47: `es-MX` o `en-US`. */
  lang: string;
  onPartial?: (text: string) => void;
  onResult: (text: string) => void;
  onError: (code: string) => void;
}

export interface ListenHandle {
  stop: () => Promise<void>;
}

/**
 * Empieza a escuchar. Devuelve un handle para detenerlo.
 *
 * Lanza `MIC_PERMISSION_DENIED` si la persona niega el permiso y
 * `RECOGNITION_UNAVAILABLE` si la plataforma no puede escuchar.
 */
export async function startListening(opts: ListenOptions): Promise<ListenHandle> {
  if (Capacitor.isNativePlatform()) {
    const sr = await loadRecognition();
    if (!sr) throw new Error('RECOGNITION_UNAVAILABLE');

    const permission = await sr.checkPermissions();
    if (permission?.speechRecognition !== 'granted') {
      const requested = await sr.requestPermissions();
      if (requested?.speechRecognition !== 'granted') {
        throw new Error('MIC_PERMISSION_DENIED');
      }
    }

    let sent = false;
    const emit = (text: string) => {
      if (sent || !text.trim()) return;
      sent = true;
      opts.onResult(text.trim());
    };

    const handle: ListenHandle = {
      stop: async () => {
        try {
          await sr.stop();
        } catch {
          // Detener un reconocimiento que ya termino no es un error de la app.
        }
      },
    };

    // start resuelve cuando la persona termina de hablar. No se espera aqui:
    // el boton de detener tiene que funcionar mientras el microfono sigue vivo.
    void sr
      .start({
        language: opts.lang,
        maxResults: 1,
        partialResults: false,
        popup: false,
        prompt: '',
      })
      .then((result: { matches?: string[] }) => emit(result?.matches?.[0] ?? ''))
      .catch((error: unknown) => {
        opts.onError(error instanceof Error ? error.message : 'speech_error');
      });

    return handle;
  }

  const Ctor = webRecognitionCtor();
  if (!Ctor) throw new Error('RECOGNITION_UNAVAILABLE');

  const recognition = new Ctor();
  recognition.lang = opts.lang;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let sent = false;
  recognition.onresult = (event: any) => {
    const results = event?.results ?? [];
    for (let i = event?.resultIndex ?? 0; i < results.length; i++) {
      const result = results[i];
      const text = result?.[0]?.transcript ?? '';
      if (!text) continue;
      if (result.isFinal) {
        if (sent) continue;
        sent = true;
        opts.onResult(text.trim());
      } else {
        opts.onPartial?.(text);
      }
    }
  };
  recognition.onerror = (event: any) => {
    opts.onError(event?.error ?? 'speech_error');
  };
  recognition.onend = () => {
    // El navegador cierra solo; no hay nada que limpiar aqui.
  };
  recognition.start();

  return {
    stop: async () => {
      try {
        recognition.stop();
      } catch {
        // Igual que arriba: detener dos veces no es un fallo.
      }
    },
  };
}

export async function speak(text: string, lang: string): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  if (Capacitor.isNativePlatform()) {
    const tts = await loadTts();
    if (!tts) return;
    try {
      await tts.stop();
      await tts.speak({
        text: clean,
        lang,
        rate: 1,
        pitch: 1,
        volume: 1,
        category: 'ambient',
      });
    } catch {
      // Un altavoz ocupado o sin voces no debe romper la conversacion.
    }
    return;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (typeof SpeechSynthesisUtterance === 'undefined') return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = lang;
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

export async function stopSpeaking(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const tts = await loadTts();
    try {
      await tts?.stop();
    } catch {
      // Sin plugin o sin voz activa: no hay nada que detener.
    }
    return;
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
