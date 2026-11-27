import { Noir } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';

const $t = document.getElementById('t');
const $out = document.getElementById('out');
const row = (k, v, cls = '') => {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${k}</td><td class="${cls}">${v}</td>`;
  $t.appendChild(tr);
};
const ms = (a) => `${(performance.now() - a).toFixed(0)} ms`;
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

async function run(threads) {
  const t0 = performance.now();
  const [circuit, inputs, vkOnchain] = await Promise.all([
    fetch('/circuit.json').then((r) => r.json()),
    fetch('/inputs.json').then((r) => r.json()),
    fetch('/vk_onchain.hex').then((r) => r.text()),
  ]);

  let a = performance.now();
  const noir = new Noir(circuit);
  const { witness } = await noir.execute(inputs);
  row('1. Witness (noir_js)', ms(a));

  a = performance.now();
  const backend = new UltraHonkBackend(circuit.bytecode, { threads });
  const vk = await backend.getVerificationKey({ keccak: true });
  const same = hex(vk) === vkOnchain.trim();
  row('2. Init backend + VK', ms(a));
  row('   VK = la del contrato en testnet', same ? 'sí' : 'NO', same ? 'ok' : 'bad');

  a = performance.now();
  const proof = await backend.generateProof(witness, { keccak: true });
  const tProve = performance.now() - a;
  row('3. <b>Generar prueba</b>', `<b>${tProve.toFixed(0)} ms</b>`);

  a = performance.now();
  const ok = await backend.verifyProof(proof, { keccak: true });
  row('4. Verificar local', ms(a));
  row('   Prueba válida', ok ? 'sí' : 'NO', ok ? 'ok' : 'bad');

  row('Total', ms(t0));
  await backend.destroy?.();

  const mem = performance.memory ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)} MB heap JS` : 'n/d';
  const info = {
    threads_pedidos: threads,
    hilos_disponibles: navigator.hardwareConcurrency,
    crossOriginIsolated: self.crossOriginIsolated,
    memoria_dispositivo_GB: navigator.deviceMemory ?? 'n/d',
    heap: mem,
    proof_bytes: proof.proof.length,
    public_inputs: proof.publicInputs.length,
    ua: navigator.userAgent,
  };
  $out.textContent = JSON.stringify(info, null, 1);
  window.__bench = { tProve, ok, same, ...info };
  return window.__bench;
}

const go = document.getElementById('go');
go.onclick = async () => {
  go.disabled = true;
  $t.innerHTML = '';
  $out.textContent = 'trabajando… (la primera vez descarga ~2 MB de parámetros)';
  // Sin aislamiento de origen el navegador no permite hilos -> 1 hilo (peor caso).
  const forced = Number(new URLSearchParams(location.search).get('threads'));
  const threads = forced || (self.crossOriginIsolated ? Math.min(navigator.hardwareConcurrency || 1, 8) : 1);
  try {
    await run(threads);
  } catch (e) {
    $out.textContent = 'ERROR: ' + (e?.stack || e);
    window.__bench = { error: String(e) };
  }
  go.disabled = false;
};
