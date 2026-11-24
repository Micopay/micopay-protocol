import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const app = read('src/App.tsx');
const profile = read('src/pages/Profile.tsx');
const bankWithdraw = read('src/pages/BankWithdrawScreen.tsx');
const apiError = read('src/utils/apiError.ts');

describe('entradas visibles de KYC', () => {
  it('Perfil ofrece abrir Didit y distingue una verificacion aprobada', () => {
    expect(app).toContain("onNavigateKyc={() => navigate('/kyc/didit?return=profile')}");
    expect(profile).toContain('Verificar mi identidad');
    expect(profile).toContain("profile.kyc_provider === 'didit'");
  });

  it('Retirar a banco abre Didit y regresa al retiro', () => {
    expect(app).toContain("onVerifyIdentity={() => navigate('/kyc/didit?return=bankWithdraw')}");
    expect(app).toContain("bankWithdraw: '/retirar-banco'");
    expect(bankWithdraw).toContain('onClick={onVerifyIdentity}');
  });

  it('un bloqueo KYC de P2P se convierte en una accion de verificacion', () => {
    expect(apiError).toContain("error === 'KYC_TIER_INSUFFICIENT'");
    expect(apiError).toContain("action: 'verify_identity'");
    expect(app).toContain("return=depositMap");
    expect(app).toContain("return=cashoutMap");
  });
});
