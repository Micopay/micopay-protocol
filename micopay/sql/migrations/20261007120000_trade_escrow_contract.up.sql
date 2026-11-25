-- Escrow multiactivo: cada activo tiene su instancia del contrato (cada una
-- guarda un solo token desde `initialize`), configuradas en ESCROW_CONTRACTS.
--
-- El contrato se congela en la operacion al crearla, igual que la tasa: lock,
-- release y refund tienen que ir al contrato donde se bloquearon los fondos,
-- aunque despues se redespliegue o cambie la configuracion. Las operaciones
-- anteriores quedan en NULL y el backend usa el contrato de su activo.
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS escrow_contract_id VARCHAR(56);
