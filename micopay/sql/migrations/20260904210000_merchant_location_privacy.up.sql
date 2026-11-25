-- Migration 20260904210000 — RED-3: separar la zona publica del punto de
-- encuentro exacto.
--
-- `GET /merchants/available` es publico y sin autenticar. El arreglo de
-- privacidad de `905cf77` le puso rate limit y redondeo de coordenadas a tres
-- decimales (~110 m), pero seguia devolviendo `address_text` tal cual, un
-- campo de texto libre que tanto puede decir "Centro, CDMX" como una
-- direccion con numero. Redondear las coordenadas no protege nada si al lado
-- viaja el domicilio escrito.
--
-- Y esto no es un detalle teorico: los proveedores de Red MicoPay pueden ser
-- comercios, trabajadores informales o particulares. Un comercio quiza quiere
-- publicar su local; una persona no puede acabar publicando su casa en un
-- endpoint enumerable sin haberlo elegido.
--
-- DECISION DE PRODUCTO aplicada aqui (el issue la dejaba por confirmar; se
-- toma la lectura conservadora, que es la unica segura por omision):
--
--   * `area_label` es publico y no sensible. Una zona amplia, nunca una
--     direccion.
--   * `meeting_point` es privado. Solo lo ven las dos partes de una operacion
--     ya aceptada y no terminada.
--   * `publish_storefront` es el consentimiento explicito para publicar la
--     direccion exacta. Por omision FALSE: tener `address_text` lleno NO se
--     interpreta como permiso, que es justo lo que el issue prohibe inferir.
--
-- Migracion de datos en la direccion segura: lo que ya existia en
-- `address_text` se mueve a `meeting_point` (privado) y NO se copia a
-- `area_label`. Es decir, nadie queda publicado por esta migracion. Un
-- proveedor que quiera publicar su local tendra que decirlo.

ALTER TABLE merchant_configs
  ADD COLUMN IF NOT EXISTS area_label         TEXT,
  ADD COLUMN IF NOT EXISTS meeting_point      TEXT,
  ADD COLUMN IF NOT EXISTS publish_storefront BOOLEAN NOT NULL DEFAULT false;

-- Lo existente pasa a privado. Idempotente: solo mueve lo que aun no se movio.
UPDATE merchant_configs
SET meeting_point = address_text
WHERE address_text IS NOT NULL AND meeting_point IS NULL;

-- `address_text` se conserva en la tabla a proposito, sin lecturas nuevas: es
-- el respaldo del dato durante el despliegue. Retirarlo es una limpieza
-- posterior, cuando conste que nada lo consulta.

COMMENT ON COLUMN merchant_configs.area_label IS
  'RED-3: zona publica, no sensible. Se devuelve en discovery anonimo.';
COMMENT ON COLUMN merchant_configs.meeting_point IS
  'RED-3: punto de encuentro exacto. Privado: solo participantes de una operacion aceptada, o publico si publish_storefront.';
COMMENT ON COLUMN merchant_configs.publish_storefront IS
  'RED-3: consentimiento explicito para publicar meeting_point. Nunca se infiere.';
