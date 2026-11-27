#![no_std]
//! AgentTierRegistry -- reputacion privada de agentes MicoPay (prototipo).
//!
//! MicoPay publica la raiz Merkle de las estadisticas certificadas de sus agentes.
//! Un agente prueba con ZK "soy Plata" (>= 10 operaciones) sin revelar sus numeros
//! exactos. Solo hay tiers fijos (ver BRONCE/PLATA/ORO). El contrato:
//!   * arma los inputs publicos EL MISMO con la raiz guardada on-chain (no acepta
//!     una raiz que mande el cliente);
//!   * deriva el agent_id de la `Address` del agente (la prueba no se presta);
//!   * quema el nullifier por contexto (una prueba por epoca, sin replay);
//!   * labs (R3): el contexto es la epoca de la raiz vigente, no un trade, y el tier
//!     probado queda guardado con su epoca.
//! No mueve fondos: no toca el invariante no custodial del escrow.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Bytes, BytesN,
    Env,
};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, VkLoadError};

/// Tiers fijos = los de micopay/backend/src/services/merchant.service.ts:294
/// (Bronce >= 1, Plata >= 10, Oro >= 50 operaciones completadas). Hoy el backend no
/// exige % de cumplimiento, asi que min_rate = 0; si el team lo quiere, se cambia aqui.
///
/// Solo se aceptan estos umbrales: si el contrato aceptara cualquiera, una contraparte
/// podria pedir ">= 30", ">= 40", ">= 35"... y encontrar el numero exacto por
/// busqueda binaria. Con tiers fijos la prueba nunca revela mas que el tier.
pub const BRONCE: u32 = 1;
pub const PLATA: u32 = 2;
pub const ORO: u32 = 3;

fn tier_thresholds(tier: u32) -> Option<(u32, u32)> {
    match tier {
        BRONCE => Some((1, 0)),
        PLATA => Some((10, 0)),
        ORO => Some((50, 0)),
        _ => None,
    }
}

/// Soroban no permite marcar una entrada como eterna: usar el maximo por llamada
/// (~180 dias en testnet) y documentar que un keeper debe extenderlo.
const NULLIFIER_TTL: u32 = 3_110_400;

/// labs (R2): TTL de la configuracion (admin, VK, raiz vigente). Se extiende en cada
/// `publish_root` y `prove_tier`, para que el contrato no se archive por desuso.
const INSTANCE_TTL_MIN: u32 = 17_280; // ~1 dia
const INSTANCE_TTL_EXTEND: u32 = 518_400; // ~30 dias

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    VkInvalidLength = 1,
    VkInvalidParameters = 2,
    RootNotPublished = 3,
    NullifierAlreadyUsed = 4,
    VerificationFailed = 5,
    InvalidTier = 6,
    /// labs (R2): no quedan numeros de epoca.
    EpochOverflow = 7,
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Admin,
    Vk,
    Root,
    Epoch,
    Nullifier(BytesN<32>),
    /// labs (R2): historial de raices, una por epoca. Nunca se reescribe.
    RootAt(u32),
    /// labs (R3): ultimo tier probado por un agente.
    Tier(Address),
}

/// labs (R3): tier probado y la epoca de la raiz contra la que se probo.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TierRecord {
    pub tier: u32,
    pub epoch: u32,
}

/// labs (R2): una raiz publicada, con su fecha.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RootRecord {
    pub root: BytesN<32>,
    /// Segundos Unix del ledger en que se publico.
    pub published_at: u64,
    pub ledger: u32,
}

#[contractevent(topics = ["root_published"])]
pub struct RootPublished {
    pub root: BytesN<32>,
    pub epoch: u32,
}

#[contractevent(topics = ["tier_proven"])]
pub struct TierProven {
    #[topic]
    pub agent: Address,
    pub tier: u32,
    pub epoch: u32,
}

fn load_verifier(env: &Env, vk: &Bytes) -> Result<UltraHonkVerifier, Error> {
    UltraHonkVerifier::new(env, vk).map_err(|e| match e {
        VkLoadError::WrongLength => Error::VkInvalidLength,
        VkLoadError::InvalidParameters => Error::VkInvalidParameters,
    })
}

/// sha256 con el primer byte en 0 => siempre < modulo de BN254.
fn to_field(env: &Env, data: &Bytes) -> BytesN<32> {
    let mut h: [u8; 32] = env.crypto().sha256(data).to_array();
    h[0] = 0;
    BytesN::from_array(env, &h)
}

fn u32_field(env: &Env, v: u32) -> Bytes {
    let mut b = [0u8; 32];
    b[28..].copy_from_slice(&v.to_be_bytes());
    Bytes::from_array(env, &b)
}

#[contract]
pub struct AgentTierRegistry;

#[contractimpl]
impl AgentTierRegistry {
    /// Deploy + init atomicos (constructor): nadie puede adelantarse al `initialize`.
    pub fn __constructor(env: Env, admin: Address, vk: Bytes) -> Result<(), Error> {
        load_verifier(&env, &vk)?;
        env.storage().instance().set(&Key::Admin, &admin);
        env.storage().instance().set(&Key::Vk, &vk);
        env.storage().instance().set(&Key::Epoch, &0u32);
        Ok(())
    }

