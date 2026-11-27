extern crate std;
use super::*;
use crate::{BRONCE, ORO, PLATA};
use soroban_sdk::{
    testutils::{storage::Instance as _, Address as _, Events as _, Ledger, MockAuth, MockAuthInvoke},
    Address, Bytes, BytesN, Env, IntoVal, String,
};

// Fixture generada por scripts/build_proof.sh: Lupe (37 ops / 97 %) prueba
// "soy Plata" (>= 10 ops) en la epoca 1 (labs R3).
const PROOF: &[u8] = include_bytes!("../fixtures/proof");
const VK: &[u8] = include_bytes!("../fixtures/vk");
const PI: &[u8] = include_bytes!("../fixtures/public_inputs");

const LUPE: &str = "GA7MACXRD66TDWQB32NUTAZ3NJQLTKM7NFFGRPTDHECSHNW253SBPYLS";
const BETO: &str = "GCRKH2PJIXV7BF4RMYQG4UXHRP3Y77L3GZBCJPMVPM6NKAJ6KQ4EALPC";

fn field(i: usize) -> [u8; 32] {
    PI[i * 32..(i + 1) * 32].try_into().unwrap()
}

struct Ctx {
    env: Env,
    client: AgentTierRegistryClient<'static>,
    lupe: Address,
    root: BytesN<32>,
    nullifier: BytesN<32>,
    proof: Bytes,
}

fn setup(publish: bool) -> Ctx {
    let env = Env::default();
    env.ledger().set_protocol_version(26);
    env.cost_estimate().budget().reset_unlimited();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(AgentTierRegistry, (admin, Bytes::from_slice(&env, VK)));
    let client = AgentTierRegistryClient::new(&env, &id);
    let root = BytesN::from_array(&env, &field(0));
    if publish {
        client.publish_root(&root);
    }
    Ctx {
        lupe: Address::from_str(&env, LUPE),
        nullifier: BytesN::from_array(&env, &field(5)),
        proof: Bytes::from_slice(&env, PROOF),
        root,
        client,
        env,
    }
}

#[test]
fn ids_coinciden_con_los_del_circuito() {
    let c = setup(false);
    // agent_id derivado on-chain de la Address == el que uso el prover.
    assert_eq!(c.client.agent_id(&c.lupe).to_array(), field(1));
    // labs (R3): el contexto es la epoca 1, el mismo que uso el prover.
    assert_eq!(c.client.context_for(&1).to_array(), field(4));
    // Umbrales de Plata (min_trades=10, min_rate=0) en los inputs publicos.
    assert_eq!(field(2)[31], 10);
    assert_eq!(field(3)[31], 0);
}

#[test]
fn lupe_prueba_plata_sin_revelar_numeros() {
    let c = setup(true);
    c.env.cost_estimate().budget().reset_default();
    c.env.cost_estimate().budget().reset_unlimited();
    c.client.prove_tier(&c.lupe, &PLATA, &c.nullifier, &c.proof);
    let cpu = c.env.cost_estimate().budget().cpu_instruction_cost();
    let mem = c.env.cost_estimate().budget().memory_bytes_cost();
    std::println!("prove_tier CPU instructions: {cpu}  memoria: {mem} bytes");
    assert!(c.client.is_used(&c.nullifier));
    std::println!("eventos: {:?}", c.env.events().all());
}

#[test]
fn replay_en_el_mismo_trade_se_rechaza() {
    let c = setup(true);
    c.client.prove_tier(&c.lupe, &PLATA, &c.nullifier, &c.proof);
    let r = c.client.try_prove_tier(&c.lupe, &PLATA, &c.nullifier, &c.proof);
    assert_eq!(r, Err(Ok(Error::NullifierAlreadyUsed)));
}

#[test]
fn la_prueba_no_se_presta_a_otra_cuenta() {
    let c = setup(true);
    let beto = Address::from_str(&c.env, BETO);
    let r = c.client.try_prove_tier(&beto, &PLATA, &c.nullifier, &c.proof);
    assert_eq!(r, Err(Ok(Error::VerificationFailed)));
}

#[test]
fn no_puede_presumir_oro_con_prueba_de_plata() {
    let c = setup(true);
    let r = c.client.try_prove_tier(&c.lupe, &ORO, &c.nullifier, &c.proof);
    assert_eq!(r, Err(Ok(Error::VerificationFailed)));
}

#[test]
fn no_sirve_en_otra_epoca_aunque_la_raiz_sea_igual() {
    // labs (R3): MicoPay vuelve a publicar la misma raiz como epoca 2. La prueba se
    // hizo para la epoca 1, asi que ya no pasa: cada epoca pide una prueba nueva.
    let c = setup(true);
    c.client.publish_root(&c.root);
    assert_eq!(c.client.root(), (c.root.clone(), 2));
    let r = c.client.try_prove_tier(&c.lupe, &PLATA, &c.nullifier, &c.proof);
    assert_eq!(r, Err(Ok(Error::VerificationFailed)));
    assert_eq!(c.client.tier_record(&c.lupe), None);
}

