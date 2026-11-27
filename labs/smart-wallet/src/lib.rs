//! Smart wallet de labs: una cuenta de contrato (`C…`) con varios firmantes ed25519,
//! cada uno con su peso, y un umbral. Es la fase W0–W5 de PLAN_SMART_WALLET.md.
//!
//! Solo testnet. Todavia no tiene passkey, guardianes ni sesiones.
//!
//! Reglas de esta fase:
//! - el contrato deriva el id de cada firmante (`sha256(0x00 ‖ pubkey)`), asi una llave
//!   no puede entrar dos veces ni aportar doble peso;
//! - cada firma es sobre `sha256(DOMINIO ‖ XDR de la direccion de la wallet ‖ modo ‖ payload)`,
//!   asi una firma para una wallet no sirve en otra;
//! - agregar, quitar firmantes y cambiar el umbral pide la firma de la propia wallet,
//!   es decir, el umbral vigente;
//! - limites por token y escrows registrados (W17–W19): subir un limite o registrar un
//!   escrow espera `DELAY_LEDGERS`; bajar o quitar aplica ya. Las reglas que los hacen
//!   cumplir dentro de `__check_auth` llegan con W19.
#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Map, Vec,
};

const TTL_MIN: u32 = 17_280;
const TTL_EXTEND: u32 = 518_400;

/// Etiqueta que va al inicio de todo mensaje firmado.
pub const DOMAIN: &[u8] = b"micopay-labs-wallet-v1";
/// Modo de la firma. Solo existe el dueno en esta fase; la sesion (1) llega con W20.
pub const MODE_OWNER: u8 = 0;
/// Prefijo del id de un firmante ed25519. El passkey (W6) usara 0x01.
const KIND_ED25519: u8 = 0;
/// Tope de firmantes, para acotar el costo de `__check_auth`.
pub const MAX_SIGNERS: u32 = 10;
/// Etiqueta de la prueba de posesion que firma una llave nueva en `add_signer`.
pub const ADD_SIGNER_TAG: &[u8] = b"add-signer";
/// Espera para subir un limite o registrar un escrow (~10 min). Fija en esta fase: la
/// decision D5 (plazos configurables) sigue abierta.
pub const DELAY_LEDGERS: u32 = 120;
/// Periodo del limite de gasto (~1 dia). Ventana fija desde el primer gasto: cerca del
/// cambio de periodo pueden salir hasta dos limites seguidos.
pub const PERIOD_LEDGERS: u32 = 17_280;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// `Map<id, Signer>`
    Signers,
    Threshold,
    Limit(Address),
    PendingLimit(Address),
    Spent(Address),
}

/// Subida de limite pendiente: el valor nuevo y desde que ledger se puede aplicar.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingLimit {
    pub per_period: i128,
    pub ready_ledger: u32,
}

