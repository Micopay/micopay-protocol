//! Smart wallet de labs: una cuenta de contrato (`C…`) con varios firmantes ed25519,
//! cada uno con su peso, y un umbral. Es la fase W0–W5 de PLAN_SMART_WALLET.md.
//!
//! Solo testnet. Todavia no tiene passkey. Las fases W8–W21 se describen en el README.
//!
//! Reglas de esta fase:
//! - el contrato deriva el id de cada firmante (`sha256(0x00 ‖ pubkey)`), asi una llave
//!   no puede entrar dos veces ni aportar doble peso;
//! - cada firma es sobre `sha256(DOMINIO ‖ XDR de la direccion de la wallet ‖ modo ‖ payload)`,
//!   asi una firma para una wallet no sirve en otra;
//! - agregar, quitar firmantes y cambiar el umbral pide la firma de la propia wallet,
//!   es decir, el umbral vigente;
//! - limites por token y escrows registrados (W17–W19): subir un limite o registrar un
//!   escrow espera `DELAY_LEDGERS`; bajar o quitar aplica ya. `approve` se rechaza siempre.
#![no_std]

use soroban_sdk::{
    auth::{Context, ContractContext, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, Map, Symbol, TryFromVal, Val, Vec,
};

const TTL_MIN: u32 = 17_280;
const TTL_EXTEND: u32 = 518_400;

/// Etiqueta que va al inicio de todo mensaje firmado.
pub const DOMAIN: &[u8] = b"micopay-labs-wallet-v1";
/// Modo de la firma del dueno.
pub const MODE_OWNER: u8 = 0;
/// Modo del mensaje firmado por una llave de sesion (W20).
pub const MODE_SESSION: u8 = 1;
/// Prefijo del id de una sesion.
const KIND_SESSION: u8 = 2;
/// Tope de sesiones a la vez.
pub const MAX_SESSIONS: u32 = 5;
/// Tope de compradores por sesion y de permisos de `decline` pendientes.
pub const MAX_SESSION_LIST: u32 = 10;
/// Vigencia maxima de una sesion (~7 dias).
pub const SESSION_MAX_TTL: u32 = 120_960;
/// Espera de un upgrade (~20 min): mas que `DELAY_LEDGERS`, para que los guardianes alcancen a
/// congelar si quien robo el telefono programa uno.
pub const UPGRADE_DELAY: u32 = 240;
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
/// Plazo maximo de un `lock` en un escrow registrado (7 dias, en minutos). Fijo mientras D5
/// siga abierta; el escrow no acota el plazo por su cuenta.
pub const MAX_LOCK_TIMEOUT_MINUTES: u32 = 10_080;
/// Tope de guardianes.
pub const MAX_GUARDIANS: u32 = 10;
/// Congelamiento maximo de una vez (~30 min). Los plazos de congelamiento y recuperacion son
/// cortos para poder probarlos en testnet; el plan propone dias, pero D5 sigue abierta.
pub const FREEZE_MAX: u32 = 360;
/// Ventana en la que menos del quorum de guardianes congela como mucho `FREEZE_MAX` (~2 h).
pub const FREEZE_WINDOW: u32 = 1_440;
/// Espera para que el dueno descongele por su cuenta (~10 min).
pub const UNFREEZE_DELAY: u32 = DELAY_LEDGERS;
/// Espera de una recuperacion, contada desde que se llega al quorum (~20 min).
pub const RECOVERY_DELAY: u32 = 240;
/// Margen minimo entre el fin de la espera y la caducidad de una propuesta (~10 min).
pub const RECOVERY_MARGIN: u32 = DELAY_LEDGERS;
/// Caducidad maxima de una propuesta de recuperacion (~4 h).
pub const RECOVERY_MAX_TTL: u32 = 2_880;
/// Etiqueta del id de una propuesta de recuperacion.
const RECOVERY_TAG: &[u8] = b"recovery";

#[contracttype]
#[derive(Clone)]
enum DataKey {
    /// `Map<id, Signer>`
    Signers,
    Threshold,
    Limit(Address),
    PendingLimit(Address),
    Spent(Address),
    Escrow(Address),
    PendingEscrow(Address),
    /// `Vec<Address>`
    Guardians,
    GuardianThreshold,
    /// Sube con cada cambio de guardianes o de quorum: los votos de antes dejan de contar.
    GuardianEpoch,
    /// Sube cuando termina una recuperacion: lo pendiente del dueno anterior deja de valer.
    OwnerEpoch,
    PendingGuardianRemoval(Address),
    PendingGuardianAdd(Address),
    Frozen,
    /// Desde que ledger menos del quorum puede volver a congelar.
    SoloFreezeAllowedAt,
    PendingUnfreeze,
    Recovery,
    RecoveryNonce,
    Sessions,
    PendingUpgrade,
}

/// W21. Upgrade programado: el hash exacto del WASM nuevo.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingUpgrade {
    pub hash: BytesN<32>,
    pub ready_ledger: u32,
    pub owner_epoch: u32,
}

/// Propuesta de recuperacion: reemplazar todos los firmantes por `new_key`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Recovery {
    pub id: BytesN<32>,
    pub new_key: BytesN<32>,
    /// Epoca de guardianes en que se abrio: si cambian los guardianes o el quorum, no vale.
    pub guardian_epoch: u32,
    pub votes: Vec<Address>,
    pub expires: u32,
    /// Ledger desde el que se puede terminar; 0 mientras no llegue al quorum.
    pub ready_ledger: u32,
}

/// Congelamiento vigente: hasta que ledger.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Freeze {
    pub until: u32,
}

/// Algo pendiente que no lleva valor: desde que ledger se aplica y de que dueno es.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Pending {
    pub ready_ledger: u32,
    pub owner_epoch: u32,
}

/// Subida de limite pendiente: el valor nuevo y desde que ledger se puede aplicar.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingLimit {
    pub per_period: i128,
    pub ready_ledger: u32,
    pub owner_epoch: u32,
}

/// Gasto del periodo en curso de un token.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Spent {
    pub period_start: u32,
    pub amount: i128,
}

/// Escrow registrado: con que token opera y la comision maxima en puntos base.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowRule {
    pub token: Address,
    pub fee_bps_max: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingEscrow {
    pub rule: EscrowRule,
    pub ready_ledger: u32,
    pub owner_epoch: u32,
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
    Session(SessionProof),
}

