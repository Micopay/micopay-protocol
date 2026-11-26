#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Bytes,
    BytesN, Env,
};

const DAY_IN_LEDGERS: u32 = 17_280; // ~5s por ledger
const BUMP_TO: u32 = DAY_IN_LEDGERS * 60; // ~60 dias

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    AlreadyClaimed = 3,
    InvalidCode = 4,
    InvalidAmount = 5,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Amount,
    CodeHash,
    Claimed,
    ClaimedBy,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct State {
    pub admin: Address,
    pub token: Address,
    pub amount: i128,
    pub code_hash: BytesN<32>,
    pub claimed: bool,
    pub claimed_by: Option<Address>,
    pub balance: i128,
}

#[contract]
pub struct BovedaShipIt;

#[contractimpl]
impl BovedaShipIt {
    /// Configura la boveda al desplegar.
    /// `code_hash` es sha256 del codigo secreto (nunca se guarda el texto plano).
    pub fn __constructor(env: Env, admin: Address, token: Address, amount: i128, code_hash: BytesN<32>) {
        admin.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let store = env.storage().instance();
        store.set(&DataKey::Admin, &admin);
        store.set(&DataKey::Token, &token);
        store.set(&DataKey::Amount, &amount);
        store.set(&DataKey::CodeHash, &code_hash);
        store.set(&DataKey::Claimed, &false);
        store.extend_ttl(DAY_IN_LEDGERS, BUMP_TO);
    }

    /// Cualquiera puede depositar los XLM en la boveda (normalmente el admin).
    pub fn fund(env: Env, from: Address) {
        from.require_auth();
        let store = env.storage().instance();
        let token_id: Address = store
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        let amount: i128 = store.get(&DataKey::Amount).unwrap();
        token::Client::new(&env, &token_id).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
        store.extend_ttl(DAY_IN_LEDGERS, BUMP_TO);
    }

    /// Libera los fondos a quien presente el codigo correcto. Solo se puede una vez.
    pub fn claim(env: Env, claimant: Address, code: Bytes) -> i128 {
        claimant.require_auth();
        let store = env.storage().instance();

        if store.get(&DataKey::Claimed).unwrap_or(false) {
            panic_with_error!(&env, Error::AlreadyClaimed);
        }

        let expected: BytesN<32> = store
            .get(&DataKey::CodeHash)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));

        let given: BytesN<32> = env.crypto().sha256(&code).into();
        if given != expected {
            panic_with_error!(&env, Error::InvalidCode);
        }

        let token_id: Address = store.get(&DataKey::Token).unwrap();
        let amount: i128 = store.get(&DataKey::Amount).unwrap();

        token::Client::new(&env, &token_id).transfer(
            &env.current_contract_address(),
            &claimant,
            &amount,
        );

        store.set(&DataKey::Claimed, &true);
        store.set(&DataKey::ClaimedBy, &Some(claimant.clone()));
        store.extend_ttl(DAY_IN_LEDGERS, BUMP_TO);

        amount
    }

    /// Re-arma la boveda para repetir la demo (solo admin).
    pub fn reset(env: Env) {
        let store = env.storage().instance();
        let admin: Address = store
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();
        store.set(&DataKey::Claimed, &false);
        store.remove(&DataKey::ClaimedBy);
        store.extend_ttl(DAY_IN_LEDGERS, BUMP_TO);
    }

    /// El admin recupera lo que quede en la boveda (limpieza post-demo).
    pub fn withdraw(env: Env, to: Address) {
        let store = env.storage().instance();
        let admin: Address = store
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        admin.require_auth();
        let token_id: Address = store.get(&DataKey::Token).unwrap();
        let client = token::Client::new(&env, &token_id);
        let balance = client.balance(&env.current_contract_address());
        if balance > 0 {
            client.transfer(&env.current_contract_address(), &to, &balance);
        }
        store.extend_ttl(DAY_IN_LEDGERS, BUMP_TO);
    }

    /// Estado publico para la pantalla de reclamo.
    pub fn state(env: Env) -> State {
        let store = env.storage().instance();
        let token_id: Address = store
            .get(&DataKey::Token)
            .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
        let amount: i128 = store.get(&DataKey::Amount).unwrap();
        let token_client = token::Client::new(&env, &token_id);
        State {
            admin: store.get(&DataKey::Admin).unwrap(),
            token: token_id.clone(),
            amount,
            code_hash: store.get(&DataKey::CodeHash).unwrap(),
            claimed: store.get(&DataKey::Claimed).unwrap_or(false),
            claimed_by: store.get(&DataKey::ClaimedBy).unwrap_or(None),
            balance: token_client.balance(&env.current_contract_address()),
        }
    }

    /// Hash que espera el contrato para un codigo dado (util para la UI).
    pub fn code_hash(env: Env, code: Bytes) -> BytesN<32> {
        env.crypto().sha256(&code).into()
    }
}
