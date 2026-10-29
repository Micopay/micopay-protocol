# AWS explicado con MicoPay

**Para:** entender qué estamos construyendo, por qué tiene esa forma y cómo depurarlo cuando falle.
**Complemento de:** `docs/AWS_MIGRATION_PLAN_2026-07.md` (ese tiene los comandos; este tiene el *porqué*).
**Fecha:** 2026-07-22

---

## 0. El cambio mental: de una caja a un Lego

Hoy en Render tienes **una caja**. Le das un repo, te da una URL con HTTPS. Render decide por ti la red, el certificado, el balanceador, dónde viven los secretos y cómo llega el tráfico. No los ves porque están incluidos.

AWS no vende cajas, vende **piezas**. Ninguna pieza hace nada sola: un contenedor sin red no recibe tráfico, una base de datos sin grupo de seguridad no acepta conexiones, un balanceador sin certificado no habla HTTPS. Eso es lo que hace que AWS se sienta abrumador al principio y por qué la consola tiene 200 servicios.

La buena noticia: **las piezas de Render también existían, solo que ocultas**. No estamos añadiendo complejidad, la estamos haciendo visible. A cambio obtienes control (backups de verdad, secretos con permisos, alarmas) y un techo de crecimiento que Render free no tiene.

Este documento arma el Lego pieza por pieza.

---

## 1. El mapa completo: 9 piezas

```
   Internet
      │
      │  (1) Route53      "api.micopay.app → esta dirección"
      ▼
   ┌──────────────────────────────────────────────┐
   │ (2) ALB  ── (3) certificado ACM              │   subredes públicas
   │      firewall: SG-alb (443 desde el mundo)   │
   └───────────────────┬──────────────────────────┘
                       │ HTTP :3000
   ┌───────────────────▼──────────────────────────┐
   │ (4) ECS Fargate — 1 tarea                    │   subred pública,
   │      corre (5) la imagen de ECR              │   con IP pública
   │      lee (6) secretos de SSM al arrancar     │
   │      escribe (7) logs a CloudWatch           │
   │      firewall: SG-app (3000 solo desde ALB)  │
   └───────────────────┬──────────────────────────┘
                       │ TLS :5432
   ┌───────────────────▼──────────────────────────┐
   │ (8) RDS PostgreSQL 16                        │   sin IP pública
   │      firewall: SG-db (5432 solo desde SG-app)│
   └──────────────────────────────────────────────┘

   (9) IAM — quién puede hacer qué. Atraviesa todo lo anterior.
```

| # | Pieza | Qué es, en una frase | Qué hacía Render por ti |
|---|---|---|---|
| 1 | **Route53** | El DNS: traduce `api.micopay.app` a una dirección | Te daba `*.onrender.com` gratis |
| 2 | **ALB** (Application Load Balancer) | La puerta de entrada: termina HTTPS y reparte tráfico | Incluido e invisible |
| 3 | **ACM** (Certificate Manager) | Emite y renueva el certificado TLS, gratis | Incluido e invisible |
| 4 | **ECS Fargate** | Corre tu contenedor sin que administres servidores | Era literalmente "el servicio" |
| 5 | **ECR** (Elastic Container Registry) | El almacén de imágenes Docker, privado | Render construía desde el repo |
| 6 | **SSM Parameter Store** | Guarda secretos cifrados con control de acceso | El dashboard de env vars |
| 7 | **CloudWatch** | Logs y alarmas | La pestaña "Logs" |
| 8 | **RDS** | PostgreSQL gestionado con backups | Render Postgres (plan free, expira) |
| 9 | **IAM** | El sistema de permisos de todo AWS | No existía equivalente |

---

## 2. Recorrido de una petición real

La mejor forma de entender la arquitectura es seguir **una** petición. Alguien abre el APK y toca "Mis trades", lo que dispara `GET https://api.micopay.app/trades`.

**Paso 1 — DNS (Route53).** El teléfono pregunta "¿dónde está `api.micopay.app`?". Route53 tiene un registro *alias* que responde con las IPs del ALB. Es un alias y no una IP fija porque **el ALB cambia de IPs solo**; si hubiéramos escrito una IP a mano, un día dejaría de funcionar sin avisar.

