//! Fabrica de smart wallets de MicoPay (F1–F3). Solo testnet.
//!
//! Despliega wallets del WASM fijado al crearla, con una direccion que depende solo de la
//! configuracion inicial: quien la cree primero no puede cambiar el firmante. Sin admin.
#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, xdr::ToXdr, Address, BytesN, Env};

/// Configuracion inicial de una wallet. Los plazos son constantes del WASM mientras D5 siga
/// abierta; si se vuelven configurables entran aqui, y con ellos en el `salt`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// Llave publica ed25519 del primer firmante (peso 1, umbral 1).
    pub owner: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    WasmHash,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum FactoryError {
    InvalidConfig = 1,
    AlreadyCreated = 2,
}

/// Valida `config` y devuelve el `salt`: `sha256(XDR de la config)`. `create_account` y
/// `address_of` usan esta misma funcion, asi rechazan lo mismo y calculan lo mismo.
fn salt(env: &Env, config: &Config) -> Result<BytesN<32>, FactoryError> {
    if config.owner.to_array() == [0u8; 32] {
        return Err(FactoryError::InvalidConfig);
    }
    Ok(env.crypto().sha256(&config.clone().to_xdr(env)).into())
}

#[contract]
pub struct SmartWalletFactory;

#[contractimpl]
impl SmartWalletFactory {
    /// F1. Guarda el WASM de las wallets. No se puede cambiar: la fabrica no toca wallets ya
    /// creadas, y cada wallet hace sus propios upgrades (W21).
    pub fn __constructor(env: Env, wasm_hash: BytesN<32>) {
        env.storage().instance().set(&DataKey::WasmHash, &wasm_hash);
    }

    /// F2. Crea la wallet de `config`. Cualquiera la puede crear: la direccion y el firmante
    /// salen de la config, asi que crearla por otro no le da nada.
    pub fn create_account(env: Env, config: Config) -> Result<Address, FactoryError> {
        let salt = salt(&env, &config)?;
        let deployer = env.deployer().with_current_contract(salt);
        let address = deployer.deployed_address();
        if address.exists() {
            return Err(FactoryError::AlreadyCreated);
        }
        let hash: BytesN<32> = env.storage().instance().get(&DataKey::WasmHash).unwrap();
        Ok(deployer.deploy_v2(hash, (config.owner,)))
    }

    /// F3. La direccion que tendra la wallet de `config`, antes de crearla (para prefondearla).
    pub fn address_of(env: Env, config: Config) -> Result<Address, FactoryError> {
        let salt = salt(&env, &config)?;
        Ok(env.deployer().with_current_contract(salt).deployed_address())
    }

    /// Lectura: el WASM de las wallets.
    pub fn wasm_hash(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::WasmHash).unwrap()
    }
}

#[cfg(test)]
mod test;