/// W20. Firma de una llave de sesion.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionProof {
    pub id: BytesN<32>,
    pub sig: BytesN<64>,
}

/// W20. Llave temporal que solo opera un escrow: `lock` hacia compradores autorizados con
/// topes propios, `release`, y `decline` solo de los trades que el dueno permitio.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Session {
    pub key: BytesN<32>,
    pub escrow: Address,
    /// Regla del escrow al crear la sesion. Si cambia (otro token u otra comision), la sesion
    /// deja de valer.
    pub rule: EscrowRule,
    pub buyers: Vec<Address>,
    /// Tope de `amount + platform_fee` por `lock`.
    pub max_per_lock: i128,
    /// Tope acumulado de toda la sesion.
    pub max_total: i128,
    pub spent: i128,
    /// Plazo maximo del `lock`, en minutos.
    pub max_timeout: u32,
    pub expires: u32,
    pub owner_epoch: u32,
    /// Trades que la sesion puede declinar, una vez cada uno.
    pub declines: Vec<BytesN<32>>,
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
    LimitExceeded = 15,
    NothingPending = 16,
    NotReady = 17,
    ApproveDenied = 18,
    EscrowTransferMismatch = 19,
    EscrowLockInvalid = 20,
    InvalidFee = 21,
    UnknownEscrow = 22,
    BadArgs = 23,
    GuardianExists = 24,
    UnknownGuardian = 25,
    TooManyGuardians = 26,
    InvalidGuardianThreshold = 27,
    Stale = 28,
    InvalidGuardian = 29,
    Frozen = 30,
    NotFrozen = 31,
    FreezeCooldown = 32,
    NotEnoughGuardians = 33,
    DuplicateGuardian = 34,
    RecoveryActive = 35,
    InvalidExpiry = 36,
    UnknownProposal = 37,
    ProposalExpired = 38,
    AlreadyVoted = 39,
    MixedProofs = 40,
    UnknownSession = 41,
    SessionExpired = 42,
    SessionDenied = 43,
    SessionLimit = 44,
    InvalidSession = 45,
    TooManySessions = 46,
    UpgradeMismatch = 47,
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

fn guardian_list(env: &Env) -> Vec<Address> {
    env.storage().instance().get(&DataKey::Guardians).unwrap_or(Vec::new(env))
}

fn guardian_threshold(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::GuardianThreshold).unwrap_or(0)
}

fn owner_epoch(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::OwnerEpoch).unwrap_or(0)
}

/// Guarda guardianes y quorum, y sube la epoca para que los votos viejos no cuenten.
fn save_guardians(env: &Env, list: &Vec<Address>, threshold: u32) -> Result<(), WalletError> {
    let st = env.storage().instance();
    let epoch: u32 = st.get(&DataKey::GuardianEpoch).unwrap_or(0);
    st.set(&DataKey::Guardians, list);
    st.set(&DataKey::GuardianThreshold, &threshold);
    st.set(&DataKey::GuardianEpoch, &epoch.checked_add(1).ok_or(WalletError::Overflow)?);
    Ok(())
}

/// Verifica que `guardians` sean guardianes distintos y que cada uno firme. Devuelve cuantos son.
fn guardians_sign(env: &Env, guardians: &Vec<Address>) -> Result<u32, WalletError> {
    if guardians.is_empty() {
        return Err(WalletError::NotEnoughGuardians);
    }
    let list = guardian_list(env);
    let mut seen: Vec<Address> = Vec::new(env);
    for g in guardians.iter() {
        if !list.contains(&g) {
            return Err(WalletError::UnknownGuardian);
        }
        if seen.contains(&g) {
            return Err(WalletError::DuplicateGuardian);
        }
        g.require_auth();
        seen.push_back(g);
    }
    Ok(seen.len())
}

/// Como `guardians_sign`, y ademas tienen que llegar al quorum.
fn guardian_quorum(env: &Env, guardians: &Vec<Address>) -> Result<(), WalletError> {
    let n = guardians_sign(env, guardians)?;
    let t = guardian_threshold(env);
    if t == 0 || n < t {
        return Err(WalletError::NotEnoughGuardians);
    }
    Ok(())
}

/// Hay una propuesta de recuperacion vigente (no vencio y es de la epoca actual).
fn recovery_live(env: &Env) -> bool {
    let r: Option<Recovery> = env.storage().instance().get(&DataKey::Recovery);
    matches!(r, Some(r) if env.ledger().sequence() < r.expires && r.guardian_epoch == guardian_epoch(env))
}

fn no_live_recovery(env: &Env) -> Result<(), WalletError> {
    if recovery_live(env) {
        return Err(WalletError::RecoveryActive);
    }
    Ok(())
}

pub(crate) fn is_frozen(env: &Env) -> bool {
    let f: Option<Freeze> = env.storage().instance().get(&DataKey::Frozen);
    matches!(f, Some(f) if env.ledger().sequence() < f.until)
}

fn not_frozen(env: &Env) -> Result<(), WalletError> {
    if is_frozen(env) {
        return Err(WalletError::Frozen);
    }
    Ok(())
}

fn clear_freeze(env: &Env) {
    let st = env.storage().instance();
    st.remove(&DataKey::Frozen);
    st.remove(&DataKey::PendingUnfreeze);
}

/// Id de una sesion: `sha256(0x02 ‖ pubkey)`.
pub fn session_id(env: &Env, key: &BytesN<32>) -> BytesN<32> {
    let mut b = Bytes::from_array(env, &[KIND_SESSION]);
    b.append(&key.clone().into());
    env.crypto().sha256(&b).into()
}

fn sessions(env: &Env) -> Map<BytesN<32>, Session> {
    env.storage().instance().get(&DataKey::Sessions).unwrap_or(Map::new(env))
}

fn guardian_epoch(env: &Env) -> u32 {
    env.storage().instance().get(&DataKey::GuardianEpoch).unwrap_or(0)
}