**Paso 2 — TLS (ALB + ACM).** El teléfono abre una conexión TLS al ALB. El ALB presenta el certificado de ACM para `api.micopay.app`. Aquí termina el cifrado del cliente: de este punto en adelante viajamos dentro de la VPC. ACM renueva el certificado solo mientras el registro DNS de validación siga existiendo — por eso ese CNAME de validación **nunca se borra**.

**Paso 3 — Primer firewall (SG-alb).** El grupo de seguridad del ALB permite 443 desde `0.0.0.0/0`. Si intentaras conectarte al puerto 3000 del ALB, no habría nada escuchando.

**Paso 4 — El ALB elige un destino.** Mira su *target group*: la lista de destinos sanos. Ahí está la IP privada de nuestra única tarea Fargate, en el puerto 3000. "Sana" significa que respondió 200 a `GET /health` en los últimos chequeos. **Si `/health` devuelve 503 porque la BD está caída, el ALB saca la tarea de rotación y responde 503 él mismo.** Eso es deseable: mejor un error honesto que servir datos rotos.

**Paso 5 — Segundo firewall (SG-app).** El SG de la tarea solo permite entrada en 3000 *desde SG-alb*. Nota bien: la regla no dice una IP, dice **otro grupo de seguridad**. Es lo más elegante de los SG en AWS: expresas "solo el balanceador puede hablarme" sin conocer ninguna IP, y sigue siendo cierto cuando el balanceador cambie de IP.

**Paso 6 — Tu código.** Fastify recibe la petición. Aquí importan dos cosas de configuración:
- `trustProxy` — el teléfono ya no es quien conecta, es el ALB. La IP real del cliente llega en la cabecera `X-Forwarded-For`. Por eso Fastify tiene que "confiar en el proxy" para que los rate limits por IP funcionen. Y por eso debe ser `trustProxy: 1` y no `true`: con `true`, Fastify se cree la entrada *más a la izquierda* de esa cabecera, que la escribe el cliente y por tanto se puede falsear.
- **CORS** — la petición trae `Origin: https://localhost` (el APK es un WebView sirviendo desde ese origen). Si el backend no devuelve `Access-Control-Allow-Origin`, el WebView tira la respuesta a la basura aunque el servidor haya respondido perfecto. De ahí que `CORS_ALLOWED_ORIGINS` sea obligatoria.

**Paso 7 — Tercer firewall (SG-db) y la BD.** El código consulta PostgreSQL. SG-db permite 5432 *solo desde SG-app*. RDS además **no tiene IP pública**: no existe una ruta desde internet hacia ella, aunque adivinaras la contraseña. La conexión va cifrada con TLS porque RDS PostgreSQL 16 lo exige (`rds.force_ssl=1` viene activado por defecto) — de ahí el `?sslmode=require` en la cadena de conexión.

**Paso 8 — Vuelta y logs.** La respuesta regresa por el mismo camino. En paralelo, cada línea de log que escribe Fastify a stdout la captura el driver `awslogs` y aparece en CloudWatch en el grupo `/ecs/micopay-backend`.

**Y hay un paso 0 que ocurrió antes de todo:** cuando la tarea arrancó, ECS bajó la imagen de ECR, leyó los secretos de SSM y los inyectó como variables de entorno, y solo entonces ejecutó `node dist/index.js`. Si cualquiera de esos tres pasos falla, el contenedor nunca arranca — y es de lejos la causa #1 de deploys fallidos (§6).

---

## 3. Conceptos base, en el orden en que los vas a necesitar

### 3.1 Región y zona de disponibilidad

Una **región** es una zona geográfica (`us-east-1` = norte de Virginia). Dentro de cada región hay varias **zonas de disponibilidad (AZ)**: centros de datos separados físicamente pero conectados con fibra rápida. `us-east-1a` y `us-east-1b` son AZ distintas.

Sirven para tolerar fallos: si se cae un centro de datos, lo que esté en otra AZ sigue vivo.

**En MicoPay:** el ALB está en dos AZ (es un requisito de AWS, y sale gratis). La tarea Fargate y RDS están en una sola. Poner RDS en Multi-AZ duplicaría su costo para protegernos de un fallo de centro de datos completo — con cero usuarios reales, no vale la pena todavía. El día que sí, es un cambio de un flag, no una re-arquitectura.

