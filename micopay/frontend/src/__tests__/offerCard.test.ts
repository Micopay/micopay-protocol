/**
 * Una sola tarjeta de agente para los dos flujos.
 *
 * Habia DOS. La de cash-out venia del sistema ANTERIOR al rediseño y sobrevivio
 * ahi: `border border-primary-container/10` (1 px casi invisible), sin sombra,
 * insignias en pildora `rounded-full` y un `ring-2` difuminado. La de deposito
 * ya seguia "Mercado / Rotulo": `border-2 border-tinta`, `shadow-solida`,
 * insignias rectangulares de canto vivo.
 *
 * Dos tarjetas para lo mismo garantizan que una se quede atras — y la que se
 * quedo atras fue la del flujo principal del producto.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(dir, p), 'utf8');

describe('la tarjeta de agente es compartida', () => {
  it('las dos pantallas usan el mismo componente', () => {
    for (const page of ['ExploreMap', 'DepositMap']) {
      expect(read(`../pages/${page}.tsx`), `${page} debe usar la tarjeta compartida`).toContain(
        'MerchantOfferCard',
      );
    }
  });

  it('ninguna pantalla define su propia tarjeta', () => {
    // Volver a declararla localmente es como se llegó a tener dos.
    for (const page of ['ExploreMap', 'DepositMap']) {
      expect(read(`../pages/${page}.tsx`)).not.toMatch(/function MerchantOfferCard/);
    }
  });

  it('el cash-out ya no usa el estilo anterior al rediseño', () => {
    const explore = read('../pages/ExploreMap.tsx');
    // Borde de 1 px casi invisible y píldoras redondas: el sistema viejo.
    expect(explore).not.toContain('border-primary-container/10');
  });

  it('la tarjeta conserva el sistema brutalista', () => {
    const card = read('../components/MerchantOfferCard.tsx');
    expect(card).toContain('border-2 border-tinta');
    expect(card).toContain('shadow-solida');
  });
});

describe('lo único que cambia entre flujos es la dirección', () => {
  const card = read('../components/MerchantOfferCard.tsx');

  it('las etiquetas de entrega y recepción dependen del flujo', () => {
    expect(card).toContain('EXCHANGE_LABELS');
    // En depósito entregas efectivo; en cash-out lo recibes.
    expect(card).toMatch(/deposit: \{ gives: 'Entregas en efectivo'/);
    expect(card).toMatch(/cashout: \{ gives: 'Entregas de tu saldo'/);
  });

  it('no nombra un activo que el escrow no usa', () => {
    // Decía "MXNe" fijo, cuando el escrow bloquea XLM. La cifra es el valor
    // pactado en pesos; el activo lo decide el escrow.
    //
    // Se miran solo las cifras RENDERIZADAS: la primera versión de este caso
    // buscaba "MXNe" en todo el fichero y fallaba por su propio comentario
    // explicativo, que es exactamente el tipo de test que grita sin motivo.
    const rendered = card.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(rendered).not.toMatch(/toFixed\(2\)\} MXNe/);
    expect(rendered).toMatch(/toFixed\(2\)\} MXN</);
  });
});