/// La propuesta vigente con ese id: existe, no vencio y es de la epoca de guardianes actual.
fn live_recovery(env: &Env, id: &BytesN<32>) -> Result<Recovery, WalletError> {
    let r: Recovery = env
        .storage()
        .instance()
        .get(&DataKey::Recovery)
        .ok_or(WalletError::UnknownProposal)?;
    if r.id != *id {
        return Err(WalletError::UnknownProposal);
    }
    if env.ledger().sequence() >= r.expires {
        return Err(WalletError::ProposalExpired);
    }
    if r.guardian_epoch != guardian_epoch(env) {
        return Err(WalletError::Stale);
    }
    Ok(r)
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
                st.set(&DataKey::PendingLimit(token), &PendingLimit { per_period, ready_ledger, owner_epoch: owner_epoch(&env) });
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
        not_frozen(&env)?;
        let p: PendingLimit = st
            .get(&DataKey::PendingLimit(token.clone()))
            .ok_or(WalletError::NothingPending)?;
        if p.owner_epoch != owner_epoch(&env) {
            return Err(WalletError::Stale);
        }
        if env.ledger().sequence() < p.ready_ledger {
            return Err(WalletError::NotReady);
        }
        st.set(&DataKey::Limit(token.clone()), &p.per_period);
        st.remove(&DataKey::PendingLimit(token));
        bump(&env);
        Ok(())
    }

    /// W18. Registra un escrow con su token y su comision maxima. Queda pendiente
    /// `DELAY_LEDGERS` y lo aplica `apply_escrow`.
    pub fn add_escrow(env: Env, escrow: Address, token: Address, fee_bps_max: u32) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        if fee_bps_max > 10_000 {
            return Err(WalletError::InvalidFee);
        }
        let ready_ledger = ready_at(&env)?;
        let rule = EscrowRule { token, fee_bps_max };
        env.storage()
            .instance()
            .set(&DataKey::PendingEscrow(escrow), &PendingEscrow { rule, ready_ledger, owner_epoch: owner_epoch(&env) });
        bump(&env);
        Ok(())
    }

    /// W18. Aplica un registro de escrow pendiente, ya cumplida la espera. Cualquiera.
    pub fn apply_escrow(env: Env, escrow: Address) -> Result<(), WalletError> {
        let st = env.storage().instance();
        not_frozen(&env)?;
        let p: PendingEscrow = st
            .get(&DataKey::PendingEscrow(escrow.clone()))
            .ok_or(WalletError::NothingPending)?;
        if p.owner_epoch != owner_epoch(&env) {
            return Err(WalletError::Stale);
        }
        if env.ledger().sequence() < p.ready_ledger {
            return Err(WalletError::NotReady);
        }
        st.set(&DataKey::Escrow(escrow.clone()), &p.rule);
        st.remove(&DataKey::PendingEscrow(escrow));
        bump(&env);
        Ok(())
    }

    /// W18. Quita un escrow registrado y su registro pendiente, y revoca sus sesiones. Aplica ya.
    pub fn remove_escrow(env: Env, escrow: Address) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let st = env.storage().instance();
        if !st.has(&DataKey::Escrow(escrow.clone())) && !st.has(&DataKey::PendingEscrow(escrow.clone())) {
            return Err(WalletError::UnknownEscrow);
        }
        st.remove(&DataKey::Escrow(escrow.clone()));
        st.remove(&DataKey::PendingEscrow(escrow.clone()));
        // Sus sesiones mueren con el: volver a registrarlo no las revive.
        let mut map = sessions(&env);
        for (k, v) in map.clone().iter() {
            if v.escrow == escrow {
                map.remove(k);
            }
        }
        st.set(&DataKey::Sessions, &map);
        bump(&env);
        Ok(())
    }

    /// W8. Pide agregar un guardian (una cuenta `G…` o `C…` que firma por su cuenta). Queda
    /// pendiente `DELAY_LEDGERS` y lo aplica `apply_guardian_add`: si agregar aplicara ya, quien
    /// robo el telefono meteria un guardian suyo que descongela y recupera la wallet para el.
    pub fn add_guardian(env: Env, guardian: Address) -> Result<(), WalletError> {
        let me = env.current_contract_address();
        me.require_auth();
        if guardian == me {
            return Err(WalletError::InvalidGuardian);
        }
        let list = guardian_list(&env);
        if list.contains(&guardian) {
            return Err(WalletError::GuardianExists);
        }
        if list.len() >= MAX_GUARDIANS {
            return Err(WalletError::TooManyGuardians);
        }
        let pending = Pending { ready_ledger: ready_at(&env)?, owner_epoch: owner_epoch(&env) };
        env.storage().instance().set(&DataKey::PendingGuardianAdd(guardian), &pending);
        bump(&env);
        Ok(())
    }

    /// W8. Aplica un alta de guardian pendiente, ya cumplida la espera. Cualquiera. No con la
    /// wallet congelada ni con una recuperacion en curso (cambiar guardianes anularia sus votos).
    /// Con el primer guardian el quorum pasa a 1.
    pub fn apply_guardian_add(env: Env, guardian: Address) -> Result<(), WalletError> {
        not_frozen(&env)?;
        no_live_recovery(&env)?;
        let st = env.storage().instance();
        let key = DataKey::PendingGuardianAdd(guardian.clone());
        let p: Pending = st.get(&key).ok_or(WalletError::NothingPending)?;
        if p.owner_epoch != owner_epoch(&env) {
            return Err(WalletError::Stale);
        }
        if env.ledger().sequence() < p.ready_ledger {
            return Err(WalletError::NotReady);
        }
        let mut list = guardian_list(&env);
        if list.contains(&guardian) {
            return Err(WalletError::GuardianExists);
        }
        if list.len() >= MAX_GUARDIANS {
            return Err(WalletError::TooManyGuardians);
        }
        list.push_back(guardian);
        let t = guardian_threshold(&env).max(1);
        save_guardians(&env, &list, t)?;
        st.remove(&key);
        bump(&env);
        Ok(())
    }

    /// W8. Pide quitar un guardian. Queda pendiente `DELAY_LEDGERS`: asi quien robo el
    /// telefono no saca a los guardianes antes de que lo congelen.
    pub fn remove_guardian(env: Env, guardian: Address) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        if !guardian_list(&env).contains(&guardian) {
            return Err(WalletError::UnknownGuardian);
        }
        let pending = Pending { ready_ledger: ready_at(&env)?, owner_epoch: owner_epoch(&env) };
        env.storage().instance().set(&DataKey::PendingGuardianRemoval(guardian), &pending);
        bump(&env);
        Ok(())
    }

    /// W8. Aplica una baja de guardian pendiente, ya cumplida la espera. Cualquiera. No con la
    /// wallet congelada ni con una recuperacion en curso. Si el quorum queda mayor que los
    /// guardianes que quedan, baja a ese numero.
    pub fn apply_guardian_removal(env: Env, guardian: Address) -> Result<(), WalletError> {
        let st = env.storage().instance();
        let key = DataKey::PendingGuardianRemoval(guardian.clone());
        not_frozen(&env)?;
        no_live_recovery(&env)?;
        let p: Pending = st.get(&key).ok_or(WalletError::NothingPending)?;
        if p.owner_epoch != owner_epoch(&env) {
            return Err(WalletError::Stale);
        }
        if env.ledger().sequence() < p.ready_ledger {
            return Err(WalletError::NotReady);
        }
        let mut list = guardian_list(&env);
        let i = list.first_index_of(&guardian).ok_or(WalletError::UnknownGuardian)?;
        list.remove(i);
        let t = guardian_threshold(&env).min(list.len());
        save_guardians(&env, &list, t)?;
        st.remove(&key);
        bump(&env);
        Ok(())
    }

    /// W9. Cambia el quorum de guardianes: `1 ≤ t ≤ guardianes` (0 solo si no hay guardianes).
    pub fn set_guardian_threshold(env: Env, threshold: u32) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let list = guardian_list(&env);
        let ok = if list.is_empty() { threshold == 0 } else { threshold >= 1 && threshold <= list.len() };
        if !ok {
            return Err(WalletError::InvalidGuardianThreshold);
        }
        save_guardians(&env, &list, threshold)?;
        bump(&env);
        Ok(())
    }

    /// W15. Congela la wallet hasta `FREEZE_MAX` ledgers: el dueno ya no puede mover fondos
    /// ni cambiar nada (solo pedir descongelar). Para un telefono robado.
    ///
    /// Con el quorum (y al menos dos guardianes), puede volver a congelar o prolongar. Con menos
    /// (un guardian solo, aunque el quorum sea 1), solo si la wallet no esta congelada y paso el
    /// enfriamiento: despues de un congelamiento asi, nadie sin ese quorum congela de nuevo hasta
    /// `fin + FREEZE_WINDOW - FREEZE_MAX`. Asi un guardian solo congela como mucho `FREEZE_MAX` en
    /// cualquier ventana de `FREEZE_WINDOW`. El enfriamiento es de la wallet, no de cada guardian.
    pub fn freeze(env: Env, guardians: Vec<Address>) -> Result<u32, WalletError> {
        let n = guardians_sign(&env, &guardians)?;
        let t = guardian_threshold(&env);
        let now = env.ledger().sequence();
        let until = now.checked_add(FREEZE_MAX).ok_or(WalletError::Overflow)?;
        let st = env.storage().instance();
        if t > 0 && n >= t.max(2) {
            let current: Option<Freeze> = st.get(&DataKey::Frozen);
            let until = match current {
                Some(f) if is_frozen(&env) => f.until.max(until),
                _ => until,
            };
            st.set(&DataKey::Frozen, &Freeze { until });
            st.remove(&DataKey::PendingUnfreeze);
            bump(&env);
            return Ok(until);
        }
        if is_frozen(&env) {
            return Err(WalletError::Frozen);
        }
        let allowed: u32 = st.get(&DataKey::SoloFreezeAllowedAt).unwrap_or(0);
        if now < allowed {
            return Err(WalletError::FreezeCooldown);
        }
        st.set(&DataKey::Frozen, &Freeze { until });
        let allowed_at = until
            .checked_add(FREEZE_WINDOW - FREEZE_MAX)
            .ok_or(WalletError::Overflow)?;
        st.set(&DataKey::SoloFreezeAllowedAt, &allowed_at);
        st.remove(&DataKey::PendingUnfreeze);
        bump(&env);
        Ok(until)
    }

    /// W16. El dueno pide descongelar; se aplica con `unfreeze` despues de `UNFREEZE_DELAY`.
    /// Asi quien tiene el telefono robado no descongela al instante. No con una recuperacion en
    /// curso: si no, descongelaria antes de que la recuperacion este lista y la cancelaria con
    /// una sola llave. El dueno con dos credenciales puede cancelarla primero (D8).
    pub fn request_unfreeze(env: Env) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        if !is_frozen(&env) {
            return Err(WalletError::NotFrozen);
        }
        no_live_recovery(&env)?;
        let ready_ledger = env
            .ledger()
            .sequence()
            .checked_add(UNFREEZE_DELAY)
            .ok_or(WalletError::Overflow)?;
        let pending = Pending { ready_ledger, owner_epoch: owner_epoch(&env) };
        env.storage().instance().set(&DataKey::PendingUnfreeze, &pending);
        bump(&env);
        Ok(())
    }

    /// W16. Descongela si el dueno lo pidio y paso la espera, o si el congelamiento ya vencio.
    /// Cualquiera.
    pub fn unfreeze(env: Env) -> Result<(), WalletError> {
        if is_frozen(&env) {
            no_live_recovery(&env)?;
            let st = env.storage().instance();
            let p: Pending = st.get(&DataKey::PendingUnfreeze).ok_or(WalletError::NothingPending)?;
            if p.owner_epoch != owner_epoch(&env) {
                return Err(WalletError::Stale);
            }
            if env.ledger().sequence() < p.ready_ledger {
                return Err(WalletError::NotReady);
            }
        }
        clear_freeze(&env);
        bump(&env);
        Ok(())
    }

    /// W16. El quorum de guardianes descongela al instante.
    pub fn guardian_unfreeze(env: Env, guardians: Vec<Address>) -> Result<(), WalletError> {
        guardian_quorum(&env, &guardians)?;
        if !is_frozen(&env) {
            return Err(WalletError::NotFrozen);
        }
        clear_freeze(&env);
        bump(&env);
        Ok(())
    }

    /// W10. Uno o mas guardianes abren una recuperacion: reemplazar todos los firmantes por
    /// `new_key`, que firma su prueba de posesion como en `add_signer`. Los votos de quienes
    /// la abren cuentan; si ya llegan al quorum, empieza la espera.
    ///
    /// Hay una propuesta a la vez. Una propuesta vigente solo la sustituye el quorum: asi un
    /// guardian solo no bloquea la recuperacion abriendo propuestas una y otra vez.
    pub fn start_recovery(
        env: Env,
        guardians: Vec<Address>,
        new_key: BytesN<32>,
        possession: BytesN<64>,
        expires: u32,
    ) -> Result<BytesN<32>, WalletError> {
        let n = guardians_sign(&env, &guardians)?;
        let t = guardian_threshold(&env);
        if t == 0 {
            return Err(WalletError::NotEnoughGuardians);
        }
        let st = env.storage().instance();
        let now = env.ledger().sequence();
        let current: Option<Recovery> = st.get(&DataKey::Recovery);
        if let Some(r) = current {
            let live = now < r.expires && r.guardian_epoch == guardian_epoch(&env);
            if live && n < t {
                return Err(WalletError::RecoveryActive);
            }
        }
        let min = now
            .checked_add(RECOVERY_DELAY + RECOVERY_MARGIN)
            .ok_or(WalletError::Overflow)?;
        let max = now.checked_add(RECOVERY_MAX_TTL).ok_or(WalletError::Overflow)?;
        if expires < min || expires > max {
            return Err(WalletError::InvalidExpiry);
        }
        let wallet = env.current_contract_address();
        // Aborta si la llave nueva no firmo.
        env.crypto().ed25519_verify(
            &new_key,
            &possession_message(&env, &wallet, &signer_id(&env, &new_key)).into(),
            &possession,
        );
        let nonce: u32 = st.get(&DataKey::RecoveryNonce).unwrap_or(0);
        st.set(&DataKey::RecoveryNonce, &nonce.checked_add(1).ok_or(WalletError::Overflow)?);
        let mut b = Bytes::from_slice(&env, RECOVERY_TAG);
        b.append(&new_key.clone().into());
        b.extend_from_array(&nonce.to_be_bytes());
        let id: BytesN<32> = env.crypto().sha256(&b).into();
        let ready_ledger = if n >= t {
            now.checked_add(RECOVERY_DELAY).ok_or(WalletError::Overflow)?
        } else {
            0
        };
        let r = Recovery {
            id: id.clone(),
            new_key,
            guardian_epoch: guardian_epoch(&env),
            votes: guardians,
            expires,
            ready_ledger,
        };
        st.set(&DataKey::Recovery, &r);
        bump(&env);
        Ok(id)
    }

    /// W11. Un guardian vota por la propuesta `proposal_id`. Al llegar al quorum empieza la
    /// espera; los votos que llegan despues no la reinician.
    pub fn approve_recovery(env: Env, guardian: Address, proposal_id: BytesN<32>) -> Result<(), WalletError> {
        if !guardian_list(&env).contains(&guardian) {
            return Err(WalletError::UnknownGuardian);
        }
        guardian.require_auth();
        let mut r = live_recovery(&env, &proposal_id)?;
        if r.votes.contains(&guardian) {
            return Err(WalletError::AlreadyVoted);
        }
        r.votes.push_back(guardian);
        if r.ready_ledger == 0 && r.votes.len() >= guardian_threshold(&env) {
            r.ready_ledger = env
                .ledger()
                .sequence()
                .checked_add(RECOVERY_DELAY)
                .ok_or(WalletError::Overflow)?;
        }
        env.storage().instance().set(&DataKey::Recovery, &r);
        bump(&env);
        Ok(())
    }

    /// W12. El dueno cancela la recuperacion en curso: su veto ante guardianes que intentan
    /// robar. Con la wallet congelada solo vale con dos credenciales distintas (D8, propuesta).
    pub fn cancel_recovery(env: Env) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let st = env.storage().instance();
        if !st.has(&DataKey::Recovery) {
            return Err(WalletError::UnknownProposal);
        }
        st.remove(&DataKey::Recovery);
        bump(&env);
        Ok(())
    }

    /// W13. El quorum de guardianes cancela la recuperacion en curso. Es la salida cuando el
    /// dueno no puede vetar durante un congelamiento.
    pub fn guardian_cancel_recovery(env: Env, guardians: Vec<Address>) -> Result<(), WalletError> {
        guardian_quorum(&env, &guardians)?;
        let st = env.storage().instance();
        if !st.has(&DataKey::Recovery) {
            return Err(WalletError::UnknownProposal);
        }
        st.remove(&DataKey::Recovery);
        bump(&env);
        Ok(())
    }

    /// W14. Termina la recuperacion: cualquiera, cumplida la espera. Reemplaza todos los
    /// firmantes por la llave nueva (peso 1, umbral 1), descongela, y deja sin efecto todo lo
    /// pendiente del dueno anterior (subidas de limite, escrows, bajas de guardianes y
    /// solicitudes de descongelar). El gasto ya hecho en el periodo se conserva.
    pub fn finish_recovery(env: Env, proposal_id: BytesN<32>) -> Result<(), WalletError> {
        let r = live_recovery(&env, &proposal_id)?;
        if r.ready_ledger == 0 || env.ledger().sequence() < r.ready_ledger {
            return Err(WalletError::NotReady);
        }
        let st = env.storage().instance();
        let mut map = Map::new(&env);
        map.set(signer_id(&env, &r.new_key), Signer { key: r.new_key, weight: 1 });
        st.set(&DataKey::Signers, &map);
        st.set(&DataKey::Threshold, &1u32);
        let epoch = owner_epoch(&env).checked_add(1).ok_or(WalletError::Overflow)?;
        st.set(&DataKey::OwnerEpoch, &epoch);
        clear_freeze(&env);
        st.remove(&DataKey::Recovery);
        bump(&env);
        Ok(())
    }

    /// W20. Crea una sesion para operar `escrow` (ya registrado) sin la firma del dueno en cada
    /// trade. Devuelve su id. Aplica ya: la sesion no puede sacar dinero fuera del escrow ni
    /// pasar de sus topes, y el dueno la revoca al instante.
    pub fn add_session(
        env: Env,
        key: BytesN<32>,
        escrow: Address,
        buyers: Vec<Address>,
        max_per_lock: i128,
        max_total: i128,
        max_timeout: u32,
        expires: u32,
    ) -> Result<BytesN<32>, WalletError> {
        let me = env.current_contract_address();
        me.require_auth();
        let st = env.storage().instance();
        let rule: EscrowRule = st.get(&DataKey::Escrow(escrow.clone())).ok_or(WalletError::UnknownEscrow)?;
        if buyers.is_empty() || buyers.len() > MAX_SESSION_LIST {
            return Err(WalletError::InvalidSession);
        }
        let mut seen: Vec<Address> = Vec::new(&env);
        for b in buyers.iter() {
            if b == me || seen.contains(&b) {
                return Err(WalletError::InvalidSession);
            }
            seen.push_back(b);
        }
        if max_per_lock <= 0 || max_total < max_per_lock {
            return Err(WalletError::InvalidSession);
        }
        if max_timeout == 0 || max_timeout > MAX_LOCK_TIMEOUT_MINUTES {
            return Err(WalletError::InvalidSession);
        }
        let now = env.ledger().sequence();
        let max = now.checked_add(SESSION_MAX_TTL).ok_or(WalletError::Overflow)?;
        if expires <= now || expires > max {
            return Err(WalletError::InvalidExpiry);
        }
        // Una llave del dueno no puede ser tambien llave de sesion.
        for signer in signers(&env)?.values() {
            if signer.key == key {
                return Err(WalletError::KeyUsed);
            }
        }
        let id = session_id(&env, &key);
        let mut map = sessions(&env);
        // Las vencidas o del dueno anterior no ocupan lugar.
        let epoch = owner_epoch(&env);
        for (k, v) in map.clone().iter() {
            if v.expires <= now || v.owner_epoch != epoch {
                map.remove(k);
            }
        }
        if map.contains_key(id.clone()) {
            return Err(WalletError::KeyUsed);
        }
        if map.len() >= MAX_SESSIONS {
            return Err(WalletError::TooManySessions);
        }
        let session = Session {
            key,
            escrow,
            rule,
            buyers,
            max_per_lock,
            max_total,
            spent: 0,
            max_timeout,
            expires,
            owner_epoch: epoch,
            declines: Vec::new(&env),
        };
        map.set(id.clone(), session);
        st.set(&DataKey::Sessions, &map);
        bump(&env);
        Ok(id)
    }

    /// W20. Revoca una sesion. Aplica ya, tambien con la wallet congelada.
    pub fn revoke_session(env: Env, id: BytesN<32>) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let mut map = sessions(&env);
        if map.remove(id).is_none() {
            return Err(WalletError::UnknownSession);
        }
        env.storage().instance().set(&DataKey::Sessions, &map);
        bump(&env);
        Ok(())
    }

    /// W20. Permite que la sesion `id` haga `decline` de `trade_id`, una vez. Sin esto una
    /// llave de sesion filtrada podria renunciar a cobros de la wallet.
    pub fn allow_session_decline(env: Env, id: BytesN<32>, trade_id: BytesN<32>) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let mut map = sessions(&env);
        let mut session = map.get(id.clone()).ok_or(WalletError::UnknownSession)?;
        if !session.declines.contains(&trade_id) {
            if session.declines.len() >= MAX_SESSION_LIST {
                return Err(WalletError::InvalidSession);
            }
            session.declines.push_back(trade_id);
        }
        map.set(id, session);
        env.storage().instance().set(&DataKey::Sessions, &map);
        bump(&env);
        Ok(())
    }

    /// W21. Programa un upgrade al WASM `hash` (ya subido a la red). Se aplica con
    /// `apply_upgrade` despues de `UPGRADE_DELAY`. Sin espera, el umbral podria cambiar al
    /// instante el codigo que impone todas las demas esperas.
    pub fn schedule_upgrade(env: Env, hash: BytesN<32>) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let ready_ledger = env
            .ledger()
            .sequence()
            .checked_add(UPGRADE_DELAY)
            .ok_or(WalletError::Overflow)?;
        let pending = PendingUpgrade { hash, ready_ledger, owner_epoch: owner_epoch(&env) };
        env.storage().instance().set(&DataKey::PendingUpgrade, &pending);
        bump(&env);
        Ok(())
    }

    /// W21. Cancela el upgrade programado. Aplica ya, tambien con la wallet congelada.
    pub fn cancel_upgrade(env: Env) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let st = env.storage().instance();
        if !st.has(&DataKey::PendingUpgrade) {
            return Err(WalletError::NothingPending);
        }
        st.remove(&DataKey::PendingUpgrade);
        bump(&env);
        Ok(())
    }

    /// W21. Aplica el upgrade programado, ya cumplida la espera. Cualquiera, pero con el hash
    /// exacto. No con la wallet congelada ni con una recuperacion en curso, ni si lo programo
    /// el dueno anterior a una recuperacion.
    pub fn apply_upgrade(env: Env, hash: BytesN<32>) -> Result<(), WalletError> {
        not_frozen(&env)?;
        no_live_recovery(&env)?;
        let st = env.storage().instance();
        let p: PendingUpgrade = st.get(&DataKey::PendingUpgrade).ok_or(WalletError::NothingPending)?;
        if p.owner_epoch != owner_epoch(&env) {
            return Err(WalletError::Stale);
        }
        if p.hash != hash {
            return Err(WalletError::UpgradeMismatch);
        }
        if env.ledger().sequence() < p.ready_ledger {
            return Err(WalletError::NotReady);
        }
        st.remove(&DataKey::PendingUpgrade);
        bump(&env);
        env.deployer().update_current_contract_wasm(hash);
        Ok(())
    }

    /// Lectura: el upgrade programado, si hay.
    pub fn pending_upgrade(env: Env) -> Option<PendingUpgrade> {
        env.storage().instance().get(&DataKey::PendingUpgrade)
    }

    /// W20. Retira el permiso de `decline` de `trade_id` (por ejemplo, si el dueno ya resolvio
    /// ese trade). Aplica ya.
    pub fn disallow_session_decline(env: Env, id: BytesN<32>, trade_id: BytesN<32>) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        let mut map = sessions(&env);
        let mut session = map.get(id.clone()).ok_or(WalletError::UnknownSession)?;
        let i = session.declines.first_index_of(&trade_id).ok_or(WalletError::NothingPending)?;
        session.declines.remove(i);
        map.set(id, session);
        env.storage().instance().set(&DataKey::Sessions, &map);
        bump(&env);
        Ok(())
    }

    /// Lectura: una sesion.
    pub fn session(env: Env, id: BytesN<32>) -> Option<Session> {
        sessions(&env).get(id)
    }

    /// Lectura: la propuesta de recuperacion en curso, si hay.
    pub fn recovery(env: Env) -> Option<Recovery> {
        env.storage().instance().get(&DataKey::Recovery)
    }

    /// Lectura: si la wallet esta congelada.
    pub fn frozen(env: Env) -> bool {
        is_frozen(&env)
    }

    /// Lectura: guardianes.
    pub fn guardians(env: Env) -> Vec<Address> {
        guardian_list(&env)
    }

    /// Lectura: quorum de guardianes.
    pub fn guardian_threshold(env: Env) -> u32 {
        guardian_threshold(&env)
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

    /// Lectura: regla de un escrow registrado.
    pub fn escrow(env: Env, escrow: Address) -> Option<EscrowRule> {
        env.storage().instance().get(&DataKey::Escrow(escrow))
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
        auth_contexts: Vec<Context>,
    ) -> Result<(), WalletError> {
        if signatures.is_empty() {
            return Err(WalletError::NoProofs);
        }
        if signatures.len() > MAX_SIGNERS {
            return Err(WalletError::TooManyProofs);
        }
        if let Some(Proof::Session(p)) = signatures.first() {
            if signatures.len() != 1 {
                return Err(WalletError::MixedProofs);
            }
            check_session(&env, &signature_payload, &p, &auth_contexts)?;
            check_contexts(&env, &auth_contexts)?;
            bump(&env);
            return Ok(());
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
                Proof::Session(_) => return Err(WalletError::MixedProofs),
            }
        }
        if weight < threshold(&env)? {
            return Err(WalletError::InsufficientWeight);
        }
        if is_frozen(&env) {
            check_frozen(&env, &auth_contexts, seen.len())?;
        }
        check_contexts(&env, &auth_contexts)?;
        bump(&env);
        Ok(())
    }
}

