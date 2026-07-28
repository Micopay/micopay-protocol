# SEC-04: Rate limiting global no protege endpoints de autenticación

## Resumen
El servicio aplica un rate limit global de 100 solicitudes por minuto a toda la API mediante el plugin de Fastify. Ese límite compartido afectaba desproporcionadamente a los endpoints de autenticación, porque `POST /auth/challenge` y `POST /auth/token` no tenían una política propia que los aislara del resto del servicio.

## Impacto
- Un atacante podía agotar el bucket compartido con solicitudes repetidas a los endpoints de autenticación.
- El bloqueo global podía afectar usuarios legítimos que intentaban usar otros endpoints de la API durante el mismo periodo.
- La mitigación anterior no ofrecía granularidad ni aislamiento para los flujos de login y challenge.

## Implementación realizada
Se añadieron límites específicos por ruta y por IP para los endpoints de autenticación:
- `POST /auth/challenge`
- `POST /auth/token`

La configuración se aplicó en el router de autenticación con un límite de 5 solicitudes por minuto por IP, usando el plugin de rate limiting de Fastify sobre las rutas afectadas.

## Verificación
Se añadió una prueba de regresión que valida que, tras exceder el límite por ruta, la API responde con `429 Too Many Requests` para solicitudes adicionales a `/auth/challenge`.

## Severidad
Media.
