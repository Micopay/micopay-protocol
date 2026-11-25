-- Rollback de 20260904210000 — RED-3.
-- `address_text` nunca se borro, asi que revertir no pierde el dato.
ALTER TABLE merchant_configs
  DROP COLUMN IF EXISTS publish_storefront,
  DROP COLUMN IF EXISTS meeting_point,
  DROP COLUMN IF EXISTS area_label;
