# Reporte de Seguridad: SEC-27 - Fuga de Información en Telemetría `/client-errors`

## Plantilla

`Resultado:`
- Se identificó que el sistema de telemetría de errores del cliente (`reportClientError`) enviaba objetos `stack` y `context` crudos y sin procesar al backend, lo que presentaba el riesgo de fugar datos sensibles presentes en la memoria (tales como tokens JWT, claves privadas de Stellar/HTLC, contraseñas, etc.).
- Además, el encabezado de autenticación era incorrecto porque intentaba leer `localStorage.getItem('token')` directamente, una clave que no existe en el almacenamiento móvil habitual, ya que Micopay utiliza un almacenamiento seguro persistente (`secureStorage` mapeado bajo la clave `micopay_users` serializado como JSON). Por lo tanto, los reportes se enviaban de manera no identificada (unauthenticated).

`Evidencia:`
1. **Falta de Redacción/Filtro:** En `micopay/frontend/src/utils/reportError.ts`, el argumento `payload` recibido se propagaba tal cual al endpoint `/client-errors` a través de `axios.post(`${BASE_URL}/client-errors`, { ...payload })`.
2. **Método de Autenticación Inválido:** La línea `const token = localStorage.getItem('token');` no recuperaba el token correcto ya que este se encuentra encapsulado dentro del JSON almacenado bajo la clave `micopay_users` en la capa de almacenamiento seguro (`secureStorage`).
3. **Reproducibilidad:** Se comprobó que cualquier error capturado e informado enviaba la traza de pila de ejecución (stack trace) y cualquier información del contexto sin redactar ni depurar, y sin el header de autorización.

`Reproducible en testnet:` Sí.

`Sugerencia de fix:`
1. Modificar la función `reportClientError` para ser asíncrona (`async`).
2. Recuperar el token de usuario de forma asíncrona leyendo `micopay_users` mediante `readJSON<UserData>('micopay_users')`.
3. Implementar un filtro recursivo `redactSensitiveData` que busque y reemplace cualquier clave o valor de naturaleza sensible en el objeto `context` (ej. que contenga patrones como `token`, `secret`, `key`, `password`, `auth`, `htlc`, `private`, `seed`, `mnemonic`).
4. Implementar un filtro de cadenas `redactString` para la traza de error (`stack`) y el mensaje (`message`) para redactar claves privadas de Stellar y tokens JWT/Bearer antes de enviarlos al backend.

---

Este reporte ha sido documentado y el código ha sido corregido según la sugerencia de fix anterior.
