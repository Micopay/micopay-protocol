# SEC-33 — La llave secreta Stellar se copiaba al portapapeles del sistema

| Campo | Valor |
| --- | --- |
| **ID** | SEC-33 |
| **Severidad** | 🟠 Alta — exposición de la llave que da control total de los fondos |
| **Issue** | — (interno, no publicado en Drips) |
| **Componente** | `micopay/frontend/src/pages/Profile.tsx`, `src/pages/Register.tsx` |
| **Estado** | ✅ Remediado |
| **Reportado por** | Auditoría del APK 2026-08-24 (`docs/AUDITORIA_APK_2026-08-24.md`, ISSUE-03) |

---

## 1. Resumen

La llave secreta Stellar (`S…`, 56 caracteres) da control total e irreversible
sobre la cuenta y sus fondos. No hay soporte al cliente que pueda revertir su
uso indebido.

Los dos flujos de respaldo de la app —el del alta y el de exportación desde
Perfil— la escribían en el **portapapeles global del sistema** mediante
`navigator.clipboard.writeText`.

Desde un WebView no es posible marcar ese contenido con
`ClipDescription.EXTRA_IS_SENSITIVE`, que es el mecanismo con el que Android
distingue un secreto de un texto cualquiera. La API web no lo expone.

## 2. Evidencia

`src/pages/Profile.tsx:153` (código anterior):

```ts
const handleExport = async () => {
  const confirmed = window.confirm(
      'Tu clave secreta da control total de tu cuenta. Nunca la compartas. Cópiala en un lugar seguro sin conexión.'
  );
  if (!confirmed) return;
  const secret = await exportSecretKey();
  await navigator.clipboard.writeText(secret);
  alert('Clave secreta copiada. Limpia tu portapapeles después de guardarla.');
};
```

`src/pages/Register.tsx:72` (código anterior):

```ts
const copySecretKey = () => {
  navigator.clipboard.writeText(secretKey);
  setCopiedSec(true);
  setTimeout(() => setCopiedSec(false), 2000);
};
```

Sin `FLAG_SECURE` en ninguna parte de la app:

```
$ grep -rn "FLAG_SECURE" android/app/src/main/java/
  → 0 resultados
```

## 3. Impacto

**Previsualización en pantalla.** En Android 13 y superiores el sistema muestra
un recuadro flotante con el contenido recién copiado. Al no poder marcarse como
sensible, la llave quedaba visible para cualquiera que mirase el teléfono y para
cualquier grabación de pantalla en curso.

**Persistencia indefinida.** El contenido permanece en el portapapeles hasta que
se copie otra cosa. Cualquier app con permisos de accesibilidad, o un pegado
accidental en la app equivocada, bastaba para comprometer la cuenta.

**Mitigación delegada al usuario.** El propio mensaje pedía "Limpia tu
portapapeles después de guardarla", lo que confirma que no había limpieza
programática y traslada al usuario una tarea que la mayoría no sabe realizar.

**Agravante.** Combinado con SEC-32, en un build `debuggable` el portapapeles y
la memoria del proceso eran además legibles vía `adb` desde un equipo conectado.

## 4. Defecto adicional encontrado durante la remediación

`finishOnboarding` en `Register.tsx` llamaba a `setBackupConfirmed()` de forma
**incondicional**, al pulsar "Continuar y explorar". Una cuenta cuyo usuario
nunca respaldó la llave quedaba registrada como respaldada, lo que desactivaba
el modal bloqueante que debe aparecer antes de la primera operación con fondos.

El usuario perdía así las dos redes de protección a la vez: no tenía copia de la
llave y la app había dejado de avisarle.

## 5. Remediación

**Plugin nativo `SecureScreen`**
(`android/app/src/main/java/com/micopay/app/SecureScreenPlugin.java`). Aplica y
retira `WindowManager.LayoutParams.FLAG_SECURE` bajo demanda, lo que bloquea
capturas, grabación de pantalla y la miniatura del conmutador de apps.

Se activa solo mientras la llave está visible, no de forma global: dejarlo
permanente impediría a la gente del piloto mandar capturas a soporte, que es como
se reporta la mayoría de los fallos.

**Componente `SecretKeyBackupModal`**
(`src/components/SecretKeyBackupModal.tsx`). Revela la llave en pantalla con
`FLAG_SECURE` activo y **sin pasar por el portapapeles en ningún momento**.
Retira el flag al desmontar mediante `useEffect`, de modo que se libera aunque el
usuario cancele, navegue atrás o el componente caiga por una excepción.

**Verificación de transcripción.** En el alta, el usuario debe escribir los
últimos 4 caracteres de la llave antes de que se marque como respaldada. Sin
esto, "respaldada" solo significaba que se pulsó un botón.

**Respaldo condicional.** `setBackupConfirmed()` solo se invoca si la
transcripción fue correcta. Quien continúa sin respaldar recibe un aviso
explícito y conserva el modal bloqueante previo a su primera operación.

**Diálogos nativos sustituidos.** `window.confirm` y `alert` se reemplazaron por
componentes de la app. Los diálogos del WebView se perciben como un error del
navegador y restan credibilidad justo en la pantalla donde más importa.

### Verificación

```
$ grep -rn "clipboard.writeText(secret" src/
  → 0 resultados

$ grep -rn "alert(\|window.confirm(" src/pages/Profile.tsx src/pages/Register.tsx
  → 0 resultados
```

Las llamadas a `clipboard.writeText` que permanecen son sobre datos públicos:
dirección Stellar pública, CLABE de depósito y texto de recibo.

## 6. Pendiente de verificación en dispositivo

La eficacia de `FLAG_SECURE` **no se ha comprobado en hardware real**: no había
dispositivo ni emulador disponible durante la remediación. Antes de dar el
hallazgo por cerrado hay que confirmar en un teléfono que:

- la captura de pantalla en la vista de respaldo produce un frame negro;
- la miniatura del conmutador de apps no muestra la llave;
- el flag se retira correctamente al salir, y las capturas vuelven a funcionar
  en el resto de la app.

## 7. Referencias

- `docs/AUDITORIA_APK_2026-08-24.md` § ISSUE-03
- `docs/PLAN_REMEDIACION_APK_2026-08-24.md` — Fase 3, tareas T-12 a T-14
- SEC-05 — almacenamiento del keypair (`localStorage` solo en la ruta web; en nativo va a Android Keystore)
