import { WebAuth } from '@stellar/stellar-sdk';
import i18n from '../../i18n';

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

const SIGNING_KEY = import.meta.env.VITE_SEP10_SIGNING_KEY as string | undefined;
const HOME_DOMAIN = new URL(
  (import.meta.env.VITE_WALLET_OFFICIAL_ORIGIN as string | undefined) || 'https://app.micopay.com.mx',
).hostname;
const WEB_AUTH_DOMAIN = (import.meta.env.VITE_SEP10_WEB_AUTH_DOMAIN as string | undefined) || 'api.micopay.app';

/** Antes de pedir la firma: el reto es de MicoPay, de esta cuenta, y no es ejecutable. */
export function assertWebAuthChallenge(
  xdr: string,
  account: string,
  networkPassphrase: string,
  signingKey = SIGNING_KEY,
): void {
  if (!signingKey) throw new Error(tr('signerErrors.webAuthNotConfigured'));
  const { clientAccountID } = WebAuth.readChallengeTx(xdr, signingKey, networkPassphrase, HOME_DOMAIN, WEB_AUTH_DOMAIN);
  if (clientAccountID !== account) throw new Error(tr('signerErrors.challengeOtherAccount'));
}
