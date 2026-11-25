# Ship It · Reto exprés "Pago relámpago" (2026-11-24)

Pago en testnet enviado desde la app de MicoPay (pantalla Enviar), con el código del reto en el memo.

- Transacción: https://stellar.expert/explorer/testnet/tx/d80bdf0e0ce33b21d57e344d57c1604e6c2e4ef00e4ece62c38ab537b8ea8a4f
- Memo: `SHIP-S97KF8`
- Pago: 16 XLM de `GCBTPHZLU7DGQQOJ2GDT3L2IZEZOA67QY5BHBBSX6M6PSDBD2MQH53TX` a `GD6L7AVHFGAPEJNMARQHGXAL4UNJ7EMSZHUWA5A2E25HYWBNUFUZPYU6`
- Hora: 2026-11-24 19:00:27 (CDMX)

Código que arma y envía el pago con memo: `micopay/frontend/src/services/payment.ts` (`sendPayment`, `Memo.text`).
