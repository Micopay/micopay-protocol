/** Prueba local 8.1: en PC "¿Necesitas ayuda?" no abre una pestaña vacía. */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/signer/mode', () => ({ IS_EXTERNAL_SIGNER: true }));
import SupportLink from '../components/SupportLink';

describe('SupportLink en PC', () => {
  it('muestra y copia el correo en lugar de abrir mailto', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { container } = render(<SupportLink tradeId="7d639726-aaaa" state="LOCKED" />);
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Necesitas ayuda/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('soporte@micopay.com.mx'));
    expect(screen.getByRole('status')).toHaveTextContent('soporte@micopay.com.mx (copiado)');
    expect(screen.getByRole('status')).toHaveTextContent('7d639726');
  });
});
