//! Smart account minima para el spike de labs: una cuenta de contrato (`C…`) con un
//! solo firmante ed25519. Sirve para probar que el escrow real acepta una cuenta de
//! contrato como vendedor y como comprador, sin cambiar el escrow.
//!
//! Solo testnet. No es la smart wallet del producto: no tiene recuperacion, passkey
//! ni limites. El firmante ed25519 aisla la pregunta del escrow; el passkey es otro spike.
#![no_std]

use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    BytesN, Env, Vec,
};

const TTL_MIN: u32 = 17_280;
const TTL_EXTEND: u32 = 518_400;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Owner,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AccountError {
    NotInitialized = 1,
}

#[contract]
pub struct SmartAccount;

#[contractimpl]
impl SmartAccount {
    /// Guarda la llave publica ed25519 que firma por la cuenta.
    pub fn __constructor(env: Env, owner: BytesN<32>) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
    }

    pub fn owner(env: Env) -> Result<BytesN<32>, AccountError> {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(AccountError::NotInitialized)
    }
}

#[contractimpl]
impl CustomAccountInterface for SmartAccount {
    type Signature = BytesN<64>;
    type Error = AccountError;

    /// Soroban llama a esta funcion cuando un contrato pide `require_auth` de esta cuenta.
    /// La firma tiene que ser del dueno sobre el hash que arma Soroban; si no, aborta.
    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: BytesN<64>,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), AccountError> {
        let owner: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(AccountError::NotInitialized)?;
        env.crypto()
            .ed25519_verify(&owner, &signature_payload.into(), &signature);
        env.storage().instance().extend_ttl(TTL_MIN, TTL_EXTEND);
        Ok(())
    }
}

mod test;
