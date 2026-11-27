// agent_tier_v1 -- reputacion privada de agente MicoPay.
//
// El agente prueba, sin revelar sus numeros exactos:
//   1. Hay una hoja leaf = H(H(secret), agent_id, trades, rate) en el arbol que MicoPay
//      publico on-chain (merkle_root). Es decir: "MicoPay certifico mis estadisticas".
//   2. trades >= min_trades  y  rate >= min_rate   (ej. ">= 10 ops y >= 90 %")
//   3. agent_id es publico: la prueba queda amarrada a SU cuenta Stellar y no se
//      puede prestar a otro agente.
//   4. nullifier = H(secret, context): una prueba por contexto (labs R3: la epoca),
//      no reutilizable.
//
// Lo que NO sale de la prueba: trades exactos, rate exacto, secret, posicion en el arbol.
//
// Lo que SI sale, a proposito: agent_id. Esto NO es una prueba anonima: se sabe QUE
// agente probo su tier (su cuenta Stellar es publica en cada evento y en cada escrow),
// asi que dos pruebas del mismo agente SI se pueden ligar entre si. Lo que se oculta son
// sus numeros, no su identidad. (Que los nullifiers de dos contextos sean distintos
// solo sirve para el anti-replay.)
//
// Los umbrales min_trades/min_rate son genericos en el circuito; el contrato solo acepta
// los de los tiers fijos para que nadie encuentre el numero exacto por busqueda binaria.
//
// Hash: std::hash::pedersen_hash (BN254). El verificador on-chain es agnostico al hash.
// Comentarios solo ASCII (limitacion de nargo).
//
// ORDEN DE INPUTS PUBLICOS (el contrato los arma en este orden; nullifier al final):
//   [merkle_root, agent_id, min_trades, min_rate, context, nullifier]

global TREE_DEPTH: u32 = 16; // 65,536 agentes por arbol

// El agente registra UNA vez commitment = H(secret) desde su app. MicoPay arma la
// hoja con ese commitment + las estadisticas que ya conoce: nunca ve el secret.
pub fn commitment_of(secret: Field) -> Field {
    std::hash::pedersen_hash([secret])
}

pub fn leaf_of(secret: Field, agent_id: Field, trades: u32, rate: u32) -> Field {
    std::hash::pedersen_hash([commitment_of(secret), agent_id, trades as Field, rate as Field])
}

pub fn nullifier_of(secret: Field, context: Field) -> Field {
    std::hash::pedersen_hash([secret, context])
}

pub fn hash_pair(l: Field, r: Field) -> Field {
    std::hash::pedersen_hash([l, r])
}

fn main(
    // ---- privados ----
    secret: Field,                       // lo genera el agente; MicoPay solo ve el leaf
    trades: u32,                         // operaciones completadas (u32 => rango acotado)
    rate: u32,                           // % de cumplimiento 0..100
    path_elements: [Field; TREE_DEPTH],
    path_index: [u1; TREE_DEPTH],
    // ---- publicos (nullifier AL FINAL) ----
    merkle_root: pub Field,
    agent_id: pub Field,
    min_trades: pub u32,
    min_rate: pub u32,
    context: pub Field,
    nullifier: pub Field,
) {
    // 1. Membresia: la hoja certificada por MicoPay esta en el arbol publicado.
    let mut node = leaf_of(secret, agent_id, trades, rate);
    for i in 0..TREE_DEPTH {
        let sibling = path_elements[i];
        let (l, r) = if path_index[i] == 0 { (node, sibling) } else { (sibling, node) };
        node = hash_pair(l, r);
    }
    assert(node == merkle_root, "Merkle proof invalid");

    // 2. Umbrales. trades/rate son u32 tipados: sin truncamiento de Field.
    assert(rate <= 100, "Rate out of range");
    assert(trades >= min_trades, "Trades below threshold");
    assert(rate >= min_rate, "Rate below threshold");

    // 3. Anti-replay por contexto.
    assert(nullifier_of(secret, context) == nullifier, "Nullifier mismatch");
}

// ------------------------------------------------------------------
// Utilidades de demo: arbol de 8 agentes (los datos estan en demo.nr
// como constantes para que nargo test los imprima).
// ------------------------------------------------------------------

fn zeros() -> [Field; TREE_DEPTH] {
    let mut z: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    for k in 1..TREE_DEPTH {
        z[k] = hash_pair(z[k - 1], z[k - 1]);
    }
    z
}

// Arbol con N=8 hojas en las posiciones 0..7, resto vacio (hoja vacia = 0).
// Devuelve (root, path de la hoja `idx`).
fn tree8(leaves: [Field; 8], idx: u32) -> (Field, [Field; TREE_DEPTH], [u1; TREE_DEPTH]) {
    let z = zeros();
    let mut level: [Field; 8] = leaves;
    let mut path: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let mut bits: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    let mut pos = idx;
    let mut width: u32 = 8;
    for d in 0..3 {
        let sib = pos ^ 1;
        path[d] = level[sib];
        bits[d] = (pos & 1) as u1;
        let mut next: [Field; 8] = [0; 8];
        for j in 0..4 {
            if j < width / 2 {
                next[j] = hash_pair(level[2 * j], level[2 * j + 1]);
            }
        }
        level = next;
        pos = pos / 2;
        width = width / 2;
    }
    let mut node = level[0];
    for d in 3..TREE_DEPTH {
        path[d] = z[d];
        bits[d] = 0;
        node = hash_pair(node, z[d]);
    }
    (node, path, bits)
}