/// W15. Con la wallet congelada, el dueno solo puede llamar a la propia wallet para pedir
/// descongelar (`request_unfreeze`), revocar una sesion (`revoke_session`), cancelar un
/// upgrade (`cancel_upgrade`) o, con dos credenciales distintas, para cancelar una
/// recuperacion (`cancel_recovery`, D8): una sola llave robada no veta a los guardianes.
fn check_frozen(env: &Env, contexts: &Vec<Context>, credentials: u32) -> Result<(), WalletError> {
    let me = env.current_contract_address();
    let request_unfreeze = Symbol::new(env, "request_unfreeze");
    let cancel_recovery = Symbol::new(env, "cancel_recovery");
    let revoke_session = Symbol::new(env, "revoke_session");
    let cancel_upgrade = Symbol::new(env, "cancel_upgrade");
    for ctx in contexts.iter() {
        match ctx {
            Context::Contract(c) if c.contract == me && c.fn_name == request_unfreeze => {}
            Context::Contract(c) if c.contract == me && c.fn_name == revoke_session => {}
            Context::Contract(c) if c.contract == me && c.fn_name == cancel_upgrade => {}
            Context::Contract(c) if c.contract == me && c.fn_name == cancel_recovery && credentials >= 2 => {}
            _ => return Err(WalletError::Frozen),
        }
    }
    Ok(())
}