/// Gasto del periodo en curso de un token.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Spent {
    pub period_start: u32,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Signer {
    pub key: BytesN<32>,
    pub weight: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Ed25519Proof {
    pub id: BytesN<32>,
    pub sig: BytesN<64>,
}

/// Una prueba de firma. `#[contracttype]` solo admite variantes de tupla.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Proof {
    Ed25519(Ed25519Proof),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum WalletError {
    NotInitialized = 1,
    NoProofs = 2,
    UnknownSigner = 3,
    DuplicateProof = 4,
    InsufficientWeight = 5,
    KeyUsed = 6,
    InvalidWeight = 7,
    LastSigner = 8,
    ThresholdUnreachable = 9,
    InvalidThreshold = 10,
    TooManySigners = 11,
    Overflow = 12,
    TooManyProofs = 13,
    InvalidLimit = 14,
    NothingPending = 16,
    NotReady = 17,
}

/// Id de un firmante ed25519: `sha256(0x00 ‖ pubkey)`.
pub fn signer_id(env: &Env, key: &BytesN<32>) -> BytesN<32> {
    let mut b = Bytes::from_array(env, &[KIND_ED25519]);
    b.append(&key.clone().into());
    env.crypto().sha256(&b).into()
}

/// Mensaje que firma cada llave: `sha256(DOMINIO ‖ XDR(ScVal de la wallet) ‖ modo ‖ payload)`.
pub fn message(env: &Env, wallet: &Address, mode: u8, payload: &Hash<32>) -> BytesN<32> {
    let mut b = Bytes::from_slice(env, DOMAIN);
    b.append(&wallet.clone().to_xdr(env));
    b.push_back(mode);
    b.append(&payload.to_bytes().into());
    env.crypto().sha256(&b).into()
}

/// Lo que firma una llave nueva para probar que existe quien la tiene:
/// `sha256(DOMINIO ‖ XDR(ScVal de la wallet) ‖ "add-signer" ‖ id)`.
pub fn possession_message(env: &Env, wallet: &Address, id: &BytesN<32>) -> BytesN<32> {
    let mut b = Bytes::from_slice(env, DOMAIN);
    b.append(&wallet.clone().to_xdr(env));
    b.append(&Bytes::from_slice(env, ADD_SIGNER_TAG));
    b.append(&id.clone().into());
    env.crypto().sha256(&b).into()
}

fn bump(env: &Env) {
    env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
}

fn signers(env: &Env) -> Result<Map<BytesN<32>, Signer>, WalletError> {
    env.storage()
        .instance()
        .get(&DataKey::Signers)
        .ok_or(WalletError::NotInitialized)
}

fn threshold(env: &Env) -> Result<u32, WalletError> {
    env.storage()
        .instance()
        .get(&DataKey::Threshold)
        .ok_or(WalletError::NotInitialized)
}

fn ready_at(env: &Env) -> Result<u32, WalletError> {
    env.ledger()
        .sequence()
        .checked_add(DELAY_LEDGERS)
        .ok_or(WalletError::Overflow)
}

fn total_weight(map: &Map<BytesN<32>, Signer>) -> Result<u32, WalletError> {
    let mut total: u32 = 0;
    for s in map.values() {
        total = total.checked_add(s.weight).ok_or(WalletError::Overflow)?;
    }
    Ok(total)
}

#[contract]
pub struct SmartWallet;

#[contractimpl]
impl SmartWallet {
    /// W1. Primer firmante ed25519 con peso 1 y umbral 1. Los plazos (D5) llegan con las
    /// fases que los usan. Sin prueba de posesion: quien despliega elige la llave, y una
    /// llave que nadie tiene solo deja una wallet vacia e inservible, sin fondos en riesgo.
    pub fn __constructor(env: Env, owner: BytesN<32>) {
        let mut map = Map::new(&env);
        map.set(signer_id(&env, &owner), Signer { key: owner, weight: 1 });
        env.storage().instance().set(&DataKey::Signers, &map);
        env.storage().instance().set(&DataKey::Threshold, &1u32);
        bump(&env);
    }

    /// W3. Agrega un firmante ed25519. El id lo deriva el contrato. Devuelve el id.
    ///
    /// `possession` es la firma de la llave nueva sobre `possession_message`. Sin ella, el
    /// umbral podria pasar a depender de una llave que nadie tiene y la wallet quedaria
    /// bloqueada para siempre (no se podria ni quitar esa llave).
    pub fn add_signer(
        env: Env,
        key: BytesN<32>,
        weight: u32,
        possession: BytesN<64>,
    ) -> Result<BytesN<32>, WalletError> {
        let wallet = env.current_contract_address();
        wallet.require_auth();
        if weight == 0 {
            return Err(WalletError::InvalidWeight);
        }
        let mut map = signers(&env)?;
        let id = signer_id(&env, &key);
        // Aborta si la llave nueva no firmo.
        env.crypto()
            .ed25519_verify(&key, &possession_message(&env, &wallet, &id).into(), &possession);
        if map.contains_key(id.clone()) {
            return Err(WalletError::KeyUsed);
        }
        if map.len() >= MAX_SIGNERS {
            return Err(WalletError::TooManySigners);
        }
        map.set(id.clone(), Signer { key, weight });
        total_weight(&map)?;
        env.storage().instance().set(&DataKey::Signers, &map);
        bump(&env);
        Ok(id)
    }

    /// W4. Quita un firmante. No deja la wallet sin firmantes ni bajo el umbral.
    pub fn remove_signer(env: Env, id: BytesN<32>) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let mut map = signers(&env)?;
        if !map.contains_key(id.clone()) {
            return Err(WalletError::UnknownSigner);
        }
        if map.len() == 1 {
            return Err(WalletError::LastSigner);
        }
        map.remove(id);
        if total_weight(&map)? < threshold(&env)? {
            return Err(WalletError::ThresholdUnreachable);
        }
        env.storage().instance().set(&DataKey::Signers, &map);
        bump(&env);
        Ok(())
    }

    /// W5. Cambia el umbral. Tiene que ser alcanzable con los pesos actuales.
    pub fn set_threshold(env: Env, threshold: u32) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        if threshold == 0 {
            return Err(WalletError::InvalidThreshold);
        }
        if threshold > total_weight(&signers(&env)?)? {
            return Err(WalletError::ThresholdUnreachable);
        }
        env.storage().instance().set(&DataKey::Threshold, &threshold);
        bump(&env);
        Ok(())
    }

    /// W17. Pone el limite de gasto por periodo de un token. Bajarlo (o ponerlo por primera
    /// vez) aplica ya; subirlo queda pendiente `DELAY_LEDGERS` y lo aplica `apply_limit`.
    /// Devuelve `true` si ya quedo aplicado.
    pub fn set_limit(env: Env, token: Address, per_period: i128) -> Result<bool, WalletError> {
        env.current_contract_address().require_auth();
        if per_period < 0 {
            return Err(WalletError::InvalidLimit);
        }
        let st = env.storage().instance();
        let current: Option<i128> = st.get(&DataKey::Limit(token.clone()));
        let applied = match current {
            Some(c) if per_period > c => {
                let ready_ledger = ready_at(&env)?;
                st.set(&DataKey::PendingLimit(token), &PendingLimit { per_period, ready_ledger });
                false
            }
            _ => {
                st.set(&DataKey::Limit(token.clone()), &per_period);
                st.remove(&DataKey::PendingLimit(token));
                true
            }
        };
        bump(&env);
        Ok(applied)
    }

    /// W17. Aplica una subida de limite pendiente, ya cumplida la espera. Cualquiera la
    /// puede llamar: solo ejecuta lo que la wallet ya aprobo.
    pub fn apply_limit(env: Env, token: Address) -> Result<(), WalletError> {
        let st = env.storage().instance();
        let p: PendingLimit = st
            .get(&DataKey::PendingLimit(token.clone()))
            .ok_or(WalletError::NothingPending)?;
        if env.ledger().sequence() < p.ready_ledger {
            return Err(WalletError::NotReady);
        }
        st.set(&DataKey::Limit(token.clone()), &p.per_period);
        st.remove(&DataKey::PendingLimit(token));
        bump(&env);
        Ok(())
    }

    /// Lectura: limite vigente de un token (`None` = sin limite).
    pub fn limit(env: Env, token: Address) -> Option<i128> {
        env.storage().instance().get(&DataKey::Limit(token))
    }

    /// Lectura: gasto del periodo en curso de un token.
    pub fn spent(env: Env, token: Address) -> i128 {
        let s: Option<Spent> = env.storage().instance().get(&DataKey::Spent(token));
        match s {
            Some(s) if env.ledger().sequence() < s.period_start.saturating_add(PERIOD_LEDGERS) => s.amount,
            _ => 0,
        }
    }

    /// Lectura: firmantes por id.
    pub fn signers(env: Env) -> Result<Map<BytesN<32>, Signer>, WalletError> {
        signers(&env)
    }

    /// Lectura: umbral vigente.
    pub fn threshold(env: Env) -> Result<u32, WalletError> {
        threshold(&env)
    }
}

