# ZKaaS Toolchain Reference

## Version Pins

| Tool | Version | Source |
|---|---|---|
| nargo | 1.0.0-beta.9 | `noirup -v 1.0.0-beta.9` |
| bb (barretenberg) | 0.87.0 | `bbup -v 0.87.0` |
| soroban-sdk | 26.0.1 | crates.io (actual — spec assumed 22.0.0) |
| stellar-cli | 25.2.0 | already installed on host |
| Rust | stable | rust-toolchain.toml |
| Node | 22.14.0 | already installed on host |

> If actual installed versions differ from the pins above, reality wins. Document the discrepancy here and update the circuits/contract accordingly.

---

## WSL2 Workflow

Circuits live in the Windows repo. Compile them from WSL2 — do NOT duplicate the file tree.

```
# From WSL2 Ubuntu-24.04:
cd /mnt/c/Users/eric/Desktop/HACKATON

# Compile a circuit
cd circuits/poseidon_preimage
nargo compile

# Generate witness (replaces deprecated nargo prove --input)
nargo execute witness

# Generate UltraHonk proof + VK (MUST use --output_format bytes_and_fields for correct G1 point encoding)
bb prove --scheme ultra_honk --oracle_hash keccak -b target/poseidon_preimage.json -w target/witness.gz --output_path ~/zkwork --output_format bytes_and_fields
# VK (always generate in Linux FS due to NTFS permission issues; copy result back)
bb write_vk --scheme ultra_honk --oracle_hash keccak -b target/poseidon_preimage.json --output_path ~/zkwork --output_format bytes_and_fields
cp ~/zkwork/vk /mnt/c/Users/eric/Desktop/HACKATON/circuits/poseidon_preimage/target/vk/vk

# Run nargo tests
nargo test
```

---

## Phase 0 Installation (WSL2 Ubuntu-24.04)

```bash
# 1. Install Rust (required for bb)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# 2. Install noirup + nargo 1.0.0-beta.9
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
source "$HOME/.bashrc"
noirup --version 1.0.0-beta.9

# Verify
nargo --version  # must print: nargo version = 1.0.0-beta.9

# 3. Install bbup + bb 0.87.0
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/bbup/install | bash
source "$HOME/.bashrc"
bbup --version 0.87.0

# Verify
bb --version  # must print: 0.87.0

# 4. Install stellar-cli (optional — already installed on host; use host binary if needed)
cargo install --locked stellar-cli --version 25.2.0
```

---

## Phase 0 Exit Criterion (COMPLETED)

Run `run_testnet_e2e.sh` from `rs-soroban-ultrahonk`. Actual commands used:

```bash
# WSL2
git clone https://github.com/yugocabrio/rs-soroban-ultrahonk ~/rs-soroban-ultrahonk
cd ~/rs-soroban-ultrahonk

# stellar-cli not available in WSL2 (cargo build fails)
# Workaround: symlink Windows binary
sudo ln -s "/mnt/c/Program Files (x86)/Stellar CLI/stellar.exe" /usr/local/bin/stellar

# Build WASM contract (uses wasm32v1-none, not wasm32-unknown-unknown)
SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2=1 \
  cargo rustc --manifest-path=contracts/rs-soroban-ultrahonk/Cargo.toml \
  --crate-type=cdylib --target=wasm32v1-none --release

# Deploy and invoke are handled by run_testnet_e2e.sh
```

**ULTRAHONK_EXAMPLE_CONTRACT_ID (rs-soroban-ultrahonk tornado_classic):**
```
CCGVDISESZOPZQZTB367A6GFPW7ZOW7CMJVKU636JZSSIX6PORBA4MEZ
```

---

## Architecture Correction (Critical)

**The README originally stated `soroban_sdk::host::verify_ultrahonk(...)` as a host function. This does NOT exist in soroban-sdk.**

### Reality