/// W20. Modo sesion: la sesion existe, no vencio, es del dueno actual, la wallet no esta
/// congelada, la firma es valida, y cada contexto es una intencion permitida en su escrow.
/// `check_contexts` valida despues el `lock` contra la regla del escrow y cobra el limite.
fn check_session(env: &Env, payload: &Hash<32>, p: &SessionProof, contexts: &Vec<Context>) -> Result<(), WalletError> {
    let mut map = sessions(env);
    let mut s = map.get(p.id.clone()).ok_or(WalletError::UnknownSession)?;
    if env.ledger().sequence() >= s.expires {
        return Err(WalletError::SessionExpired);
    }
    if s.owner_epoch != owner_epoch(env) {
        return Err(WalletError::Stale);
    }
    if is_frozen(env) {
        return Err(WalletError::Frozen);
    }
    let rule: EscrowRule = env
        .storage()
        .instance()
        .get(&DataKey::Escrow(s.escrow.clone()))
        .ok_or(WalletError::UnknownEscrow)?;
    if rule != s.rule {
        return Err(WalletError::Stale);
    }
    let me = env.current_contract_address();
    let msg: Bytes = message(env, &me, MODE_SESSION, payload).into();
    // Aborta si la firma no es valida.
    env.crypto().ed25519_verify(&s.key, &msg, &p.sig);
    let lock = Symbol::new(env, "lock");
    let release = Symbol::new(env, "release");
    let decline = Symbol::new(env, "decline");
    let transfer = Symbol::new(env, "transfer");
    let mut locked = false;
    for (i, ctx) in contexts.iter().enumerate() {
        let c = match ctx {
            Context::Contract(c) => c,
            _ => return Err(WalletError::SessionDenied),
        };
        if c.contract == s.escrow && c.fn_name == lock {
            if i != 0 || contexts.len() != 2 {
                return Err(WalletError::SessionDenied);
            }
            let buyer: Address = arg(env, &c.args, 1)?;
            let amount: i128 = arg(env, &c.args, 2)?;
            let fee: i128 = arg(env, &c.args, 3)?;
            let timeout: u32 = arg(env, &c.args, 5)?;
            if !s.buyers.contains(&buyer) || timeout > s.max_timeout {
                return Err(WalletError::SessionDenied);
            }
            if amount <= 0 || fee < 0 {
                return Err(WalletError::EscrowLockInvalid);
            }
            let total = amount.checked_add(fee).ok_or(WalletError::Overflow)?;
            let spent = s.spent.checked_add(total).ok_or(WalletError::Overflow)?;
            if total > s.max_per_lock || spent > s.max_total {
                return Err(WalletError::SessionLimit);
            }
            s.spent = spent;
            locked = true;
        } else if c.contract == s.escrow && c.fn_name == release {
        } else if c.contract == s.escrow && c.fn_name == decline {
            let trade_id: BytesN<32> = arg(env, &c.args, 0)?;
            let k = s.declines.first_index_of(&trade_id).ok_or(WalletError::SessionDenied)?;
            s.declines.remove(k);
        } else if locked && i == 1 && c.fn_name == transfer {
            // El transfer hijo del lock: check_contexts verifica token, destino e importe.
        } else {
            return Err(WalletError::SessionDenied);
        }
    }
    map.set(p.id.clone(), s);
    env.storage().instance().set(&DataKey::Sessions, &map);
    Ok(())
}

