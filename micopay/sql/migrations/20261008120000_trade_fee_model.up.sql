-- H5 · comisiones con "efectivo en mano" (docs/PLAN_COMISIONES_EFECTIVO_2026-09-24.md).
--
-- El contrato solo conoce `amount` (lo que recibe el comprador al liberar) y
-- `platform_fee`. Hasta aqui `amount` era la conversion del monto escrito en
-- los dos flujos, asi que la comision del agente solo existia en la base: en
-- retiro el agente cobraba de mas y en deposito perdia la comision de
-- plataforma.
--
-- Desde ahora el monto escrito es el efectivo que cambia de mano y `amount`
-- lleva la comision del agente (`escrow_amount_mxn`). Las operaciones
-- anteriores NO se reescriben: quedan como `amount_is_escrow` porque asi se
-- liquidaron (misma politica que `legacy_1to1_bug`).
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS fee_model         VARCHAR(24) NOT NULL DEFAULT 'amount_is_escrow',
  ADD COLUMN IF NOT EXISTS escrow_amount_mxn INTEGER;

COMMENT ON COLUMN trades.fee_model IS
  'amount_is_escrow: amount_stroops = monto escrito (antes de H5). cash_in_hand: monto escrito = efectivo; amount_stroops = escrow_amount_mxn.';
COMMENT ON COLUMN trades.escrow_amount_mxn IS
  'Lo que recibe el comprador del escrow al liberar, en MXN (solo cash_in_hand).';