#[test]
fn raiz_nueva_invalida_pruebas_viejas() {
    // MicoPay publica nuevas estadisticas (p. ej. Lupe tuvo una disputa):
    // la prueba hecha contra la raiz anterior ya no pasa.
    let c = setup(true);
    let mut otra = field(0);
    otra[31] ^= 1;
    c.client.publish_root(&BytesN::from_array(&c.env, &otra));
    let r = c.client.try_prove_tier(&c.lupe, &PLATA, &c.nullifier, &c.proof);
    assert_eq!(r, Err(Ok(Error::VerificationFailed)));
    assert_eq!(c.client.root().1, 2);
}

#[test]
fn prueba_alterada_falla() {
    let c = setup(true);
    // Byte bajo de cada palabra de 32 (bits reales). Ojo: los bytes altos de las
    // palabras-limb de los puntos G1 son relleno que el verificador ignora
    // (ver sondeo_maleabilidad) => nunca usar hash(proof) como id unico; el
    // anti-replay es el nullifier.
    for word in [0usize, 16, 31, 100, 200, 312, 400, 455] {
        let mut p = std::vec::Vec::from(PROOF);
        p[word * 32 + 31] ^= 0x01;
        let r = c.client.try_prove_tier(&c.lupe, &PLATA, &c.nullifier, &Bytes::from_slice(&c.env, &p));
        assert!(r.is_err(), "palabra {word} alterada paso");
    }
    assert!(!c.client.is_used(&c.nullifier));
}

/// Barrido: que bytes de la prueba se pueden alterar sin que falle.
/// cargo test sondeo_maleabilidad -- --ignored --nocapture
#[test]
#[ignore]
fn sondeo_maleabilidad() {
    let c = setup(true);
    let mut aceptados = std::vec::Vec::new();
    for word in 0..(PROOF.len() / 32) {
        for off in [0usize, 8, 14, 15, 16, 31] {
            let i = word * 32 + off;
            let mut p = std::vec::Vec::from(PROOF);
            p[i] ^= 0x01;
            let r = c.client.try_prove_tier(&c.lupe, &PLATA, &c.nullifier, &Bytes::from_slice(&c.env, &p));
            if r.is_ok() {
                aceptados.push((word, off));
                // deshacer la quema para seguir probando
                c.env.as_contract(&c.client.address, || {
                    c.env.storage().persistent().remove(&Key::Nullifier(c.nullifier.clone()));
                });
            }
        }
    }
    std::println!("aceptados (palabra, offset): {:?}", aceptados);
    std::println!("total aceptados: {}", aceptados.len());
}

#[test]
fn sin_raiz_publicada_no_verifica() {
    let c = setup(false);
    let r = c.client.try_prove_tier(&c.lupe, &PLATA, &c.nullifier, &c.proof);
    assert_eq!(r, Err(Ok(Error::RootNotPublished)));
    let _ = c.root;
}

#[test]
fn solo_existen_tiers_fijos() {
    // No hay forma de pedir un umbral arbitrario (">= 30", ">= 35"...): la API solo
    // recibe el tier y cualquier valor fuera de 1..=3 se rechaza => no hay busqueda
    // binaria del numero exacto.
    let c = setup(true);
    for bad in [0u32, 4, 30, 37, u32::MAX] {
        let r = c.client.try_prove_tier(&c.lupe, &bad, &c.nullifier, &c.proof);
        assert_eq!(r, Err(Ok(Error::InvalidTier)), "tier {bad}");
    }
    assert_eq!(c.client.thresholds(&BRONCE), (1, 0));
    assert_eq!(c.client.thresholds(&PLATA), (10, 0));
    assert_eq!(c.client.thresholds(&ORO), (50, 0));
}

#[test]
fn lupe_no_puede_probar_un_tier_mas_bajo_con_la_prueba_de_plata() {
    // La prueba esta hecha para los umbrales de Plata; con Bronce los inputs
    // publicos cambian y no verifica (cada tier es una prueba distinta).
    let c = setup(true);
    let r = c.client.try_prove_tier(&c.lupe, &BRONCE, &c.nullifier, &c.proof);
    assert_eq!(r, Err(Ok(Error::VerificationFailed)));
}

#[test]
fn constructor_rechaza_vk_invalida() {
    let res = std::panic::catch_unwind(|| {
        let env = Env::default();
        env.ledger().set_protocol_version(26);
        let admin = Address::generate(&env);
        env.register(AgentTierRegistry, (admin, Bytes::from_slice(&env, &VK[..100])));
    });
    assert!(res.is_err());
}

#[test]
#[should_panic]
fn publish_root_exige_admin() {
    let env = Env::default();
    env.ledger().set_protocol_version(26);
    let admin = Address::generate(&env);
    let id = env.register(AgentTierRegistry, (admin, Bytes::from_slice(&env, VK)));
    let client = AgentTierRegistryClient::new(&env, &id);
    // sin mock_all_auths: la firma del admin falta
    client.publish_root(&BytesN::from_array(&env, &[0u8; 32]));
}

