#![no_std]
//! AgentTierRegistry -- reputacion privada de agentes MicoPay (prototipo).
//!
//! MicoPay publica la raiz Merkle de las estadisticas certificadas de sus agentes.
//! Un agente prueba con ZK "soy Plata" (>= 10 operaciones) sin revelar sus numeros
//! exactos. Solo hay tiers fijos (ver BRONCE/PLATA/ORO). El contrato:
//!   * arma los inputs publicos EL MISMO con la raiz guardada on-chain (no acepta
//!     una raiz que mande el cliente);
//!   * deriva el agent_id de la `Address` del agente (la prueba no se presta);
//!   * quema el nullifier por contexto (una prueba por trade, sin replay).
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
}

#[contracttype]
#[derive(Clone)]
enum Key {
    Admin,
    Vk,
    Root,
    Epoch,
    Nullifier(BytesN<32>),
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
    pub context: BytesN<32>,
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
    pub fn publish_root(env: Env, root: BytesN<32>) -> u32 {
        let admin: Address = env.storage().instance().get(&Key::Admin).unwrap();
        admin.require_auth();
        let epoch: u32 = env.storage().instance().get::<_, u32>(&Key::Epoch).unwrap() + 1;
        env.storage().instance().set(&Key::Root, &root);
        env.storage().instance().set(&Key::Epoch, &epoch);
        RootPublished { root, epoch }.publish(&env);
        epoch
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

    /// context = sha256(trade_id) con el primer byte en 0.
    pub fn context_of(env: Env, trade_id: Bytes) -> BytesN<32> {
        to_field(&env, &trade_id)
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
    pub fn prove_tier(
        env: Env,
        agent: Address,
        tier: u32,
        context: BytesN<32>,
        nullifier: BytesN<32>,
        proof: Bytes,
    ) -> Result<(), Error> {
        let (min_trades, min_rate) = tier_thresholds(tier).ok_or(Error::InvalidTier)?;
        let (root, epoch) = Self::root(env.clone())?;
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
        TierProven { agent, tier, context, epoch }.publish(&env);
        Ok(())
    }
}

#[cfg(test)]
mod test;
