# Plan · Ordenar ramas y GitHub de micopay-protocol

**Fecha:** 2026-09-24 · **Estado:** v1.3. Incorpora las tres rondas de la auditoría de Codex del mismo día (§7). **No se ha ejecutado nada.**
**Repo:** `Micopay/micopay-protocol` (remoto `origin`). Checkout local: `Desktop/HACKATON`.

---

## 1. Estado verificado (2026-09-24, después de `git fetch --all --prune`)

### El problema: `main` no es lo que corre en producción

| | Commit | Fecha |
|---|---|---|
| `origin/main` | `cabefa0` (merge del #387) | 2026-09-04 |
| Producción (ECS `micopay-backend:15`, imagen `v13`) | `42d859a` en `feat/red-1-onboarding-interno` | construida el 2026-09-24 |

- `feat/red-1-onboarding-interno` va **0 commits detrás y 33 adelante** de `origin/main`: 16 del 2026-09-05 y 17 del 2026-09-14. Diff: 113 archivos, +13 448 / −1 853.
- **No tiene PR** (`gh pr list --head feat/red-1-onboarding-interno --state all` → `[]`).
- Contiene WP2 (pesos→XLM), RED-1/RED-2, CASH-3, WP-A a WP-F y H1–H6, más **4 migraciones nuevas** y cambios en `init.sql`.
- **Migraciones en producción, verificadas en `schema_migrations`** (consulta de solo lectura desde una tarea suelta de ECS con la task definition 15, 2026-09-24). Las 4 están registradas como aplicadas:
  `20260905120000_provider_enrollment` (2026-09-05 16:54 UTC), `20260905180000_trade_provider_fee` (18:25), `20260905190000_demo_provider_keys` (18:25), `20260905200000_trade_asset_rate` (19:32).
  Que `runMigrations()` corra al arrancar no bastaba como prueba: `index.ts` atrapa el error y el proceso sigue.
- `v12` (2026-09-05) también se construyó desde esta rama. `main` lleva desde el 2026-09-05 sin representar a producción.
- `users.is_banned` e `is_admin`: la migración `20260903000000_add_is_banned_is_admin` **está en `main`** (`26c3efd`, 2026-09-02) y aplicada en producción. No falta nada en el repo.

### KYC-1 va en otra rama y choca con RED-1

- PR **#388** `feat/kyc-1-didit-journey` → `main`: 0 detrás y 2 adelante (`ea75692`, `ad97e62`), CI verde, mergeable contra `main`.
- **No está** en la rama de producción.
- `git merge-tree` entre las dos ramas da **conflicto en `micopay/frontend/src/services/api.ts`**. También tocan los mismos archivos, sin conflicto: `backend/package.json`, `frontend/src/App.tsx` y `frontend/src/pages/Home.tsx`.

### Configuración del repo

- `main` **no tiene protección de rama** (API → 404 "Branch not protected").
- Se permiten merge commit, squash y rebase. `delete_branch_on_merge: false`.
- El CI (`.github/workflows/ci.yml`) corre en `pull_request` y `push` a `main`. **Nunca ha corrido sobre `feat/red-1-onboarding-interno`** porque no tiene PR. Trabajos: backend build (bloqueante), frontend build (bloqueante) con vitest (informativo), imagen Docker con la comprobación de que las migraciones van dentro (bloqueante).
- El `Dockerfile` copia `backend/src`, no `backend/scripts/`, así que el bot no entra en la imagen (confirmado por Codex).

### Ramas

**Ya mergeadas en `origin/main`** (existen en local y en `origin`):
`feat/cash-2-cancel-policy`, `feat/cash-4-cashout-completion`, `feat/cash-5a-canonical-states`, `feat/cash-5b-revealing-actions`, `feat/cash-6-refund-recovery`, `feat/cash-7-single-session`, `feat/cash-9-initiator-attribution`, `feat/cash-10-kyc-ledger`, `feat/red-3-meeting-point-privacy`.

**Sin mergear:**

| Rama | Dónde | vs `origin/main` | Nota |
|---|---|---|---|
| `feat/red-1-onboarding-interno` | local + origin | 0 / +33 | producción, sin PR |
| `feat/kyc-1-didit-journey` | local + origin | 0 / +2 | PR #388 |
| `respaldo/red-1-antes-de-limpiar` | solo local | 0 / +19 | `git cherry` marca **2 parches no equivalentes**. Hay commits con el mismo asunto en otras ramas (WP2 = `f2f805b`, íconos = `01f2caa`), pero no son el mismo parche. **No se puede afirmar que esté cubierta.** |
| `pr373`, `pr374` | solo local | −92/+1, −159/+1 | copias de los PRs de contribuidores |
| `feat/capacitor-apk-packaging` | solo local (upstream `[gone]`) | −440 / +3 | mayo |
| `fix/frontend-auth-session` | solo local | −439 / +2 | mayo |
| `docs/private-access-reframe` | solo local | −402 / +2 | junio |
| `fix/p0-1-p0-2-single-identity-real-counterparty` | local + origin | −311 / +16 | 16 parches no equivalentes; local va **+1 sin subir** (`9ad58d6`) |

**PRs abiertos:** #388 (KYC-1, nuestro); #373 (`feat/red-1-provider-enrollment`, sasasamaes); #374 (`may`, canicefavour, sin actividad desde el 2026-08-31).

**Otros:** 7 stashes (el más reciente de junio). Remoto `private` (`ericmt-98/micopay-mvp1`), sin cambios desde el 2026-03-24.

### Trabajo sin commit en la rama actual

- `micopay/frontend/src/pages/DepositChat.tsx`: el aviso del depósito se queda en verde en `revealing`. **No entra en este plan**: va con el próximo APK y se prueba en el dispositivo (§7, respuesta 2).
- `micopay/backend/scripts/demo-agent/` (`bot.ts`, `qr_from_phone.py`).
- `docs/PENDIENTES_2026-09-24.md`, `docs/PLAN_COMISIONES_EFECTIVO_2026-09-24.md`, `docs/AUDITORIA_IMPLEMENTACION_SELECTOR_ACTIVO_2026-09-14.md` y este plan.
- **No entran** (se respaldan, no se commitean): `docs/PROPUESTA_COLABORACION_TIA_MICOPAY_*.docx`, `scripts/create_tia_micopay_report.py`, `skills.json`, `tmp/`.

---

## 2. Objetivo

1. `main` = lo que corre en producción, con el historial conservado.
2. KYC-1 en `main`, con el conflicto resuelto y CI verde.
3. Sin ramas mergeadas en local ni en GitHub.
4. Sin PRs de contribuidores colgados.
5. Las ramas con trabajo único **se conservan** hasta terminar de compararlas (§4).

**Fuera de alcance:** desplegar, configurar Didit, cambiar código de producto, tocar `micopaybridge` y tocar el remoto `private`.

---

## 3. Pasos

### Paso 0 · Respaldo previo

**0a. Historial:**
```
git bundle create ../micopay-protocol-2026-09-24.bundle --all
git bundle verify ../micopay-protocol-2026-09-24.bundle
git bundle list-heads ../micopay-protocol-2026-09-24.bundle | wc -l   # debe coincidir con `git for-each-ref | wc -l`
```
El bundle guarda el historial alcanzable. **No guarda los cambios sin commit ni los archivos sin rastrear.** De los stashes, `--all` puede incluir el más reciente por `refs/stash`, pero los otros 6 dependen del reflog y no hay garantía de que entren. Por eso se respaldan uno por uno en 0b.

**0b. Trabajo sin commit y archivos sin rastrear:**
```
D=../respaldo-worktree-2026-09-24 && mkdir -p "$D"
git diff > "$D/cambios-sin-commit.patch"                          # hoy: DepositChat.tsx
git ls-files --others --exclude-standard -z | tar --null -T - -czf "$D/sin-rastrear.tgz"
git stash list > "$D/stash-list.txt"
for i in $(seq 0 $(( $(git stash list | wc -l) - 1 ))); do git stash show -p --include-untracked "stash@{$i}" > "$D/stash-$i.patch"; done
```
Verificar: `git apply --check "$D/cambios-sin-commit.patch"` sobre una copia limpia, y `tar -tzf "$D/sin-rastrear.tgz"` lista `docs/…`, `micopay/backend/scripts/…`, los `.docx`, `skills.json` y `tmp/`.

**0c. Tag de producción, publicado:**
```
git tag -a prod-v13-2026-09-24 42d859a -m "Imagen micopay-backend:v13, task definition 15"
git push origin prod-v13-2026-09-24
```
Marca el commit exacto de lo desplegado aunque se borre la rama.

### Paso 1 · Apartar el arreglo del APK y commitear lo de hoy en `feat/red-1-onboarding-interno`

```
git stash push -m "apk: aviso deposito en verde en revealing" -- micopay/frontend/src/pages/DepositChat.tsx
```
Commits separados:
1. `chore(demo): bot de agente para demos con un solo telefono`, solo `micopay/backend/scripts/demo-agent/`.
2. `docs: pendientes, plan de comisiones, auditoria del selector y plan de orden de GitHub`.

`git push origin feat/red-1-onboarding-interno`.

Ninguno de los dos cambia el runtime: `scripts/` y `docs/` no entran en la imagen. La punta deja de ser `42d859a`, pero lo desplegado queda fijado con el tag del paso 0c.

### Paso 2 · PR de `feat/red-1-onboarding-interno` → `main`

```
gh pr create --repo Micopay/micopay-protocol --base main --head feat/red-1-onboarding-interno \
  --title "RED-1/RED-2, WP2, CASH-3, selector de activo (WP-A..F) y H1–H6" --body-file <cuerpo>
```
- El cuerpo lista lo que entra; las 4 migraciones, ya aplicadas en producción según `schema_migrations`; que **ya está desplegado** (`v13`, tag `prod-v13-2026-09-24`); y los pendientes que se saben (H5 comisiones; depósito sin "Recibí el efectivo").
- Esperar el CI. Los 3 trabajos bloqueantes tienen que salir en verde. Es la primera vez que corre sobre este código.
- **Si el CI falla:** no mergear. Primero clasificar la causa:
  - **Del código en `42d859a`:** probablemente también afecte a producción. Anotarlo y arreglarlo en la rama.
  - **Del entorno o las dependencias del runner** (versiones de npm o node, caché, red): no dice nada de producción. Se arregla en el CI.
  - **De los commits del paso 1:** revisarlos. No deberían afectar el build.

**Método de merge: merge commit (`--merge`), no squash.** Conserva `42d859a` como ancestro de `main` y los mensajes de cada commit.

```
gh pr merge <n> --repo Micopay/micopay-protocol --merge
```
**Verificación:** `git merge-base --is-ancestor 42d859a origin/main` → exit 0.

### Paso 3 · KYC-1 (#388): incorporar `main` con merge, sin rebase

```
git fetch origin
git checkout feat/kyc-1-didit-journey
git merge origin/main              # resolver micopay/frontend/src/services/api.ts
cd micopay/backend && npx tsc --noEmit
for s in test:kyc-gate test:kyc-monthly-volume test:kyc-didit test:kyc-ledger; do
  npm run -s --script-shell "C:/Program Files/Git/bin/bash.exe" $s || echo "FALLA $s"
done
cd ../frontend && npx tsc --noEmit && npx vitest run
git push origin feat/kyc-1-didit-journey      # sin --force: no se reescribe nada
```
- Los 4 scripts son los que declara `backend/package.json` en `feat/kyc-1-didit-journey`. `--script-shell` hace falta en Windows porque los scripts usan `VAR=x cmd`.
- Esperar el CI del #388. Mergear con `--merge`.
- **Aviso:** al mergear el #388, `main` queda **por delante** de producción hasta el próximo despliegue. El despliegue es otro trabajo (ver `PENDIENTES_2026-09-24.md` §1). Anotarlo en el PR.

### Paso 4 · PRs de contribuidores

- Cerrar #374 y #373 **sin comentario** (regla de Eric: no se explican cierres en público).
- Nada del #373 hace falta rescatar: RED-1 se hizo internamente (`d441ddb`) y la migración de `is_banned`/`is_admin` ya está en `main` (`26c3efd`).
- Las copias locales `pr373` y `pr374` se borran en el paso 6.

### Paso 5 · Borrar ramas en GitHub (solo las mergeadas)

Después del paso 3. Antes de borrar cada una: `git merge-base --is-ancestor origin/<rama> origin/main`.
```
git push origin --delete \
  feat/cash-2-cancel-policy feat/cash-4-cashout-completion feat/cash-5a-canonical-states \
  feat/cash-5b-revealing-actions feat/cash-6-refund-recovery feat/cash-7-single-session \
  feat/cash-9-initiator-attribution feat/cash-10-kyc-ledger feat/red-3-meeting-point-privacy \
  feat/red-1-onboarding-interno feat/kyc-1-didit-journey
```
**Se conserva** `origin/fix/p0-1-p0-2-single-identity-real-counterparty` hasta terminar §4.

### Paso 6 · Borrar ramas locales

```
git checkout main && git pull --ff-only
git branch -d feat/cash-2-cancel-policy feat/cash-4-cashout-completion feat/cash-5a-canonical-states \
  feat/cash-5b-revealing-actions feat/cash-6-refund-recovery feat/cash-7-single-session \
  feat/cash-9-initiator-attribution feat/cash-10-kyc-ledger feat/red-3-meeting-point-privacy \
  feat/red-1-onboarding-interno feat/kyc-1-didit-journey
git branch -D pr373 pr374
```
`-d` falla si la rama no está mergeada: es la red de seguridad. `-D` solo para las dos copias de PRs cerrados.

**Se conservan** hasta terminar §4: `respaldo/red-1-antes-de-limpiar`, `fix/p0-1-…` (con su commit sin subir `9ad58d6`), `fix/frontend-auth-session`, `docs/private-access-reframe` y `feat/capacitor-apk-packaging`. Los 7 stashes se quedan.

Después: `git checkout -b fix/apk-demo main && git stash pop` para recuperar el arreglo del aviso en la rama del próximo APK (ver el stash por su mensaje con `git stash list`).

### Paso 7 · Ajustes del repo

**7a.** `delete_branch_on_merge: true`:
```
gh api -X PATCH repos/Micopay/micopay-protocol -F delete_branch_on_merge=true
```

**7b. Protección de `main`** (recomendación de Codex, 2026-09-24; **falta la autorización de Eric para ejecutar**):
- Todo cambio entra por **PR**, **sin exigir la aprobación de otro revisor** (`required_approving_review_count: 0`), para que Eric pueda trabajar solo.
- **Los 3 checks bloqueantes en verde**, con los nombres exactos que reporta GitHub en `cabefa0`:
  `Backend build (micopay/backend)`, `Frontend build + tests (micopay/frontend)`, `Imagen Docker de producción (micopay/backend)`.
  En el de frontend, vitest lleva `continue-on-error: true`: el check exige el build, no las pruebas. Volver bloqueante a vitest es un cambio aparte del workflow, **fuera de este plan** (anotado en `PENDIENTES_2026-09-24.md`).
- Prohibir el **push forzado** y el **borrado** de `main`.
- `strict: true`: la rama tiene que estar al día con `main` antes de mergear, para que los checks correspondan a la integración con el `main` vigente (Codex, 3ª ronda).
- `enforce_admins: true`: la regla también aplica a Eric, que es admin. Si fuera `false`, Eric podría seguir empujando directo y la protección no serviría para él.

```
gh api -X PUT repos/Micopay/micopay-protocol/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      {"context": "Backend build (micopay/backend)"},
      {"context": "Frontend build + tests (micopay/frontend)"},
      {"context": "Imagen Docker de producción (micopay/backend)"}
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {"required_approving_review_count": 0},
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```
**Verificación:** `gh api repos/Micopay/micopay-protocol/branches/main/protection` devuelve la configuración, y un `git push origin main` directo es rechazado.

**Orden:** va al final, después de los pasos 2 y 3. Si se pone antes, los merges de esos pasos también tienen que esperar los checks, lo cual está bien, pero hay que confirmar que los nombres coinciden en los PRs antes de exigirlos.

---

## 4. Tarea aparte: comparar las ramas con trabajo único

No se borra ninguna antes de terminar esto. Para cada una:
```
git cherry -v origin/main <rama>                  # parches que no están en main
git log --format='%h %s' origin/main..<rama>
git diff origin/main...<rama> --stat              # cambios propios desde la base común
```
- `respaldo/red-1-antes-de-limpiar`: comparar sus 2 parches únicos contra `f2f805b` y `01f2caa` con `git diff <parche_respaldo> <parche_red1>`. Si solo cambia el orden o el contexto, se puede borrar. Si cambia la lógica, decidir qué versión es la buena.
- `fix/p0-1-…` (16 parches, local +1): revisar por funcionalidad si P0-1/P0-2 (identidad única, contraparte real) y el README de ZK (`9ad58d6`) ya están en `main`.
- `fix/frontend-auth-session`, `docs/private-access-reframe` y `feat/capacitor-apk-packaging`: 2 o 3 commits cada una; revisar a mano.

Lo que resulte se anota aquí antes de borrar nada.

---

## 5. Verificación final

- `git merge-base --is-ancestor prod-v13-2026-09-24 origin/main` → exit 0.
- `gh pr list --state open` → sin #373, #374 ni #388.
- `git branch -r` → `origin/main` y `origin/fix/p0-1-…`, hasta terminar §4.
- El CI de `main` después del último merge sale en verde.
- El tag `prod-v13-2026-09-24` existe en `origin`.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| El CI falla en red-1 por primera vez | No mergear. Clasificar la causa (código, entorno o commits nuevos) antes de sacar conclusiones sobre producción |
| Resolver mal el conflicto de `api.ts` | tsc y los 4 tests de KYC tras el merge, vitest del frontend y el CI del #388 |
| Perder trabajo sin commit o sin rastrear | Respaldo aparte (0b), verificado con `git apply --check` y `tar -tzf` |
| Borrar una rama con trabajo único | Solo se borran las mergeadas (`-d`, más `merge-base --is-ancestor` en remoto). Las demás esperan a §4 |
| `main` por delante de producción tras el #388 | Anotarlo en el PR; el despliegue se planea aparte |
| `main` sin protección durante el proceso | Solo Eric empuja; el paso 7 lo cierra |

## 7. Auditoría de Codex (2026-09-24) y cómo se incorporó

| Observación | Cambio en v1.1 |
|---|---|
| El bundle no guarda los cambios sin commit, los archivos sin rastrear ni los stashes; hay que verificarlo | Paso 0 dividido en 0a (bundle más `verify`) y 0b (patch, tar y stashes) |
| Arrancar `runMigrations()` no prueba que se aplicaron | Se consultó `schema_migrations` en producción: las 4 están aplicadas (§1). También apareció que `is_banned` sí tiene migración en `main` |
| Un fallo de CI no implica un fallo en producción | Paso 2: hay que clasificar la causa |
| `test:kyc-*` no es un script | Paso 3: los 4 nombres concretos |
| 1 · Merge commit | Sí |
| 2 · Aviso del depósito | Fuera de este PR; va al APK con prueba en el dispositivo (pasos 1 y 6) |
| 3 · #388 | Merge de `main` dentro de la rama, sin reescribir el PR |
| 4 · `scripts/demo-agent/` | Confirmado: no entra en la imagen |
| 5 · Ramas antiguas | No se borran; nueva §4 de comparación |
| Publicar el tag | Paso 0c: `prod-v13-2026-09-24` en `origin` |
| *(2ª ronda)* El bundle puede llevar el stash más reciente, pero no los 7 | Nota en 0a. Se mantiene el respaldo explícito de 0b |
| *(2ª ronda)* Proteger `main`: PR sin revisor obligatorio, 3 checks, sin push forzado ni borrado | Paso 7b con los nombres exactos de los checks |
| *(3ª ronda)* `strict: true`; vitest sigue sin bloquear hasta un cambio aparte del workflow | Paso 7b actualizado; el cambio de vitest se anotó en los pendientes |
