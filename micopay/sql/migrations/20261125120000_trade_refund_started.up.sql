-- Migration 20261125120000 — #514: la carrera entre el reclamo y el reembolso.
--
-- El barrido revisaba si habia reclamo "Pagué y no me confirmaron" y después
-- mandaba refund() a la cadena. Si el cliente reclamaba justo en medio, quedaban
-- las dos cosas: reclamo abierto y fondos ya devueltos al agente.
--
-- `refund_started_at` es la decisión del barrido de reembolsar. Se escribe con
-- la fila del trade tomada (`SELECT … FOR UPDATE`), la misma fila que toma
-- `openCashClaim` antes de insertar el reclamo: una de las dos gana y la otra
-- ve lo que hizo la primera. Si el reembolso falla, la marca se borra.
-- No mueve fondos; el contrato no cambia.
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS refund_started_at TIMESTAMPTZ;
