// Genera las 8 cuentas demo (deterministas, SOLO DEMO, sin fondos) y sus agent_id.
// agent_id = sha256(G-address en texto) con el primer byte en 0 (cabe en el campo BN254).
// context  = sha256("trade:<id>") con el primer byte en 0.
// Uso (desde micopay/circuits/agent_tier_v1): node scripts/gen_ids.mjs <ruta a @stellar/stellar-base>
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
const tradeId = 'trade:demo-0001';
const context = toField(sha(tradeId));

writeFileSync(new URL('../src/demo_ids.nr', import.meta.url),
  `// GENERADO por scripts/gen_ids.mjs -- no editar a mano.\n` +
  agents.map((a, i) => `// ${i} ${a.name} ${a.address}`).join('\n') + '\n' +
  `pub global IDS: [Field; 8] = [\n${agents.map(a => `    ${a.agent_id},`).join('\n')}\n];\n` +
  `// ${tradeId}\npub global CONTEXT: Field = ${context};\n`);
writeFileSync(new URL('../demo/agents.json', import.meta.url),
  JSON.stringify({ agents, trade_id: tradeId, context }, null, 2));
console.log(JSON.stringify({ agents, context }, null, 2));