// Datos demo (agent_id = sha256(G-address) con primer byte en 0; ver scripts/).
global SECRETS: [Field; 8] = [
    0x1a2b3c4d5e6f7081, 0x2b3c4d5e6f708192, 0x3c4d5e6f708192a3, 0x4d5e6f708192a3b4,
    0x5e6f708192a3b4c5, 0x6f708192a3b4c5d6, 0x708192a3b4c5d6e7, 0x8192a3b4c5d6e7f8,
];
global TRADES: [u32; 8] = [37, 3, 64, 0, 12, 51, 9, 22];
global RATES: [u32; 8] = [97, 100, 92, 0, 85, 99, 100, 95];

fn demo_leaves(ids: [Field; 8]) -> [Field; 8] {
    let mut leaves: [Field; 8] = [0; 8];
    for i in 0..8 {
        leaves[i] = leaf_of(SECRETS[i], ids[i], TRADES[i], RATES[i]);
    }
    leaves
}

mod demo_ids;

// Imprime root + path del agente 0 para armar Prover.toml.
// Run: nargo test print_demo --show-output
#[test]
fn print_demo() {
    let ids = demo_ids::IDS;
    let leaves = demo_leaves(ids);
    let (root, path, bits) = tree8(leaves, 0);
    std::println(f"ROOT {root}");
    for d in 0..TREE_DEPTH {
        let p = path[d];
        let b = bits[d];
        std::println(f"PATH {p} {b}");
    }
    let ctx = demo_ids::CONTEXT;
    let n = nullifier_of(SECRETS[0], ctx);
    std::println(f"NULLIFIER {n}");
}

// ------------------------------------------------------------------
// Tests del circuito
// ------------------------------------------------------------------

fn run(idx: u32, min_trades: u32, min_rate: u32, use_id: Field, ctx: Field, nul: Field) {
    let ids = demo_ids::IDS;
    let leaves = demo_leaves(ids);
    let (root, path, bits) = tree8(leaves, idx);
    main(SECRETS[idx], TRADES[idx], RATES[idx], path, bits, root, use_id, min_trades, min_rate, ctx, nul);
}

#[test]
fn plata_ok_sin_revelar_numeros() {
    // Agente 0: 37 ops / 97 %. Prueba ">= 10 ops y >= 90 %" (Plata).
    let ctx = demo_ids::CONTEXT;
    run(0, 10, 90, demo_ids::IDS[0], ctx, nullifier_of(SECRETS[0], ctx));
}

#[test]
fn oro_ok_otra_posicion_del_arbol() {
    // Agente 2 (posicion 2): 64 ops / 92 %. Prueba Oro (>= 50).
    let ctx = 777;
    run(2, 50, 90, demo_ids::IDS[2], ctx, nullifier_of(SECRETS[2], ctx));
}

#[test(should_fail_with = "Trades below threshold")]
fn no_puede_presumir_oro() {
    // Agente 0 tiene 37: no puede probar >= 50.
    let ctx = demo_ids::CONTEXT;
    run(0, 50, 90, demo_ids::IDS[0], ctx, nullifier_of(SECRETS[0], ctx));
}

#[test(should_fail_with = "Rate below threshold")]
fn cumplimiento_bajo_falla() {
    // Agente 4: 12 ops pero 85 % -> no pasa el filtro de 90 %.
    let ctx = demo_ids::CONTEXT;
    run(4, 10, 90, demo_ids::IDS[4], ctx, nullifier_of(SECRETS[4], ctx));
}

#[test(should_fail_with = "Merkle proof invalid")]
fn no_se_presta_a_otra_cuenta() {
    // Agente 0 intenta usar su prueba con el agent_id del agente 3 (Nuevo).
    let ctx = demo_ids::CONTEXT;
    run(0, 10, 90, demo_ids::IDS[3], ctx, nullifier_of(SECRETS[0], ctx));
}

#[test(should_fail_with = "Nullifier mismatch")]
fn nullifier_falso_falla() {
    run(0, 10, 90, demo_ids::IDS[0], demo_ids::CONTEXT, 12345);
}

#[test(should_fail_with = "Merkle proof invalid")]
fn numeros_inventados_fallan() {
    // El agente 1 (3 ops) dice tener 40: la hoja no coincide con lo certificado.
    let ids = demo_ids::IDS;
    let leaves = demo_leaves(ids);
    let (root, path, bits) = tree8(leaves, 1);
    let ctx = demo_ids::CONTEXT;
    main(SECRETS[1], 40, 100, path, bits, root, ids[1], 10, 90, ctx, nullifier_of(SECRETS[1], ctx));
}

#[test]
fn nullifier_distinto_por_trade() {
    // Anti-replay: cada trade quema su propio nullifier. NO implica anonimato
    // (agent_id es publico).
    let a = nullifier_of(SECRETS[0], 1);
    let b = nullifier_of(SECRETS[0], 2);
    assert(a != b);
}