// ---- labs (R2): raiz por epoca ----

fn root_n(env: &Env, n: u8) -> BytesN<32> {
    let mut r = [0u8; 32];
    r[31] = n;
    BytesN::from_array(env, &r)
}

#[test]
fn epocas_en_orden_con_fecha_y_sin_reescribir() {
    let c = setup(false);
    c.env.ledger().with_mut(|l| {
        l.timestamp = 1_000;
        l.sequence_number = 50;
    });
    assert_eq!(c.client.publish_root(&root_n(&c.env, 1)), 1);
    c.env.ledger().with_mut(|l| {
        l.timestamp = 87_400;
        l.sequence_number = 17_330;
    });
    assert_eq!(c.client.publish_root(&root_n(&c.env, 2)), 2);
    assert_eq!(c.client.publish_root(&root_n(&c.env, 3)), 3);

    // Publicar la 2 y la 3 no toco la 1: queda con su raiz y su fecha.
    let uno = c.client.root_at(&1);
    assert_eq!(uno.root, root_n(&c.env, 1));
    assert_eq!(uno.published_at, 1_000);
    assert_eq!(uno.ledger, 50);
    let dos = c.client.root_at(&2);
    assert_eq!(dos.root, root_n(&c.env, 2));
    assert_eq!(dos.published_at, 87_400);
    // La vigente es la ultima.
    assert_eq!(c.client.root(), (root_n(&c.env, 3), 3));
    assert_eq!(c.client.try_root_at(&4), Err(Ok(Error::RootNotPublished)));
    assert_eq!(c.client.try_root_at(&0), Err(Ok(Error::RootNotPublished)));
}

#[test]
fn solo_el_admin_publica_con_firmas_reales() {
    let env = Env::default();
    env.ledger().set_protocol_version(26);
    let admin = Address::generate(&env);
    let otro = Address::generate(&env);
    let id = env.register(AgentTierRegistry, (admin.clone(), Bytes::from_slice(&env, VK)));
    let client = AgentTierRegistryClient::new(&env, &id);
    let root = root_n(&env, 9);
    let invoke = MockAuthInvoke {
        contract: &id,
        fn_name: "publish_root",
        args: (root.clone(),).into_val(&env),
        sub_invokes: &[],
    };

    env.mock_auths(&[MockAuth { address: &otro, invoke: &invoke }]);
    assert!(client.try_publish_root(&root).is_err());
    assert_eq!(client.try_root(), Err(Ok(Error::RootNotPublished)));

    env.mock_auths(&[MockAuth { address: &admin, invoke: &invoke }]);
    assert_eq!(client.publish_root(&root), 1);
}

#[test]
fn publicar_y_probar_extienden_la_vida_del_contrato() {
    let c = setup(false);
    let ttl = || {
        c.env
            .as_contract(&c.client.address, || c.env.storage().instance().get_ttl())
    };
    c.client.publish_root(&c.root);
    assert_eq!(ttl(), INSTANCE_TTL_EXTEND);

    // Pasan ~29 dias sin uso: una prueba vuelve a extenderla.
    c.env.ledger().with_mut(|l| l.sequence_number += INSTANCE_TTL_EXTEND - 100);
    assert!(ttl() < INSTANCE_TTL_MIN);
    c.client.prove_tier(&c.lupe, &PLATA, &c.nullifier, &c.proof);
    assert_eq!(ttl(), INSTANCE_TTL_EXTEND);
}

// ---- labs (R3): prueba por epoca y tier guardado ----

#[test]
fn el_tier_queda_guardado_con_su_epoca() {
    let c = setup(true);
    assert_eq!(c.client.tier_record(&c.lupe), None);
    c.client.prove_tier(&c.lupe, &PLATA, &c.nullifier, &c.proof);
    assert_eq!(c.client.tier_record(&c.lupe), Some(TierRecord { tier: PLATA, epoch: 1 }));

    // Una epoca nueva no borra el registro: tier_record lo sigue mostrando con su
    // epoca (get_tier, R4, es la consulta que lo da por vencido).
    c.client.publish_root(&root_n(&c.env, 7));
    assert_eq!(c.client.tier_record(&c.lupe), Some(TierRecord { tier: PLATA, epoch: 1 }));
}

#[test]
fn una_prueba_fallida_no_guarda_tier() {
    let c = setup(true);
    let beto = Address::from_str(&c.env, BETO);
    assert!(c.client.try_prove_tier(&beto, &PLATA, &c.nullifier, &c.proof).is_err());
    assert!(c.client.try_prove_tier(&c.lupe, &ORO, &c.nullifier, &c.proof).is_err());
    assert_eq!(c.client.tier_record(&beto), None);
    assert_eq!(c.client.tier_record(&c.lupe), None);
}

#[allow(dead_code)]
fn _unused(_s: String) {}
