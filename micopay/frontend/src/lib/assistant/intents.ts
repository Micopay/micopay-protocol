/**
 * Intenciones del asistente de MicoPay.
 *
 * Es un clasificador determinista, no un modelo de lenguaje. La app mueve
 * dinero: una respuesta creativa sobre "¿ya liberé el escrow?" no sirve. Cada
 * intención tiene una accion concreta y acotada, y lo que no se reconoce se
 * responde con opciones en vez de inventar.
 *
 * Espanol e ingles comparten reglas porque el producto es bilingue.
 */

export type AssistantIntentId =
  | 'security'
  | 'support'
  | 'cancel'
  | 'active_trades'
  | 'history'
  | 'kyc'
  | 'merchants'
  | 'rate'
  | 'balance'
  | 'deposit'
  | 'cashout'
  | 'send'
  | 'receive'
  | 'greeting'
  | 'help'
  | 'unknown';

export type AssistantAsset = 'XLM' | 'USDC';

export interface AssistantIntent {
  id: AssistantIntentId;
  asset?: AssistantAsset;
  amountMxn?: number;
  raw: string;
}

const stripAccents = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalize = (value: string) =>
  stripAccents(value.toLowerCase()).replace(/\s+/g, ' ').trim();

interface Rule {
  id: AssistantIntentId;
  pattern: RegExp;
}

/**
 * El orden importa. Las frases mas especificas van antes que las generales:
 * "que paso con mi deposito" es una consulta de estado, no una orden de
 * depositar; "puedes firmar por mi" es una pregunta de seguridad, no un envio.
 */
const RULES: Rule[] = [
  {
    id: 'security',
    pattern:
      /\b(firmar|firma|llave|semilla|seed|private key|mover mi dinero|mueve mi dinero|puedes pagar|puedes enviar|autoriza|autorizas|sign for me|move my money|my key|tienes mi llave)\b/,
  },
  {
    id: 'support',
    pattern:
      /\b(soporte|support|ayuda humana|human|problema|problem|reclamo|reclamar|disputa|dispute|queja|complaint|no me confirmaron|estafa|fraude|fraud|robo)\b/,
  },
  {
    id: 'cancel',
    pattern: /^(cancelar|cancela|detente|stop|silencio|callate|cancel|shut up)\b/,
  },
  {
    id: 'active_trades',
    pattern:
      /\b(operacion(es)? (activa|activas|en curso|abierta|abiertas)|estado de (mi|la) operacion|que paso con|mi deposito|mi retiro|mis operaciones|my operations|trade activo|active trade|status of)\b/,
  },
  {
    id: 'history',
    pattern:
      /\b(historial|history|ultimas (operaciones|transacciones)|movimientos|pagos recientes|recent)\b/,
  },
  {
    id: 'kyc',
    pattern: /\b(kyc|verific\w*|identidad|documentos|ine|curp|didit|verify)\b/,
  },
  {
    id: 'merchants',
    pattern:
      /\b(agente|agentes|agents?|comercio|comercios|proveedor|proveedores|donde (puedo|puede)|cerca de mi|nearby|merchant|provider|cambiar efectivo|quien me da efectivo|buscar agentes)\b/,
  },
  {
    id: 'rate',
    pattern:
      /\b(tipo de cambio|tasa|cotizacion|a como (esta|va)|precio|cuanto (vale|esta)|rate|price|exchange)\b/,
  },
  {
    id: 'balance',
    pattern:
      /\b(saldo|balance|cuanto (dinero )?tengo|cuanto hay|mi dinero|wallet|billetera)\b/,
  },
  {
    id: 'deposit',
    pattern:
      /\b(depositar|deposito|deposit|meter dinero|ingresar|ingresa|comprar (cripto|usdc|xlm)|cash in|poner dinero|recargar|quiero depositar)\b/,
  },
  {
    id: 'cashout',
    pattern:
      /\b(retirar|retiro|withdraw|sacar efectivo|sacar dinero|cash out|vender (cripto|usdc|xlm)|cambiar a efectivo|quiero retirar)\b/,
  },
  {
    id: 'send',
    pattern:
      /\b(enviar (pago|dinero)|mandar (pago|dinero)|pagar a|quiero pagar|send (payment|money)|transferir)\b/,
  },
  {
    id: 'receive',
    pattern:
      /\b(recibir (pago|dinero)|cobrar|mi direccion|mi cuenta|receive (payment|money)|request payment)\b/,
  },
  {
    id: 'greeting',
    pattern: /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hi|hello|que tal)\b/,
  },
  {
    id: 'help',
    pattern:
      /\b(ayuda|help|que puedes hacer|opciones|comandos|menu|que sabes|how can you help)\b/,
  },
];

function detectAsset(text: string): AssistantAsset | undefined {
  if (/\busdc\b|\busd\b|\bdolar(es)?\b/.test(text)) return 'USDC';
  if (/\bxlm\b|\blumens?\b|\bstellar\b/.test(text)) return 'XLM';
  return undefined;
}

function detectAmount(text: string): number | undefined {
  const currency = text.match(
    /(?:\$|mxn|pesos?|varos)\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\s*(?:pesos?|mxn|varos)/i,
  );
  const raw = currency?.[1] ?? currency?.[2];
  if (raw) {
    const parsed = Number(raw.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 50000) {
      return Math.round(parsed);
    }
  }

  const standalone = text.match(/\b([1-9][0-9]{2,4})\b/);
  if (standalone) {
    const parsed = Number(standalone[1]);
    if (parsed >= 100 && parsed <= 50000) return parsed;
  }

  return undefined;
}

export function detectIntent(raw: string): AssistantIntent {
  const text = normalize(raw);
  if (!text) return { id: 'unknown', raw };

  const matched = RULES.find((rule) => rule.pattern.test(text));
  if (!matched) return { id: 'unknown', raw };

  const intent: AssistantIntent = { id: matched.id, raw };

  if (matched.id === 'rate' || matched.id === 'balance') {
    const asset = detectAsset(text);
    if (asset) intent.asset = asset;
  }

  if (
    matched.id === 'deposit' ||
    matched.id === 'cashout' ||
    matched.id === 'send' ||
    matched.id === 'merchants'
  ) {
    const amount = detectAmount(text);
    if (amount) intent.amountMxn = amount;
  }

  return intent;
}
