import { useState } from 'react';
import { SUPPORT_EMAIL } from '../constants/contact';

type Props = {
  tradeId?: string;
  state: string;
};

export default function SupportLink({ tradeId, state }: Props) {
  const subject = encodeURIComponent(
    `Soporte — ${tradeId ? `Operación ${tradeId.slice(0, 8)}…` : 'operación sin ID'} — ${state}`
  );
  const body = encodeURIComponent(
    `Hola,\n\nNecesito ayuda.\n\nEstado: ${state}\nOperación ID: ${tradeId || 'N/D'}\n\nGracias.`
  );
  const href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  // #11: en PC `mailto:` abre una pestaña vacía si no hay cliente de correo.
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3">
      <a
        href={href}
        className="inline-flex min-h-12 items-center gap-1.5 text-sm text-verde font-bold underline hover:underline font-medium transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: '"FILL" 1' }}>
          support_agent
        </span>
        ¿Necesitas ayuda?
      </a>
      <button type="button" onClick={copy} className="min-h-12 text-sm text-gris underline">
        {copied ? 'Copiado' : `Copiar ${SUPPORT_EMAIL}`}
      </button>
    </span>
  );
}