fn arg<T: TryFromVal<Env, Val>>(env: &Env, args: &Vec<Val>, i: u32) -> Result<T, WalletError> {
    let v = args.get(i).ok_or(WalletError::BadArgs)?;
    T::try_from_val(env, &v).map_err(|_| WalletError::BadArgs)
}

/// W19. Reglas de tokens y escrows sobre lo que la wallet esta autorizando.
///
/// - `approve` se rechaza siempre: un permiso de gasto lo usaria un tercero
///   (`transfer_from`, `burn_from`) sin pasar por esta wallet ni por su limite.
/// - `transfer` y `burn` desde esta wallet suman al gasto del periodo del token, si tiene limite.
///   Si el token no tiene limite y el destino no es un escrow registrado, no se leen sus
///   argumentos: asi pasan un NFT o un destino muxed.
/// - Un `lock` en un escrow registrado solo se autoriza si la autorizacion es **exactamente**
///   `[escrow.lock, token.transfer(esta wallet, escrow, amount + platform_fee)]`, con el `lock`
///   valido (`check_lock`). Cualquier otra transferencia a un escrow registrado se rechaza: no
///   crea trade y el dinero se quedaria atorado. Con mas contextos alrededor, un contrato
///   intermedio podria llamar solo al `transfer` y nunca al `lock`.
/// - El `lock` cuenta contra el limite como cualquier gasto (D9 sigue abierta).
fn check_contexts(env: &Env, contexts: &Vec<Context>) -> Result<(), WalletError> {
    let me = env.current_contract_address();
    let transfer = Symbol::new(env, "transfer");
    let burn = Symbol::new(env, "burn");
    let approve = Symbol::new(env, "approve");
    let lock = Symbol::new(env, "lock");
    let st = env.storage().instance();
    // La transferencia que corresponde al `lock` de un escrow registrado: (token, escrow, importe).
    let mut expected: Option<(Address, Address, i128)> = None;
    for (i, ctx) in contexts.iter().enumerate() {
        if let Context::Contract(c) = ctx {
            if c.fn_name == lock {
                let rule: Option<EscrowRule> = st.get(&DataKey::Escrow(c.contract.clone()));
                if let Some(rule) = rule {
                    if i != 0 || contexts.len() != 2 || expected.is_some() {
                        return Err(WalletError::EscrowTransferMismatch);
                    }
                    expected = Some(check_lock(env, &me, &c, &rule)?);
                }
            }
        }
    }
    for ctx in contexts.iter() {
        let c: ContractContext = match ctx {
            Context::Contract(c) => c,
            _ => continue,
        };
        if c.contract == me {
            continue;
        }
        if c.fn_name == approve {
            return Err(WalletError::ApproveDenied);
        }
        let limited = st.has(&DataKey::Limit(c.contract.clone()));
        if c.fn_name == transfer {
            let from: Address = arg(env, &c.args, 0)?;
            if from != me {
                continue;
            }
            // Un destino muxed (o que no es una direccion) no puede ser un escrow registrado.
            let to: Option<Address> = c.args.get(1).and_then(|v| Address::try_from_val(env, &v).ok());
            let to_escrow = match &to {
                Some(to) => st.has(&DataKey::Escrow(to.clone())),
                None => false,
            };
            if !limited && !to_escrow {
                continue;
            }
            let amount: i128 = arg(env, &c.args, 2)?;
            if to_escrow {
                let key = (c.contract.clone(), to.ok_or(WalletError::BadArgs)?, amount);
                if expected.take() != Some(key) {
                    return Err(WalletError::EscrowTransferMismatch);
                }
            }
            if limited {
                charge(env, &c.contract, amount)?;
            }
        } else if c.fn_name == burn {
            let from: Address = arg(env, &c.args, 0)?;
            if from != me || !limited {
                continue;
            }
            charge(env, &c.contract, arg(env, &c.args, 1)?)?;
        }
    }
    // Un `lock` valido sin su `transfer` exacto no se autoriza.
    if expected.is_some() {
        return Err(WalletError::EscrowTransferMismatch);
    }
    Ok(())
}