**Por qué `us-east-1` y no México:** `mx-central-1` (Querétaro) existe pero tiene menos servicios y precios más altos. Los ~70 ms extra de latencia CDMX↔Virginia son irrelevantes cuando cada operación ya espera segundos por Soroban RPC o por SPEI. Si algún día la regulación exige residencia de datos en México, se mueve la misma task definition a `mx-central-1` — está previsto, no es deuda.

### 3.2 VPC, subredes y cómo se sale a internet

Una **VPC** es tu red privada dentro de AWS: un rango de IPs que nadie más usa. Toda cuenta trae una VPC "default" ya creada, y para MicoPay esa basta.

La VPC se divide en **subredes**, una por AZ. La diferencia entre "pública" y "privada" **no es una casilla**, es una sola cosa: si su tabla de rutas tiene o no una ruta hacia el **Internet Gateway (IGW)**.

- **Subred pública** = tiene ruta al IGW. Lo que viva ahí *puede* salir a internet, **si además tiene una IP pública asignada**.
- **Subred privada** = no tiene ruta al IGW. Para salir a internet necesita un **NAT Gateway**: una pieza que vive en una subred pública y hace de intermediario. El NAT permite salir sin permitir entrar.

Ese NAT Gateway cuesta **~$32/mes fijos** más tráfico. Es, de lejos, la sorpresa de factura más común de quien empieza en AWS.

**En MicoPay:** la tarea Fargate va en **subred pública con IP pública**. Necesita salir a internet constantemente — Soroban RPC, Horizon, la API de Etherfuse, Firebase Cloud Messaging — y así sale por el IGW **sin pagar NAT**. ¿Y no es inseguro tener IP pública? No: tener IP pública significa *poder salir*; que alguien pueda *entrar* lo decide el grupo de seguridad, y el nuestro solo acepta el puerto 3000 desde el ALB. Nadie de internet puede tocar la tarea.

RDS es el caso opuesto: **no necesita salir a internet ni recibir de internet**. Por eso va con `--no-publicly-accessible`.

> Esta decisión es exactamente la que descartó App Runner. App Runner con conector VPC enruta *todo* su tráfico de salida por la VPC, y si esa VPC no tiene NAT, el servicio se queda sin internet: mueren Soroban, Etherfuse y FCM. La opción era pagar los $32 del NAT o dejar la base de datos expuesta. Fargate en subred pública esquiva ambas.

### 3.3 Grupos de seguridad

Un **security group (SG)** es un firewall con estado que se pega a un recurso. Dos propiedades que lo hacen distinto de un firewall clásico:

1. **Solo tiene reglas de permiso.** No hay "denegar": lo que no está permitido, está bloqueado. No existe orden de reglas ni prioridades.
2. **Con estado:** si permites la entrada, la respuesta sale automáticamente. No hay que abrir el puerto de vuelta.

Y lo más útil: **una regla puede referenciar otro SG en vez de una IP**.

En MicoPay hay tres, en cadena:

| SG | Permite entrada de | En el puerto | Se lee como |
|---|---|---|---|
| `micopay-alb` | `0.0.0.0/0` | 443, 80 | "el mundo puede tocar la puerta" |
| `micopay-app` | `micopay-alb` | 3000 | "solo la puerta puede hablarme" |
| `micopay-db` | `micopay-app` | 5432 | "solo la app puede consultarme" |

Esto es defensa en profundidad: para llegar a la base de datos desde internet habría que comprometer el ALB y luego la aplicación. Y como las reglas nombran grupos, siguen siendo correctas aunque todas las IPs cambien.

### 3.4 IAM: el modelo de permisos

**IAM** responde "¿quién puede hacer qué sobre cuál recurso?". Dos conceptos:

- **Usuario**: una persona, con contraseña o llaves de acceso. Las llaves son permanentes: si se filtran, es un problema serio.
- **Rol**: un conjunto de permisos que algo *asume temporalmente*, obteniendo credenciales que caducan en minutos u horas. Nadie "tiene" un rol; se asume.

**La regla práctica: casi todo debería ser un rol.** Las llaves de acceso permanentes son la fuga de credenciales más común de AWS.

MicoPay usa tres roles, y la distinción entre los dos primeros es la que más confusión causa:

