# Despliegue ECS — por qué NO hay que subir a 200/100

Fecha: 8 de septiembre de 2026.
Estado: análisis cerrado. Los cambios propuestos siguen **sin aplicar**: la
sesión de AWS estaba caducada (`aws login`) cuando se escribió esto.

## 1. El incidente

El 5 de septiembre de 2026, entre las 18:49 y las 18:57 (~8 minutos), la API
de producción estuvo caída. El despliegue paró la tarea vieja y **nunca arrancó
la nueva**: el servicio se quedó en `running 0, pending 0` sin emitir un solo
evento — ECS ni siquiera intentaba colocarla.

Se descartó una por una cada causa: la revisión 14 era idéntica a la 13 salvo
la etiqueta de imagen; una tarea suelta con la revisión 14 arrancó bien;
revertir a la 13 **tampoco** se agendó. Es decir: el atasco era del planificador
de ECS, no del código ni de la imagen. Se desbloqueó bajando `desiredCount` a 0
y volviéndolo a 1.

## 2. La recomendación que salió de ahí, y por qué está mal

De ese incidente salió apuntado "subir `maximumPercent` a 200 y
`minimumHealthyPercent` a 100 para tener despliegues sin corte".

**Eso es exactamente el hallazgo A10 del plan de migración, al revés.**
`maximumPercent=100 / minimumHealthyPercent=0` no es un descuido: es una
decisión tomada a propósito, documentada en `AWS_GUIA_CONCEPTOS.md` §3.5 y en
`AWS_MIGRATION_PLAN_2026-07.md` A10. Subirlo a 200/100 hace que durante cada
despliegue **convivan la tarea vieja y la nueva**, y hoy el proceso no aguanta
eso:

- **El barrido de reembolsos** (`sweepPendingRefunds`, cada 5 minutos) manda
  transacciones a la cadena para devolver fondos de operaciones canceladas. Con
  dos tareas corre dos veces y puede intentar reembolsar la misma operación dos
  veces.
- **`runMigrations()` corre en cada arranque** (`index.ts:580`). Dos procesos
  aplicando migraciones a la vez sobre la misma base.
- **El listener de eventos de Soroban** avanza un cursor compartido.
- **`lib/keyedMutex.ts` lo dice en su propia cabecera**: solo serializa dentro
  de ESTE proceso, y el código lo usa para secciones críticas de leer-y-escribir
  (`kyc-gate.service.ts`). Con dos instancias deja de proteger nada.

O sea: los 40 segundos de corte por despliegue son el **precio pagado a
sabiendas** por no tener nunca dos barridos simultáneos. La caída de 8 minutos
no la causó esa configuración — la causó un atasco del planificador, y con
200/100 habría pasado igual.

## 3. Lo que sí arregla el problema real

El problema real no es el corte de 40 segundos. Es que **un despliegue atascado
deja producción caída indefinidamente y nadie se entera hasta que alguien abre
la app**. En orden de valor por esfuerzo:

**3.1 Alarma de tarea en cero (esto es lo que faltaba el día 5).**
Una alarma de CloudWatch sobre `RunningTaskCount` del servicio: si está por
debajo de 1 durante ~3 minutos, avisa. Es lo único de esta lista que habría
acortado los 8 minutos.

**3.2 Circuit breaker del despliegue, con rollback.**
```
aws ecs update-service --cluster micopay --service micopay-backend \
  --deployment-configuration "deploymentCircuitBreaker={enable=true,rollback=true},maximumPercent=100,minimumHealthyPercent=0"
```
Compatible con 100/0: no necesita dos tareas. Cubre el fallo habitual —la tarea
nueva arranca y se cae— revirtiendo sola a la revisión anterior. Aviso honesto:
el fallo del día 5 fue que la tarea **nunca se colocó**, sin lanzamientos
fallidos que contar, así que el breaker probablemente no lo habría atrapado.
Por eso 3.1 va primero.

**3.3 Periodo de gracia del health check** (A12, verificar si ya está puesto).
`initPg()` puede tardar ~95 s en rendirse con reintentos:
```
aws ecs update-service --cluster micopay --service micopay-backend \
  --health-check-grace-period-seconds 180
```

**3.4 Despliegue sin corte: es un proyecto, no una bandera.**
Para poder subir a 200/100 sin romper nada hay que poder tolerar dos instancias.
La vía es `pg_advisory_lock` —el mismo mecanismo que ya usa
`kycVolumeLedger.service.ts:80`— en tres sitios: `runMigrations()`, el barrido
de reembolsos y el listener de eventos. Con eso, la segunda instancia sirve HTTP
y se salta el trabajo de fondo. Mientras no exista, **100/0 se queda**.

## 4. Comprobaciones pendientes

Con la sesión de AWS viva (`aws login`), antes de aplicar nada:

```
aws ecs describe-services --cluster micopay --services micopay-backend \
  --query "services[0].deploymentConfiguration"
aws ecs describe-services --cluster micopay --services micopay-backend \
  --query "services[0].healthCheckGracePeriodSeconds"
aws cloudwatch describe-alarms --alarm-name-prefix micopay
```