UltraHonk on-chain verification uses the **`ultrahonk_soroban_verifier` crate** from [rs-soroban-ultrahonk](https://github.com/yugocabrio/rs-soroban-ultrahonk).

The crate uses these **real** Soroban host functions (Protocol 25 / CAP-0074):

| Host function | Purpose |
|---|---|
| `env.crypto().bn254_g1_msm(...)` | BN254 multi-scalar multiplication |
| `env.crypto().bn254_g1_add(...)` | BN254 G1 point addition |
| `env.crypto().bn254_pairing(...)` | BN254 pairing check |
| `env.crypto().keccak256(...)` | Keccak-256 hash (transcript) |

The crate compiles to WASM and runs inside Soroban. Callers invoke `verify(env, proof, public_inputs, vk)` (exact API TBC after Phase 0 inspection of the crate source).

### Poseidon

Poseidon is used **off-chain** in Noir circuits only. There is no Poseidon host function in soroban-sdk 22. The `bn254::hash_1` / `bn254::hash_2` functions in Noir's standard library are BN254 Poseidon.

---

## Circuit Compilation Commands

```bash
# poseidon_preimage (Phase 1)
cd /mnt/c/Users/eric/Desktop/HACKATON/circuits/poseidon_preimage
nargo compile
echo "1234567890" > Prover.toml  # replace with real secret
nargo execute witness
bb prove -b target/poseidon_preimage.json -w target/witness.gz -o target/proof
bb write_vk -b target/poseidon_preimage.json -o target/vk

# Encode for API call:
# proof: base64(target/proof/proof)
# vk:   base64(target/vk/vk)
```

---

## Environment Variables (ZKaaS)

```env
# Soroban
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
ZK_VERIFIER_CONTRACT_ID=<deployed contract ID>
ADMIN_SECRET_KEY=<Stellar secret key for admin ops>

# x402 mock mode (dev only — NEVER in production)
X402_MOCK_MODE=true
```

---

## Known Version Incompatibilities / Toolchain Reality

- **nargo >= 1.0.0-beta.1**: `nargo prove` no longer exists. Use `nargo execute <witness_name>` + `bb prove`.
- **soroban-sdk 26.0.1**: rs-soroban-ultrahonk uses 26.0.1 (not 22.x as the spec assumed).
- **Mixed sdk versions in workspace**: zk-verifier uses its own `[dependencies]` (not workspace-inherited). Other contracts remain on 21.7.6.
- **wasm32v1-none target**: rs-soroban-ultrahonk uses `wasm32v1-none`, NOT `wasm32-unknown-unknown`. Run: `rustup target add wasm32v1-none`.
- **std::hash::poseidon::bn254 NOT EXPORTED** in nargo 1.0.0-beta.9: The `poseidon` module is private. Circuits use `std::hash::pedersen_hash` instead (BN254-native).
- **bb needs jq**: `bb prove` and `bb write_vk` invoke `jq` externally. Install: `sudo apt-get install -y jq`.
- **bb and NTFS**: Proof generation fails from `/mnt/c/...`. Copy artifacts to Linux FS first, then run bb, then copy back.
- **bb write_vk — MUST use `--output_format bytes_and_fields`**: Without this flag, G1 points in the VK are written in a different byte encoding that exceeds the BN254 prime (values > p). The `ultrahonk_soroban_verifier` crate's `Bn254G1Affine::from_array` requires standard-form Fp elements (< p). With `bytes_and_fields`, bb writes points in the correct format; without it, the format is wrong and `Error(Crypto, InvalidInput)` occurs at verification time.
- **bb write_vk output path**: `--output_path <dir>` creates `<dir>/vk` (flat file, 1760 bytes) when `--output_format bytes_and_fields` is used. The older behavior of creating `<dir>/vk/vk` (directory + file, 1764 bytes with 4-byte trailer) only occurs without the `bytes_and_fields` flag.
- **PROOF_BYTES = 14592**: UltraHonk proofs = 456 x 32 bytes. Confirmed against `PROOF_FIELDS = 456` in ultrahonk_soroban_verifier.
- **Non-ASCII in Noir comments**: nargo 1.0.0-beta.9 rejects non-ASCII in comments. Use ASCII only.
- **bb verify public inputs path**: `bb verify` hardcodes `./target/public_inputs`. Run from the directory that contains `target/public_inputs`.
- **stellar-cli in WSL2**: `cargo install stellar-cli` fails at compile (build-utils errors). Workaround: symlink Windows stellar.exe into WSL2 PATH: `sudo ln -s "/mnt/c/Program Files (x86)/Stellar CLI/stellar.exe" /usr/local/bin/stellar`.
- **UltraHonkVerifier API**: `UltraHonkVerifier::new(&env, &vk_bytes)?` then `verifier.verify(&env, &proof_bytes, &public_inputs)?`. Both take `Bytes`, NOT Vec<BytesN<32>>.

## Phase 0 Results (COMPLETE — 2026-06-12)

- nargo 1.0.0-beta.9: installed at `~/.nargo/bin/nargo` in WSL2
- bb 0.87.0: installed at `~/.bb/bb` in WSL2
- poseidon_preimage circuit: compiled + 2 nargo tests pass + proof 14592 bytes + locally verified
- reputation_v1 circuit: compiled + 4 nargo tests pass
- PROOF_BYTES = 14592 confirmed (matches ultrahonk_soroban_verifier::PROOF_BYTES)
- **On-chain verification: PASSED**

### Testnet Deployment (rs-soroban-ultrahonk tornado_classic circuit)

| Item | Value |
|---|---|
| alice account | `GDQLSQW6CUWP5UDIFYSOUHJ7NA4S4NRC2PXOIWMCU7IWXJOBXEPHQ3G6` |
| Contract ID | `CCGVDISESZOPZQZTB367A6GFPW7ZOW7CMJVKU636JZSSIX6PORBA4MEZ` |
| WASM upload tx | `42b85ed1c0770fe4c7bc26ad01f31986e5843c8c10d81de9f195520783df66c1` |
| Deploy tx | `57acb910a28108e6c85e41a71b710f3d4caacd5ed64c861b42b2d86ec17be29c` |
| **verify_proof tx** | `30eab1f185db57468a000247ca059614f4a9fe7ffe6720e46083a04cbda1ce7a` |
| WASM size | 25106 bytes |
| Proof size | 14592 bytes |
| Public inputs size | 32 bytes |

Explorer: https://stellar.expert/explorer/testnet/tx/30eab1f185db57468a000247ca059614f4a9fe7ffe6720e46083a04cbda1ce7a

**Exit criterion met: UltraHonk proof verified on-chain on Stellar testnet.**

---

## ZkVerifierRegistry Deployment (COMPLETE — 2026-06-12)

| Item | Value |
|---|---|
| Contract ID | `CC6YHSKDTINV4XSZNVT42XW4GPJIANNKNNKG73HYTO2OJ7DPF55A33UG` |
| Admin | `GDQLSQW6CUWP5UDIFYSOUHJ7NA4S4NRC2PXOIWMCU7IWXJOBXEPHQ3G6` (alice) |
| Init tx | `5a20b5cea9af1627b1c593bedfb0749882bc5dd451146996b545a889ebe2df20` |
| Register poseidon_preimage tx | `becd9f03b13748f10ee742879560f57d58e5f0a3e3a0d53d15079f37aa5e203b` |
| Register reputation_v1 tx | `db7cfae4628757dcc467e873345dd31b53d9bed1b554ad8f1ada5645107b36eb` |
| set_reputation_root tx | `ebe63edc1cb45f2aad6b1e7379f7c5706495fe19922d50c1da38ed19435b987b` |
| Demo root | `0x079fa7cd6ecb9dc5b48eedf99357995c04771a815c19072ac63b0f1265868bd5` |

---

## Demo B Result (COMPLETE — 2026-06-12)

Anonymous reputation ZK proof verified on-chain (reputation_v1 circuit).

| Item | Value |
|---|---|
| Circuit | `reputation_v1` |
| Prover | alice (GOLD tier, secret=1001) |
| Proof size | 14592 bytes |
| Claim | tier >= SILVER (threshold=2) |
| On-chain verify tx | `330be3e4eae61901526206d33438e38e5b90a65d16871ef1727d5bc075902974` |
| Explorer | https://stellar.expert/explorer/testnet/tx/330be3e4eae61901526206d33438e38e5b90a65d16871ef1727d5bc075902974 |

**Agent B learns: counterparty tier >= SILVER. Learns NOTHING about identity or exact tier.**