| Rol | Quién lo asume | Para qué | Si falta un permiso |
|---|---|---|---|
| **Execution role** | El agente de ECS, **antes** de arrancar tu contenedor | Bajar la imagen de ECR, crear el log stream, **leer los secretos de SSM** | La tarea muere antes de ejecutar una línea de tu código: `ResourceInitializationError` |
| **Task role** | **Tu proceso**, ya corriendo | Llamar APIs de AWS desde el código | Tu código recibe `AccessDenied` en runtime |
| **Deploy role** | GitHub Actions | Push a ECR, actualizar el servicio ECS | El workflow falla |

Que los secretos los lea el *execution role* y no el *task role* es contraintuitivo pero tiene lógica: los secretos se resuelven **antes** de que exista tu proceso, para poder inyectarlos como variables de entorno. Es el permiso que más se olvida.

El **deploy role** usa **OIDC**: GitHub presenta un token firmado que prueba "soy el workflow del repo Micopay/micopay-protocol en la rama main", y AWS lo cambia por credenciales temporales. Así no existe ninguna llave de AWS guardada en los secrets de GitHub que pueda filtrarse.

### 3.5 Contenedores: imagen, registro, tarea, servicio

Cuatro palabras que se confunden todo el tiempo:

- **Imagen** — un sistema de archivos congelado con tu app y sus dependencias. Es el "ejecutable". Inmutable.
- **ECR** — el almacén privado de imágenes. Docker Hub, pero tuyo.
- **Task definition** — la *receta*: qué imagen, cuánta CPU y RAM, qué variables de entorno, qué secretos, a dónde van los logs. Es un JSON versionado: cada cambio crea una revisión nueva (`micopay-backend:1`, `:2`, …). Volver atrás es apuntar a la revisión anterior.
- **Tarea (task)** — una instancia corriendo de una task definition. Un contenedor vivo.
- **Servicio (service)** — el supervisor: "quiero N tareas de esta receta corriendo siempre, registradas en este target group". Si una tarea muere, el servicio levanta otra.

**Fargate** significa que no administras servidores: le dices "0.25 vCPU y 512 MB" y AWS pone la máquina. La alternativa (ECS sobre EC2) te haría gestionar, parchear y escalar instancias — exactamente lo que queremos dejar atrás.

**En MicoPay, `desiredCount = 1`, y eso es una decisión, no una limitación de presupuesto.** El proceso no es solo un servidor HTTP: dentro corre el *refund sweep* cada 5 minutos, que manda transacciones a la blockchain para devolver fondos de trades cancelados. Con dos tareas, ese barrido corre dos veces y podría intentar reembolsar el mismo trade dos veces. Escalar a más de una instancia requiere primero un candado distribuido (`pg_advisory_lock`) para que solo una haga el trabajo de fondo.

Ese mismo razonamiento explica una configuración rara del servicio: `maximumPercent=100, minimumHealthyPercent=0`. Por defecto ECS despliega *sin corte* levantando la tarea nueva antes de matar la vieja — pero eso significa **dos tareas conviviendo unos segundos**, justo lo que queremos evitar. Con esos valores, ECS mata primero y levanta después: ~40 segundos de corte por deploy, a cambio de garantizar que nunca hay dos barridos simultáneos. Sin usuarios reales, es un intercambio obvio.

> Este es también el motivo real por el que App Runner quedó descartado: cobra la memoria siempre pero **la CPU solo mientras procesa peticiones**, y estrangula la CPU de las instancias ociosas. Un `setInterval` de 5 minutos que mueve dinero on-chain no puede depender de que llegue tráfico para ejecutarse.

### 3.6 Secretos

Dos servicios hacen casi lo mismo:

- **SSM Parameter Store** — parámetros cifrados con KMS. **Gratis** en el tier estándar.
- **Secrets Manager** — igual, más rotación automática. **$0.40 por secreto al mes.**

Con ~9 secretos, Secrets Manager serían ~$43/año por una rotación automática que solo funciona para credenciales que AWS sabe rotar (como usuarios de RDS). Nuestras llaves de Stellar y Etherfuse no entran en esa categoría. **Decisión: SSM.**

