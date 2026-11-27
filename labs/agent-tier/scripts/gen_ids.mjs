// Genera las 8 cuentas demo (deterministas, SOLO DEMO, sin fondos) y sus agent_id.
// agent_id = sha256(G-address en texto) con el primer byte en 0 (cabe en el campo BN254).
// context  = numero de epoca de la raiz, como campo (labs R3). La demo usa la epoca 1.
// Uso (desde labs/agent-tier): node scripts/gen_ids.mjs <ruta a @stellar/stellar-base>
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { Keypair } = require(process.argv[2]);

const toField = (buf) => { const b = Buffer.from(buf); b[0] = 0; return '0x' + b.toString('hex'); };
const sha = (s) => createHash('sha256').update(s).digest();

const names = ['Lupe', 'Beto', 'Carmen', 'Dani', 'Elena', 'Fer', 'Gabo', 'Hilda'];
const agents = names.map((name, i) => {
  const kp = Keypair.fromRawEd25519Seed(sha(`micopay-zk-demo-agent-${i}`));
  return { name, address: kp.publicKey(), agent_id: toField(sha(kp.publicKey())) };
});
const epoch = 1;
const context = '0x' + epoch.toString(16).padStart(64, '0');

writeFileSync(new URL('../circuit/src/demo_ids.nr', import.meta.url),
  `// GENERADO por scripts/gen_ids.mjs -- no editar a mano.\n` +
  agents.map((a, i) => `// ${i} ${a.name} ${a.address}`).join('\n') + '\n' +
  `pub global IDS: [Field; 8] = [\n${agents.map(a => `    ${a.agent_id},`).join('\n')}\n];\n` +
  `// epoca ${epoch} (labs R3: la prueba se amarra a la epoca de la raiz, no al trade)\npub global CONTEXT: Field = ${context};\n`);
writeFileSync(new URL('../circuit/demo/agents.json', import.meta.url),
  JSON.stringify({ agents, epoch, context }, null, 2));
console.log(JSON.stringify({ agents, context }, null, 2));