    /// MicoPay publica la raiz de estadisticas certificadas (p. ej. cada noche).
    /// labs (R2): las epocas van en orden (1, 2, 3...), cada una guarda su raiz y su
    /// fecha en `root_at`, y una epoca ya publicada nunca se reescribe.
    pub fn publish_root(env: Env, root: BytesN<32>) -> Result<u32, Error> {
        let admin: Address = env.storage().instance().get(&Key::Admin).unwrap();
        admin.require_auth();
        let epoch: u32 = env
            .storage()
            .instance()
            .get::<_, u32>(&Key::Epoch)
            .unwrap()
            .checked_add(1)
            .ok_or(Error::EpochOverflow)?;
        let record_key = Key::RootAt(epoch);
        // Con la epoca que solo sube no deberia pasar; se revisa igual.
        if env.storage().persistent().has(&record_key) {
            return Err(Error::EpochOverflow);
        }
        let record = RootRecord {
            root: root.clone(),
            published_at: env.ledger().timestamp(),
            ledger: env.ledger().sequence(),
        };
        env.storage().persistent().set(&record_key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&record_key, NULLIFIER_TTL / 2, NULLIFIER_TTL);
        env.storage().instance().set(&Key::Root, &root);
        env.storage().instance().set(&Key::Epoch, &epoch);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_MIN, INSTANCE_TTL_EXTEND);
        RootPublished { root, epoch }.publish(&env);
        Ok(epoch)
    }

    /// labs (R2): la raiz y la fecha de una epoca publicada.
    pub fn root_at(env: Env, epoch: u32) -> Result<RootRecord, Error> {
        env.storage()
            .persistent()
            .get(&Key::RootAt(epoch))
            .ok_or(Error::RootNotPublished)
    }

    pub fn root(env: Env) -> Result<(BytesN<32>, u32), Error> {
        let root: BytesN<32> = env.storage().instance().get(&Key::Root).ok_or(Error::RootNotPublished)?;
        let epoch: u32 = env.storage().instance().get(&Key::Epoch).unwrap();
        Ok((root, epoch))
    }

    /// agent_id = sha256(G-address en texto) con el primer byte en 0.
    pub fn agent_id(env: Env, agent: Address) -> BytesN<32> {
        let s = agent.to_string();
        let mut buf = [0u8; 56];
        s.copy_into_slice(&mut buf[..s.len() as usize]);
        to_field(&env, &Bytes::from_slice(&env, &buf[..s.len() as usize]))
    }

    /// labs (R3): contexto de una epoca = el numero de epoca como campo. El prover lo
    /// usa como input publico y para su nullifier.
    pub fn context_for(env: Env, epoch: u32) -> BytesN<32> {
        let mut b = [0u8; 32];
        b[28..].copy_from_slice(&epoch.to_be_bytes());
        BytesN::from_array(&env, &b)
    }

    pub fn is_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().has(&Key::Nullifier(nullifier))
    }

    /// Umbrales (min_trades, min_rate) de un tier; el prover los necesita.
    pub fn thresholds(_env: Env, tier: u32) -> Result<(u32, u32), Error> {
        tier_thresholds(tier).ok_or(Error::InvalidTier)
    }

    /// Verifica que `agent` alcanza `tier` (1 Bronce, 2 Plata, 3 Oro) segun la raiz
    /// vigente, sin conocer sus numeros, y quema el nullifier del contexto.
    /// labs (R3): el contexto lo pone el contrato (la epoca vigente), y el tier queda
    /// guardado como `Tier(agent) -> (tier, epoca)`. Una prueba por agente y epoca.
    pub fn prove_tier(
        env: Env,
        agent: Address,
        tier: u32,
        nullifier: BytesN<32>,
        proof: Bytes,
    ) -> Result<(), Error> {
        let (min_trades, min_rate) = tier_thresholds(tier).ok_or(Error::InvalidTier)?;
        let (root, epoch) = Self::root(env.clone())?;
        let context = Self::context_for(env.clone(), epoch);
        let nkey = Key::Nullifier(nullifier.clone());
        if env.storage().persistent().has(&nkey) {
            return Err(Error::NullifierAlreadyUsed);
        }

        // Orden = el del circuito: [root, agent_id, min_trades, min_rate, context, nullifier]
        let mut pi = Bytes::new(&env);
        pi.append(&root.clone().into());
        pi.append(&Self::agent_id(env.clone(), agent.clone()).into());
        pi.append(&u32_field(&env, min_trades));
        pi.append(&u32_field(&env, min_rate));
        pi.append(&context.clone().into());
        pi.append(&nullifier.clone().into());

        let vk: Bytes = env.storage().instance().get(&Key::Vk).unwrap();
        load_verifier(&env, &vk)?
            .verify(&env, &proof, &pi)
            .map_err(|_| Error::VerificationFailed)?;

        env.storage().persistent().set(&nkey, &epoch);
        env.storage().persistent().extend_ttl(&nkey, NULLIFIER_TTL / 2, NULLIFIER_TTL);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_MIN, INSTANCE_TTL_EXTEND);
        let tier_key = Key::Tier(agent.clone());
        env.storage()
            .persistent()
            .set(&tier_key, &TierRecord { tier, epoch });
        env.storage()
            .persistent()
            .extend_ttl(&tier_key, NULLIFIER_TTL / 2, NULLIFIER_TTL);
        TierProven { agent, tier, epoch }.publish(&env);
        Ok(())
    }

    /// labs (R3): ultimo tier probado por `agent` y su epoca, aunque ya no sea la
    /// vigente. `get_tier` (R4) es la consulta que solo acepta la epoca vigente.
    pub fn tier_record(env: Env, agent: Address) -> Option<TierRecord> {
        env.storage().persistent().get(&Key::Tier(agent))
    }
}

#[cfg(test)]
mod test;
