# Plan: billeteras externas (Varial y Lobstr) como firmadores

Fecha: 2026-10-29 (México). Estado: **preparación**. No se construye todavía, pero desde hoy rige la regla de la sección "Desde ya".
Relacionado: [plan de correcciones del escrow 2026-10-29](./PLAN_IMPLEMENTACION_CORRECCIONES_ESCROW_2026-10-29.md). Este plan va después de WP2-WP8 y de la salida a mainnet.

## Objetivo

Que un usuario o un agente de MicoPay pueda firmar con su propia billetera de Stellar (Varial, antes Freighter, o Lobstr) en vez de con la llave de MicoPay. Y que MicoPay pueda aparecer en el directorio de apps de esas billeteras.

Hay tres casos de uso:
- **Super nodo:** un agente grande que opera desde MicoPay web en su PC y firma con la extensión de Varial o con Lobstr.
- **Mini app:** MicoPay abierto dentro del navegador de apps de una billetera móvil (Varial Discover).
- **App propia:** la llave de MicoPay en el Keystore con huella, como hoy.

## Decisión: MicoPay no custodia

Decidido por Eric el 2026-10-29.
- Los fondos van de la billetera del usuario al contrato y del contrato a la contraparte. Nunca pasan por una cuenta de MicoPay.
- **Descartados SEP-24 y SEP-6:** en ambos el usuario envía los fondos a la cuenta del operador, y eso es custodia.
- **SEP-10 sí cabe:** solo autentica (se firma una transacción que nunca se envía).
- Argumento para socios: "no custodiamos, tu usuario firma con tu billetera".

## Lo que investigamos (2026-10-29)

### Varial (antes Freighter, de la Stellar Development Foundation)

- **Cambio de nombre:** el 2026-10-29 Freighter pasó a llamarse Varial ("Same wallet, new name"). Las integraciones existentes siguen funcionando.
- **Discover:** directorio de apps de terceros dentro de la billetera.
  - No hay formulario ni criterios publicados. Para entrar se escribe a **varial@stellar.org**, y la inclusión queda "subject to review and eligibility".