Lo importante del modelo: los secretos **no viven en el repo, ni en el `taskdef.json`, ni en el historial de git**. El JSON solo contiene el *ARN* (la dirección) del parámetro:

```json
{ "name": "PLATFORM_SECRET_KEY",
  "valueFrom": "arn:aws:ssm:us-east-1:123456789012:parameter/micopay/prod/PLATFORM_SECRET_KEY" }
```

Ese ARN se puede versionar tranquilamente: sin el permiso IAM correspondiente, no sirve de nada.

Tres advertencias específicas de MicoPay:

- **`PLATFORM_SECRET_KEY` es una hot wallet de Stellar.** Quien la lee, controla los fondos. No es "un secreto más". "Rotarla" no es cambiar una variable: es crear una cuenta nueva y mover fondos. Por eso va sobre su **propia llave KMS** (`alias/micopay-hotwallet`), separada de los demás secretos: así el permiso de descifrado se controla y se audita aparte, y solo el *execution role* puede leerla. Matiz del modelo de permisos: los secretos sobre la llave por defecto (`aws/ssm`) no necesitan que el rol tenga `kms:Decrypt` explícito; una llave propia sí lo exige — y ese permiso explícito es justo lo que da el control extra.
- **`SECRET_ENCRYPTION_KEY` cifra los secretos HTLC ya guardados en la base.** Si copias los datos de Render, esta llave tiene que ser bit a bit la misma o esos registros quedan indescifrables para siempre. Solo se regenera si arrancas con base limpia.
- **`FIREBASE_PRIVATE_KEY` lleva saltos de línea.** El código hace `.replace(/\\n/g, '\n')`, así que hay que guardarla con los `\n` **escapados**, literalmente como dos caracteres.

### 3.7 CloudWatch

Todo lo que tu contenedor escribe a stdout/stderr acaba en un **log group** (`/ecs/micopay-backend`), dividido en **log streams** (uno por tarea). Pino ya escribe JSON estructurado, así que CloudWatch Logs Insights puede consultarlo por campo:

```
fields @timestamp, category, msg
| filter category = "refund-sweep"
| sort @timestamp desc
```

Las **alarmas** vigilan métricas y avisan. Las cuatro que importan para MicoPay:

| Alarma | Significa |
|---|---|
| `UnHealthyHostCount > 0` (target group) | La app dejó de responder `/health` con 200 |
| `HTTPCode_Target_5XX_Count` alto | La app responde, pero con errores |
| `FreeStorageSpace` bajo (RDS) | Los 20 GB se están acabando |
| `CPUUtilization` alto (RDS) | Falta un índice, o llegó tráfico de verdad |

Y una que no es de CloudWatch pero es igual de importante: **el Budget alert**. Sin usuarios reales, si la factura se dispara es porque algo está mal configurado, no porque estés creciendo.

---

## 4. Las decisiones, en formato pregunta → respuesta

**¿Por qué no App Runner, si es más simple?**
Por dos razones que se descubren tarde. (a) Con conector VPC pierde la salida a internet salvo que pagues un NAT Gateway de ~$32/mes; sin conector, la base de datos tendría que estar expuesta. (b) Solo asigna CPU mientras procesa peticiones, y el refund sweep necesita ejecutarse esté o no llegando tráfico. Con NAT incluido salía **más caro** que Fargate *y* con los jobs en riesgo.

**¿Por qué un ALB si solo hay una tarea?**
Porque una tarea de Fargate cambia de IP cada vez que se reinicia, y `api.micopay.app` necesita apuntar a algo estable. El ALB da la dirección fija, además de terminar TLS con un certificado que se renueva solo y de sacar la tarea de rotación cuando `/health` falla. Es la pieza más cara del stack (~$17/mes) y la única que no tiene alternativa razonable.

**¿Por qué RDS y no un contenedor de Postgres?**
Porque los datos tienen que sobrevivir al contenedor. Un Postgres en Fargate pierde todo al reiniciarse. RDS da backups automáticos con retención de 7 días, restauración a un punto en el tiempo, cifrado en reposo y parches gestionados. Es exactamente el problema que nos hizo salir de Render: la base free expira cada 90 días y ya se perdió una vez. Un detalle importante para no esperar magia: **restaurar un backup de RDS crea una instancia NUEVA con endpoint nuevo** — no es un botón de "deshacer", es "levantar la copia y repuntar la app a ella" (actualizar `DATABASE_URL` en SSM + redeploy). El runbook paso a paso está en §11 del plan de migración, y conviene ensayarlo una vez: un backup que nunca restauraste no sabes si sirve.