/// Valida un `lock(seller, buyer, amount, platform_fee, secret_hash, timeout_minutes)` en un
/// escrow registrado y devuelve la transferencia que le corresponde.
fn check_lock(env: &Env, me: &Address, c: &ContractContext, rule: &EscrowRule) -> Result<(Address, Address, i128), WalletError> {
    if c.args.len() != 6 {
        return Err(WalletError::EscrowLockInvalid);
    }
    let seller: Address = arg(env, &c.args, 0)?;
    let buyer: Address = arg(env, &c.args, 1)?;
    let amount: i128 = arg(env, &c.args, 2)?;
    let fee: i128 = arg(env, &c.args, 3)?;
    let _secret_hash: BytesN<32> = arg(env, &c.args, 4)?;
    let timeout: u32 = arg(env, &c.args, 5)?;
    if seller != *me || buyer == *me || amount <= 0 || fee < 0 {
        return Err(WalletError::EscrowLockInvalid);
    }
    if timeout == 0 || timeout > MAX_LOCK_TIMEOUT_MINUTES {
        return Err(WalletError::EscrowLockInvalid);
    }
    let max_fee = amount
        .checked_mul(rule.fee_bps_max as i128)
        .ok_or(WalletError::Overflow)?
        / 10_000;
    if fee > max_fee {
        return Err(WalletError::EscrowLockInvalid);
    }
    let total = amount.checked_add(fee).ok_or(WalletError::Overflow)?;
    Ok((rule.token.clone(), c.contract.clone(), total))
}

/// Suma `amount` al gasto del periodo de `token`, si tiene limite.
fn charge(env: &Env, token: &Address, amount: i128) -> Result<(), WalletError> {
    if amount < 0 {
        return Err(WalletError::BadArgs);
    }
    let st = env.storage().instance();
    let limit: i128 = match st.get(&DataKey::Limit(token.clone())) {
        Some(l) => l,
        None => return Ok(()),
    };
    let now = env.ledger().sequence();
    let mut s: Spent = st
        .get(&DataKey::Spent(token.clone()))
        .unwrap_or(Spent { period_start: now, amount: 0 });
    if now >= s.period_start.saturating_add(PERIOD_LEDGERS) {
        s = Spent { period_start: now, amount: 0 };
    }
    s.amount = s.amount.checked_add(amount).ok_or(WalletError::Overflow)?;
    if s.amount > limit {
        return Err(WalletError::LimitExceeded);
    }
    st.set(&DataKey::Spent(token.clone()), &s);
    Ok(())
}

mod test;
