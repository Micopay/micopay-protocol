#!/usr/bin/env bash
# Corre DENTRO del contenedor micopay-zk-toolchain (nargo 1.0.0-beta.9 + bb 0.87.0),
# con micopay/ montado en /work. Ver scripts/demo.sh.
# Lupe (agente demo 0, 37 ops / 97 %) prueba tier Plata (>= 10 ops, min_rate 0) para trade:demo-0001.
set -euo pipefail
cd /work/circuits/agent_tier_v1

out=$(nargo test print_demo --show-output 2>&1)
root=$(grep -oP '^ROOT \K\S+' <<<"$out")
nul=$(grep -oP '^NULLIFIER \K\S+' <<<"$out")
paths=$(grep -oP '^PATH \K\S+' <<<"$out" | sed 's/.*/"&"/' | paste -sd, -)
bits=$(grep -oP '^PATH \S+ \K\S+' <<<"$out" | paste -sd, -)
id0=$(grep -oP '^\s+\K0x[0-9a-f]+(?=,)' src/demo_ids.nr | head -1)
ctx=$(grep -oP 'CONTEXT: Field = \K0x[0-9a-f]+' src/demo_ids.nr)

cat > Prover.toml <<EOF
secret = "0x1a2b3c4d5e6f7081"
trades = 37
rate = 97
path_elements = [$paths]
path_index = [$bits]
merkle_root = "$root"
agent_id = "$id0"
min_trades = 10
min_rate = 0
context = "$ctx"
nullifier = "$nul"
EOF

nargo compile
nargo execute
J=target/agent_tier_v1.json; W=target/agent_tier_v1.gz
time bb prove --scheme ultra_honk --oracle_hash keccak -b $J -w $W -o target --output_format bytes_and_fields
bb write_vk --scheme ultra_honk --oracle_hash keccak -b $J -o target --output_format bytes_and_fields
bb verify --scheme ultra_honk --oracle_hash keccak -k target/vk -p target/proof -i target/public_inputs && echo "OFFCHAIN VERIFY OK"

# Fixture para los tests del contrato
F=/work/contracts/agent-tier/fixtures
mkdir -p $F
cp target/proof target/vk target/public_inputs $F/
# Insumos del bench de navegador
cp $J bench/public/circuit.json
od -An -v -tx1 target/vk | tr -d ' \n' > bench/public/vk_onchain.hex
ls -l $F