**¿Por qué `db.t4g.micro`?**
Es la instancia más pequeña con ARM (Graviton), ~20% más barata que su equivalente Intel a igual rendimiento. Para esta carga sobra. Subir de tamaño después es un `modify-db-instance` con unos minutos de corte.

**¿Por qué la base de datos no tiene IP pública, si es más incómodo?**
Porque es incómodo *también para un atacante*. El costo es real: para correr SQL a mano hay que entrar desde dentro de la VPC (`aws ecs execute-command` a la tarea). Es un buen intercambio para la base que guarda las llaves de custodia.

**¿Por qué SSM y no Secrets Manager?** Gratis vs ~$43/año por una rotación que no podemos usar.

**¿Por qué OIDC y no llaves de acceso en GitHub?** Porque una llave permanente en los secrets de un repo es una fuga esperando a ocurrir. Con OIDC no existe llave que filtrar.

**¿Por qué el contexto de build es `micopay/` y no `micopay/backend/`?**
Porque las migraciones SQL viven en `micopay/sql/` y el runner las busca en una ruta relativa que sale de `backend/`. Con un contexto acotado a `backend/`, la imagen se construye sin errores, arranca sin errores, y falla en la primera query real — el peor tipo de fallo. Por eso el CI verifica explícitamente que `/app/sql` exista dentro de la imagen.

---

## 5. Qué cuesta cada pieza y qué pasa si la apagas

| Pieza | ~USD/mes | Si la apagas |
|---|---|---|
| ALB | 17 | No hay HTTPS ni dominio; la app queda inalcanzable |
| RDS db.t4g.micro + 20 GB | 14 | No hay datos |
| Fargate 0.25 vCPU / 0.5 GB | 9 | No hay app |
| CloudWatch, ECR, transferencia | 2 | Te quedas ciego |
| Route53 hosted zone | 1 | El dominio no resuelve |
| SSM Parameter Store | 0 | — |
| **Total** | **~43** | |

Referencia: la alternativa App Runner + NAT Gateway obligatorio salía ~$61/mes.

Sobre el free tier: desde julio de 2025 AWS dejó de dar "12 meses gratis" a las cuentas nuevas. El esquema actual son créditos (~$100 al registrarse, hasta $100 más por completar actividades). Traducido: unos **4 meses cubiertos** y después precio completo. Poner el Budget alert **el primer día**, no cuando llegue la factura.

---

## 6. Los seis errores que vas a ver, y qué significan

**`ResourceInitializationError: unable to pull secrets or registry auth`**
El **execution role** no tiene permiso sobre los parámetros de SSM, o el ARN del secreto está mal escrito. Error #1 en primeros despliegues. Se arregla en IAM, no en el código.

**`CannotPullContainerError: image not found`**
La imagen no está en ECR con ese tag, o el nombre del registro no coincide con tu ID de cuenta.

**La tarea arranca y muere en bucle, `exit code 1`**
Es tu aplicación fallando, no AWS. Mira CloudWatch: `aws logs tail /ecs/micopay-backend --since 15m`. Los dos culpables típicos en MicoPay:
- `Configuration Validation Failed` — falta o está mal alguna variable (`validateConfig()` lista exactamente cuál).
- `PostgreSQL unavailable in production ... Exiting` — el `?sslmode=require` falta en `DATABASE_URL`, o el SG de la base no permite al SG de la app. **Nunca** lo "arregles" poniendo `ALLOW_IN_MEMORY_DB=true`: eso hace que el backend sirva desde un almacén en memoria que se borra en cada reinicio.

**El target group dice `unhealthy` pero los logs se ven bien**
Casi siempre es el puerto: el target group apunta a 3000 y el contenedor escucha en otro, o el SG de la app no permite entrada desde el SG del ALB. Recuerda también que `/health` devuelve **503 a propósito** si la base no responde — en ese caso el "unhealthy" es correcto y el problema está en la base.

