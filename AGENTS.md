# Instrucciones para agentes de MicoPay

Este repositorio mueve dinero real de personas en Mexico (efectivo <-> cripto en Stellar).
Antes de escribir codigo, lee las reglas de la casa:

- `.claude/skills/micopay-reglas/SKILL.md` (reglas que no se negocian)
- `.claude/skills/micopay-reglas/frontend.md`
- `.claude/skills/micopay-reglas/backend.md`
- `.claude/skills/micopay-verificar/SKILL.md` (verificacion)
- `CLAUDE.md` (AWS y manejo de secretos)

## Reglas que no se negocian

1. Toda accion que mueve dinero o revela algo sensible pasa por `requireUserPresence`.
2. La llave secreta solo se toca desde `lib/keystore.ts`, y se guarda con
   `services/secureStorage.ts`. Nunca en `localStorage`, nunca en un log, nunca por HTTP.
3. No dejar a nadie fuera de su propio dinero. En web, o sin bloqueo de pantalla,
   la compuerta de presencia deja pasar; no cambies esa politica sin que la issue lo pida.
4. Errores por codigo, no por texto: ramifica con `e instanceof ApiError && e.code === 'X'`.
5. Scope de la issue: toca solo los archivos de *In-scope files*. Si un criterio no se
   cumple sin salir de ahi, hazlo y explicalo en el PR.
6. Si la issue dice que esperes una decision del maintainer, para y pregunta.

## Flujo de trabajo

- Rama: `feat/<id-en-minusculas>-<tema>` desde `origin/main` actualizado.
- Un test por criterio de aceptacion, incluido el camino negativo.
- Inyecta la regresion: rompe el fix a mano y confirma que algun test falla.
- Corre `.claude/skills/micopay-verificar/verify.sh`.
- Commits: `tipo(area): descripcion en espanol (ID)`.
- PR con las secciones del repo: *What changed*, *Out of scope*, *Files outside In-scope*,
  *Tests*, *Manual check (pending)*.

## Verificacion

Clasifica cada fallo como ROTO, PREEXISTENTE, INTERMITENTE o REQUIERE PG.
Nunca digas "todo pasa" si hubo PREEXISTENTE, INTERMITENTE o REQUIERE PG.

## Seguridad

- No commitees `.env`, keystores, `.apk`, `.idsig` ni credenciales.
- No imprimas secretos en logs, issues ni PRs.
- Para AWS, sigue `CLAUDE.md` (Secrets Manager via `asm-exec`, sin `get-secret-value`).