#[contractimpl]
impl CustomAccountInterface for SmartWallet {
    type Signature = Vec<Proof>;
    type Error = WalletError;

    /// W2. Soroban la llama cuando un contrato pide `require_auth` de esta wallet.
    /// Suma el peso de firmantes distintos con firma valida; tiene que llegar al umbral.
    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signatures: Vec<Proof>,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), WalletError> {
        if signatures.is_empty() {
            return Err(WalletError::NoProofs);
        }
        if signatures.len() > MAX_SIGNERS {
            return Err(WalletError::TooManyProofs);
        }
        let map = signers(&env)?;
        let msg: Bytes = message(&env, &env.current_contract_address(), MODE_OWNER, &signature_payload).into();
        let mut seen: Vec<BytesN<32>> = Vec::new(&env);
        let mut weight: u32 = 0;
        for proof in signatures.iter() {
            match proof {
                Proof::Ed25519(p) => {
                    if seen.contains(&p.id) {
                        return Err(WalletError::DuplicateProof);
                    }
                    let signer = map.get(p.id.clone()).ok_or(WalletError::UnknownSigner)?;
                    // Aborta si la firma no es valida.
                    env.crypto().ed25519_verify(&signer.key, &msg, &p.sig);
                    seen.push_back(p.id);
                    weight = weight.checked_add(signer.weight).ok_or(WalletError::Overflow)?;
                }
            }
        }
        if weight < threshold(&env)? {
            return Err(WalletError::InsufficientWeight);
        }
        bump(&env);
        Ok(())
    }
}

mod test;
