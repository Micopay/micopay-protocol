# Bench: generar la prueba ZK en el teléfono

Página que genera en el dispositivo la prueba "Lupe es Plata" con `@noir-lang/noir_js` 1.0.0-beta.9 + `@aztec/bb.js` 0.87.0 (las versiones del prototipo) y mide cada paso. Comprueba además que la VK es **la misma del contrato v2 en testnet** (`CAAZZOYORT5NP6YMTY2PFGWXJ7MJHTF43YU7OYTQ2T7LTALNTUQ2UKR5`). La app MicoPay es Capacitor (WebView), así que el navegador del teléfono es un buen proxy.

Arranque: `npm install && npm run dev` (vite en `0.0.0.0:5179`, con COOP/COEP). `public/` se regenera con `scripts/build_proof.sh`.

- PC / mismo equipo: `http://localhost:5179/` (multihilo) · `?threads=1` fuerza un hilo.
- Teléfono en la misma red: `http://<IP-de-la-PC>:5179/`. Por http en LAN el navegador **no** permite hilos → mide 1 hilo (peor caso).

## Resultados

| Dispositivo | Hilos | Witness | Init + VK | **Prueba** | Verificar | Total |
|---|---|---|---|---|---|---|
| PC (16 hilos, Chrome 156) | 8 | 71 ms | 1,268 ms | **653 ms** | 299 ms | 2.3 s |
| PC | 1 | 33 ms | 1,245 ms | **2,605 ms** | 996 ms | 4.9 s |
| OPPO Reno6 Lite (Snapdragon 680, 8 núcleos, Chrome 158, por Wi-Fi) | 1 | 2,215 ms | 15,097 ms | **15,465 ms** | 5,463 ms | 38.4 s |

"Init + VK" incluye descargar ~2 MB de parámetros (CRS) y compilar el WASM la primera vez; en la app se cachearían. "Verificar local" no hace falta en la app (verifica el contrato).

**Lectura (26 nov):**
- Lo que de verdad necesita la app es witness + init + prueba: **~33 s la primera vez** y, con la CRS en caché, del orden de **~20 s**. Con 1 hilo es el peor caso; el teléfono tiene 8 núcleos, y con hilos (HTTPS o app bien configurada) la prueba debería bajar varias veces. Eso no está medido.
- Para un trade en vivo, 20–30 s es demasiado. **Propuesta de diseño:** que la prueba no dependa del trade, sino de la época de la raíz (`context = epoch`). La app del agente la genera una vez cuando MicoPay publica raíz nueva (de noche o en segundo plano), y en el trade solo se consulta el evento `TierProven` ya registrado. Así el tiempo en el teléfono deja de importar para el usuario. Cambia el contrato (nullifier por época en vez de por trade) y hay que discutirlo con el team.