- **Navegador interno (Discovery) en el celular:** un WebView (`react-native-webview`) que abre la página de la app.
  - Inyecta `window.stellar` con `window.stellar.platform = "mobile"`. Esto **no está documentado**; Stellar abrió un issue para documentarlo (stellar-docs #2875) y lo puso en pausa el 2026-10-08.
  - Hay trabajo en curso para un puente inyectado en el WebView que sustituya a WalletConnect, y para un SEP-10 silencioso (freighter-mobile #1000-#1002).
  - **Cámara:** el 2026-10-29 se integró freighter-mobile #1031. Antes, en iPhone, la cámara de un lector de QR web se abría en el reproductor de pantalla completa y no escaneaba. En Android no está confirmado.
- **Celular por WalletConnect v2:**
  - redes `stellar:pubnet` y `stellar:testnet`;
  - métodos `stellar_signXDR`, `stellar_signAndSubmitXDR`, `stellar_signMessage` (SEP-53) y `stellar_signAuthEntry` (SEP-43);
  - rechaza peticiones cuyo `chainId` no coincida con su red activa;
  - Blockaid revisa el sitio al conectar y cada transacción de `signXDR`.
- **PC:** extensión del navegador con `@stellar/varial-sdk`; `@stellar/freighter-api` sigue funcionando.

### Lobstr

- **No encontramos navegador de apps dentro de Lobstr.** "Mini app dentro de Lobstr" hoy no existe. Lo que existe es MicoPay usando Lobstr como firmador.
- **WalletConnect v2:** la app de MicoPay muestra un QR o un enlace y el usuario aprueba en Lobstr.
- **Extensión firmadora (PC):** `@lobstrco/signer-extension-api`. La página pide la firma, la transacción llega al celular, el usuario la revisa ahí y confirma. Soporta Soroban.
- **Para aparecer destacado** en su sección de WalletConnect: **partners@lobstr.co**. La fuente tiene unos 16 meses; hay que confirmarlo.

### Estándares

- **SEP-60** (borrador 0.1.0, 2026-09-29): las billeteras se anuncian en la página con los eventos `sep0060:announceProvider` y `sep0060:requestProvider`, y el proveedor implementa SEP-43.
  - Si dentro de un navegador interno solo hay una billetera, la app puede conectarse directo, sin selector.
  - Si se aprueba, reemplaza la detección no documentada de `window.stellar`.
- **Stellar Wallets Kit** (`@creit.tech/stellar-wallets-kit`): una sola interfaz para Varial, Lobstr, WalletConnect, xBull y otras.

### WalletConnect amplía su soporte a Stellar (2026-10-29)

- **Qué se anunció:**
  - Stellar entra a la red de WalletConnect (más de 700 billeteras, según WalletConnect).
  - Socios de lanzamiento: Fireblocks y Utila (custodios para empresas), Arculus (billetera física) y LOBSTR.
  - WalletConnect Pay funciona en Stellar: pagos de la billetera del cliente directo al comercio, sin custodia. LOBSTR es la primera billetera; el primer comercio es PTIX (Bermudas), en el segundo trimestre de 2027.
- **WalletConnect y Reown:** WalletConnect es el protocolo y la red de servidores que solo pasan mensajes cifrados (no ven llaves ni fondos). Reown es el nombre que la empresa adoptó en 2024 para sus librerías:
  - AppKit, para apps;
  - WalletKit, para billeteras.

  Requiere registrar el proyecto y obtener un ID de proyecto (hay plan gratuito; los límites no se revisaron).
- **Por qué importa:**
  - una sola integración llega a todas las billeteras de Stellar que lo implementen;
  - un agente grande puede poner fondos en el escrow desde su custodio (Fireblocks, Utila), con sus propios controles;
  - el super nodo puede operar en la PC y firmar en el celular.
- **Multifirma:** cada sesión de WalletConnect firma con una sola llave. Las firmas las junta la app (una sesión por firmante) o la billetera:
  - LOBSTR Vault: la transacción se manda a su API para las firmas adicionales;
  - Fireblocks y Utila: las aprobaciones son internas; **no se confirmó** cómo las exponen por WalletConnect.

  El lock de MicoPay vence 180 s después de prepararse (`setTimeout(180)`). Para un agente con multifirma hacen falta más validez y un estado de "firma pendiente". WP2 ya evita que un envío lento se pierda.
- **Soroban:**
  - `stellar_signXDR` firma la transacción completa. Funciona hoy y es lo que usa MicoPay: el vendedor firma el lock como cuenta de origen.
  - `stellar_signAuthEntry` firma solo una autorización. Sirve cuando otra cuenta paga la comisión. **Inestable:** la especificación sigue en revisión, y reown-com/appkit #5829 reporta que el formato no coincide con SEP-43. MicoPay no debe depender de él todavía, así que no puede pagar la comisión por el usuario vía WalletConnect.
- **Billeteras de Stellar con WalletConnect confirmadas:** LOBSTR, Varial (celular), Fireblocks, Utila y Arculus. No confirmado: xBull, Albedo y otras (Stellar Wallets Kit las conecta directo).

### Arquitectura decidida (2026-10-30)

- **MicoPay web** siempre es la app que pide la firma ("¿con qué billetera firmas?"), con Stellar Wallets Kit (WalletConnect más las conexiones directas). La APK de MicoPay aparece como una billetera más en esa lista.
- **La APK:**
  - sus propios flujos los sigue firmando directo con su llave (Keystore con huella), sin WalletConnect;
  - para el super nodo (web en la PC, firma en el celular), primero usa las solicitudes de firma delegada que ya existen (`/sign-requests`, aviso push y pantalla `SignatureApproval`);
  - más adelante, WalletKit, para que la APK firme también en otras apps de Stellar (Blend, Soroswap).
- **Dentro de la APK** también se puede firmar con una billetera externa del mismo teléfono: se abre LOBSTR, se firma y se vuelve a MicoPay.

## Cómo encaja MicoPay hoy

Todas las firmas del frontend pasan por tres funciones de `micopay/frontend/src/lib/keystore.ts`:
- `getPublicKey()`;
- `signChallenge(challenge)`: el inicio de sesión (`services/api.ts`);
- `signTransactionXdr(xdr, passphrase, motivo)`: lock, release, decline, pagos, ramp y solicitudes de firma.

| Pieza | ¿Encaja con una billetera externa? |
|---|---|
| Lock, release y decline: el backend arma el XDR, la app firma y lo devuelve | Sí: `stellar_signXDR` |
| QR de cobro: sale del backend (`trade_id` + `claim_token`), la app no guarda el secreto | Sí: la página solo lo muestra |
| Escaneo del QR por el agente | Sí en web con la cámara del navegador; en Varial iPhone desde #1031; Android por probar |
| Inicio de sesión con `signChallenge` (texto suelto) | **No en todas**: Varial firma mensajes; Lobstr por WalletConnect no está confirmado |
| Reembolso al vencer un bloqueo | MicoPay no puede firmar por una llave externa: la app debe avisar y ofrecer el botón |
| Red | Producción corre en testnet; para el directorio hace falta mainnet |

## Desde ya (regla vigente)

1. **Toda firma pasa por `lib/keystore.ts`.** Ningún servicio ni pantalla nueva firma por su cuenta.
2. **El backend entrega una transacción armada (XDR) y recibe la firmada.** Ningún flujo nuevo arma ni envía la transacción del usuario en el cliente sin pasar por esa función.
3. **Ningún paso del flujo depende de la app nativa.** El QR y su escaneo deben funcionar en una página web. Si algo nuevo necesita Android, debe tener su versión web.

## Cuando toque construirlo

Requisitos previos: WP2-WP8 del plan de correcciones del escrow y salida a mainnet.

1. **Interfaz de firmador** en `keystore.ts` con dos implementaciones: la llave de MicoPay (Keystore) y Stellar Wallets Kit.
2. **Inicio de sesión con SEP-10:** el desafío es una transacción que no se envía, para que funcione con cualquier billetera. Ajustar `/auth` en el backend.
3. **MicoPay web:** mostrar con qué billetera se está conectado y en qué red; rechazar si la red no coincide.
4. **Detección del navegador interno:** SEP-60 si ya está aprobado; si no, `window.stellar` como respaldo y WalletConnect como último recurso.
5. **Reembolso con llave externa:** aviso al vencer el bloqueo y botón de reembolso que firma la billetera. Revisar en el contrato quién puede llamar `refund`.
6. **Pruebas:**
   - cashout y depósito completos con Varial (extensión y Discovery en iPhone y Android) y con Lobstr (WalletConnect y extensión);
   - escaneo de QR dentro de Discovery;
   - red equivocada rechazada.
7. **Contacto:** con mainnet y la auditoría del contrato cerrada, escribir a varial@stellar.org (Discover) y a partners@lobstr.co (sección de WalletConnect).

## Fuentes

- Blog de Stellar, "Freighter is now Varial": https://stellar.org/blog/foundation-news/freighter-is-now-varial
- Documentación de Varial: https://docs.varialwallet.com/ y https://docs.varialwallet.com/mobile-walletconnect/mobile.md
- freighter-mobile #1031 (cámara en Discovery): https://github.com/stellar/freighter-mobile/pull/1031 (issue #1026)
- stellar-docs #2875 (navegador interno sin documentar): https://github.com/stellar/stellar-docs/issues/2875
- SEP-60: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0060.md
- Extensión firmadora de Lobstr: https://lobstr.co/signer-extension/
- Lobstr en Google Play: https://play.google.com/store/apps/details?id=com.lobstr.client
- Stellar Wallets Kit: https://stellarwalletskit.dev/
- Stellar, anuncio de WalletConnect: https://stellar.org/press/walletconnect-expands-stellar-network-support-and-partnership-with-penrose-partners-to-bring-walletconnect-pay-to-bermuda-in-support-of-the-government-s-onchain-economy-vision
- WalletConnect, Stellar: https://docs.walletconnect.network/wallet-sdk/chain-support/stellar.md
- reown-com/appkit #5829: https://github.com/reown-com/appkit/issues/5829
- LOBSTR Vault: https://github.com/Lobstrco/Vault-Android