**La tarea muere justo después de arrancar, sin error claro**
`initPg()` reintenta la conexión 5 veces con backoff: hasta ~95 segundos antes de rendirse. Si el health check grace period es menor, ECS mata la tarea *mientras todavía estaba conectando*. Por eso `--health-check-grace-period-seconds 180`.

**El APK no carga datos, pero `curl https://api.micopay.app/trades` funciona**
Es CORS. `curl` no manda `Origin`; el WebView sí. Si `CORS_ALLOWED_ORIGINS` no incluye `https://localhost`, el servidor responde bien y el WebView descarta la respuesta. Se ve en la consola del WebView, no en los logs del servidor — que mostrarán 200 tan tranquilos.

---

## 7. Los comandos que resuelven el 90%

```powershell
# ¿Qué está pasando ahora mismo?
aws ecs describe-services --cluster micopay --services micopay-backend --query "services[0].{running:runningCount,desired:desiredCount,status:status}"

# ¿Por qué murió la última tarea? (stoppedReason es la respuesta)
aws ecs describe-tasks --cluster micopay --tasks (aws ecs list-tasks --cluster micopay --desired-status STOPPED --query "taskArns[0]" --output text) --query "tasks[0].{reason:stoppedReason,containers:containers[].reason}"

# Logs en vivo
aws logs tail /ecs/micopay-backend --follow

# ¿El balanceador considera sana a la tarea?
aws elbv2 describe-target-health --target-group-arn $TgArn

# Entrar al contenedor (requiere --enable-execute-command en el servicio)
aws ecs execute-command --cluster micopay --task <task-id> --container api --interactive --command "/bin/sh"

# Redesplegar la misma imagen (útil tras cambiar un secreto en SSM)
aws ecs update-service --cluster micopay --service micopay-backend --force-new-deployment
```

Ese último merece énfasis: **los secretos se leen al arrancar la tarea.** Cambiar un parámetro en SSM no afecta a un contenedor que ya está corriendo; hace falta un despliegue nuevo.

---

## 8. Glosario

| Sigla | Nombre | En MicoPay |
|---|---|---|
| **VPC** | Virtual Private Cloud | La red donde vive todo |
| **AZ** | Availability Zone | Centro de datos; el ALB usa dos |
| **IGW** | Internet Gateway | La salida a internet de las subredes públicas |
| **NAT** | Network Address Translation gateway | La salida de las subredes privadas — **la evitamos** (~$32/mes) |
| **SG** | Security Group | Firewall por recurso; usamos tres en cadena |
| **IAM** | Identity and Access Management | Permisos; 3 roles |
| **ECR** | Elastic Container Registry | Donde vive la imagen Docker |
| **ECS** | Elastic Container Service | El orquestador que corre el contenedor |
| **Fargate** | — | El modo de ECS sin servidores que administrar |
| **ALB** | Application Load Balancer | La puerta HTTPS |
| **ACM** | AWS Certificate Manager | El certificado TLS, gratis y auto-renovado |
| **RDS** | Relational Database Service | PostgreSQL 16 gestionado |
| **SSM** | Systems Manager (Parameter Store) | Los secretos |
| **KMS** | Key Management Service | Las llaves que cifran SSM y RDS |
| **ARN** | Amazon Resource Name | El identificador único de cualquier recurso |
| **OIDC** | OpenID Connect | Cómo GitHub Actions se autentica sin llaves |
| **TTL** | Time To Live | Cuánto cachea el DNS una respuesta |

---

## 9. Si solo te llevas cinco ideas

1. **AWS son piezas sueltas.** Render también las tenía; aquí son visibles y por eso configurables.
2. **La red se define por rutas y grupos de seguridad**, no por casillas. "Pública" significa "tiene ruta al IGW"; "solo el ALB puede entrar" se expresa apuntando a otro grupo de seguridad.
3. **Casi todo debería ser un rol, no una llave.** Y los secretos los lee el *execution role* antes de que tu código exista — es el permiso que más se olvida.
4. **Una sola instancia es una decisión de corrección**, no de presupuesto: dentro del proceso corre un barrido que mueve dinero on-chain. Escalar exige antes un candado distribuido.
5. **El contexto de build Docker es `micopay/`.** Si no, la imagen se construye, arranca, y falla en la primera consulta real.
