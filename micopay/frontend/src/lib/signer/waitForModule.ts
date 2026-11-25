// El Kit decide una sola vez, al abrir su lista, que billeteras estan
// disponibles, y a cada una le da 1 segundo. WalletConnect arranca su cliente
// en segundo plano y tarda mas: sin esta espera sale como "Install" y al
// tocarla abre walletconnect.com en vez del QR.
const WALLETCONNECT_READY_TIMEOUT_MS = 10_000;
const WALLETCONNECT_READY_POLL_MS = 200;

/** Espera a que el cliente de WalletConnect termine de arrancar; si no llega, la lista sale igual. */
export async function waitForModule(
  module: { isAvailable(): Promise<boolean> } | null,
  timeoutMs = WALLETCONNECT_READY_TIMEOUT_MS,
  pollMs = WALLETCONNECT_READY_POLL_MS,
): Promise<boolean> {
  if (!module) return false;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await module.isAvailable().catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
