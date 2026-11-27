# Misión especial: MicoPay en mainnet (2026-11-27)

El escrow de MicoPay corre en la red principal de Stellar. Las 5 funciones se
invocaron desde la app (web y APK), con fondos reales, en el flujo de **retiro**:
el cliente vende XLM y el agente le entrega efectivo.

## Contrato

| | |
|---|---|
| Escrow XLM | [`CCM4E3DA6QKAQOJYHH5UQ3AFXIUVYDDTBWTPLKAHYJK6ASATVVZZP3KO`](https://stellar.expert/explorer/public/contract/CCM4E3DA6QKAQOJYHH5UQ3AFXIUVYDDTBWTPLKAHYJK6ASATVVZZP3KO) |
| Subida del WASM | [`607113fe…`](https://stellar.expert/explorer/public/tx/607113fe0b3ee4643c414160e059b9ac305f0fa7352e4e490a9ff2e07cd5e96f) |
| Despliegue | [`2dee11c3…`](https://stellar.expert/explorer/public/tx/2dee11c3bb4af76c4406ff933d5a8677256652b31f42b18a0d16f9cf8cce8563) |
| Token | XLM nativo (SAC `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA`) |
| Código | [`micopay/contracts/escrow/src/lib.rs`](../../micopay/contracts/escrow/src/lib.rs) |

Backend: `api.micopay.app` con `STELLAR_NETWORK=PUBLIC`. Web: `app.micopay.com.mx`.

## Cómo firma la app

En las 5 funciones el patrón es el mismo:

1. La app pide al backend la transacción sin firmar (`/prepare`).
2. La app revisa que el XDR llame a ese contrato, esa función y esa operación
   ([`escrowTxValidation.ts`](../../micopay/frontend/src/utils/escrowTxValidation.ts)).
3. La billetera del usuario firma: la llave nativa en la APK, o la APK por
   WalletConnect cuando se usa la web.
4. El backend revisa la firma contra la operación y la envía a la red.

Nadie firma por el usuario: cada función la firma quien el contrato exige.

## Las 5 funciones

### 1. `lock` — el cliente bloquea su XLM

- **Qué hace:** pasa el XLM del cliente al contrato, atado al hash de un secreto
  y a un plazo de 2 horas. Nadie puede moverlo fuera de `release`, `decline` o
  `refund`.
- **Quién firma:** el cliente (vendedor del escrow).
- **Pantalla:** detalle de la operación (botón de bloquear) o la pantalla del QR
  del cliente, que bloquea antes de mostrar el código.
- **Código:**
  - Contrato: [`lib.rs:47`](../../micopay/contracts/escrow/src/lib.rs#L47)
  - App: [`TradeDetail.tsx:1292`](../../micopay/frontend/src/pages/TradeDetail.tsx#L1292) (`handleLock`) y [`QRReveal.tsx:82`](../../micopay/frontend/src/pages/QRReveal.tsx#L82)
  - Firma: [`api.ts:516`](../../micopay/frontend/src/services/api.ts#L516) (`lockTrade`)
  - Backend: [`stellar.service.ts:154`](../../micopay/backend/src/services/stellar.service.ts#L154)
- **Transacción:** [`06b47986…`](https://stellar.expert/explorer/public/tx/06b4798640bfb4c2511ecef483daa99728534330046c3bcc5d6b1dc04d2d2bf5)

### 2. `report_paid` — constancia de entrega del agente

- **Qué hace:** deja en la red que el agente ya entregó el efectivo y bloquea
  `refund` por 24 horas (o hasta el plazo del lock, lo que sea mayor). Si la
  liberación falla después de la entrega, el cliente no puede llevarse el
  efectivo y además recuperar su XLM. Se registra una sola vez.
- **Quién firma:** el agente (comprador del escrow).
- **Pantalla:** bandeja del agente. Tras escanear el QR del cliente, al apretar
  liberar la app firma primero la constancia y luego la liberación.
- **Código:**
  - Contrato: [`lib.rs:316`](../../micopay/contracts/escrow/src/lib.rs#L316)
  - App: [`MerchantInbox.tsx:89`](../../micopay/frontend/src/pages/MerchantInbox.tsx#L89), dentro de `liberar()` ([`:80`](../../micopay/frontend/src/pages/MerchantInbox.tsx#L80))
  - Firma: [`api.ts:1131`](../../micopay/frontend/src/services/api.ts#L1131) (`reportCashDelivery`)
  - Backend: [`stellar.service.ts:586`](../../micopay/backend/src/services/stellar.service.ts#L586)
- **Transacción:** [`c103e2fe…`](https://stellar.expert/explorer/public/tx/c103e2fe658caecf8fca7aeaa8cecab0f8fe47f8438cff0e2ba901826d68ae90)

### 3. `release` — el agente cobra

- **Qué hace:** con el secreto del QR del cliente, paga el XLM al agente y la
  comisión a la wallet de plataforma.
- **Quién firma:** el agente.
- **Pantalla:** bandeja del agente, el mismo botón de liberar. En la web, el QR
  se lee con la cámara o se pega en el campo del escáner
  ([`WebScanDialog.tsx`](../../micopay/frontend/src/components/WebScanDialog.tsx)).
- **Código:**
  - Contrato: [`lib.rs:132`](../../micopay/contracts/escrow/src/lib.rs#L132)
  - App: [`MerchantInbox.tsx:93`](../../micopay/frontend/src/pages/MerchantInbox.tsx#L93)
  - Firma: [`api.ts:590`](../../micopay/frontend/src/services/api.ts#L590) (`completeTrade`)
  - Backend: [`stellar.service.ts:318`](../../micopay/backend/src/services/stellar.service.ts#L318)
- **Transacción:** [`4e7e1de3…`](https://stellar.expert/explorer/public/tx/4e7e1de39fb644db5cef64a61c17905d048d58f97ae7ca43f42fe9d1f7369fb3)

### 4. `decline` — el agente rechaza y devuelve

- **Qué hace:** el agente no puede atender y devuelve el XLM al cliente en ese
  momento, sin esperar el plazo. Solo lo firma quien recibiría los fondos.
- **Quién firma:** el agente.
- **Pantalla:** detalle de la operación, botón **"Rechazar y devolver al
  cliente"** con un segundo toque de confirmación.
- **Código:**
  - Contrato: [`lib.rs:265`](../../micopay/contracts/escrow/src/lib.rs#L265)
  - App: [`TradeDetail.tsx:440`](../../micopay/frontend/src/pages/TradeDetail.tsx#L440) (`DeclineNow`) y [`:1365`](../../micopay/frontend/src/pages/TradeDetail.tsx#L1365) (`handleDeclineNow`)
  - Firma: [`api.ts:251`](../../micopay/frontend/src/services/api.ts#L251) (`declineTradeRequest`)
  - Backend: [`stellar.service.ts:407`](../../micopay/backend/src/services/stellar.service.ts#L407)
- **Transacción:** [`91f9aaf9…`](https://stellar.expert/explorer/public/tx/91f9aaf9d6b93c101e4bd80a31756546f448a4fa74bc541d5aa09aac04f26fed)

### 5. `refund` — el cliente recupera su XLM al vencer el plazo

- **Qué hace:** pasado el plazo del lock (2 horas), devuelve el XLM al cliente.
  Falla mientras haya una constancia de entrega vigente (`report_paid`).
- **Quién firma:** el cliente.
- **Pantalla:** detalle de la operación vencida, botón **"Recuperar fondos"**
  con confirmación.
- **Código:**
  - Contrato: [`lib.rs:200`](../../micopay/contracts/escrow/src/lib.rs#L200)
  - App: [`TradeDetail.tsx:1385`](../../micopay/frontend/src/pages/TradeDetail.tsx#L1385) (`handleRefundClick`) y [`:1355`](../../micopay/frontend/src/pages/TradeDetail.tsx#L1355)
  - Firma: [`api.ts:621`](../../micopay/frontend/src/services/api.ts#L621) (`refundTradeRequest`)
  - Backend: [`stellar.service.ts:549`](../../micopay/backend/src/services/stellar.service.ts#L549)
- **Transacción:** [`cd4c3f99…`](https://stellar.expert/explorer/public/tx/cd4c3f99f0b67057bae1acdd89e7fae2137499870621eb877caad998b977575f)
  (lock de esa operación: [`373c03e2…`](https://stellar.expert/explorer/public/tx/373c03e21db652c493d1c9db6f867e3e4bb986649753102ebe3e868c7a181aa0))

> Nota: el backend tiene un barrido que reembolsa solo, con la llave de
> plataforma, las operaciones vencidas. Para que este `refund` lo firmara el
> cliente desde la app, por unos minutos bajamos el plazo del lock a 10 minutos
> y apagamos el barrido; luego volvimos a 2 horas con el barrido encendido. Un
> primer reembolso de prueba ([`ab00a5c9…`](https://stellar.expert/explorer/public/tx/ab00a5c9bbd215d90b76f4b2491f2657745416a1ce9f6f1035336200fdd11b2e))
> lo hizo el barrido y no cuenta como invocación desde la app.

## Lo que agregamos para la misión

- `report_paid` en el contrato de producción y su uso en la app (#559).
- `refund` firmado por el propio cliente desde la app (#559); antes solo lo
  enviaba el backend.
- Botón para que el agente rechace y devuelva con un toque (#561).
