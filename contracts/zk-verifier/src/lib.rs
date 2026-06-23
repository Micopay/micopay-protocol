#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracterror, symbol_short,
    Address, Bytes, Env, Map, Symbol,
};
use ultrahonk_soroban_verifier::{UltraHonkVerifier, VkLoadError};

const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const VK_MAP_KEY: Symbol = symbol_short!("VK_MAP");
const ROOT_KEY: Symbol = symbol_short!("REP_ROOT");

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ZkError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    UnknownCircuit = 4,
    VkInvalidLength = 5,
    VkInvalidParameters = 6,
    ProofParseError = 7,
    VerificationFailed = 8,
    ReputationRootNotSet = 9,
    NullifierAlreadyUsed = 10,
}

#[contract]
pub struct ZkVerifierRegistry;

#[contractimpl]
impl ZkVerifierRegistry {
    /// Initialize the registry. Can only be called once.
    pub fn init(env: Env, admin: Address) -> Result<(), ZkError> {
        if env.storage().instance().has(&ADMIN_KEY) {
            return Err(ZkError::AlreadyInitialized);
        }
        env.storage().instance().set(&ADMIN_KEY, &admin);
        Ok(())
    }

    /// Register a verification key for a circuit. Admin only.
    /// circuit_id: Symbol like "poseidon_preimage" or "reputation_v1"
    /// vk: raw VK bytes from `bb write_vk`
    pub fn register_circuit(env: Env, circuit_id: Symbol, vk: Bytes) -> Result<(), ZkError> {
        Self::require_admin(&env)?;

        // Validate VK bytes parse correctly before storing
        UltraHonkVerifier::new(&env, &vk).map_err(|e| match e {
            VkLoadError::WrongLength => ZkError::VkInvalidLength,
            VkLoadError::InvalidParameters => ZkError::VkInvalidParameters,
        })?;

        let mut map: Map<Symbol, Bytes> = env
            .storage()
            .instance()
            .get(&VK_MAP_KEY)
            .unwrap_or_else(|| Map::new(&env));

        map.set(circuit_id, vk);
        env.storage().instance().set(&VK_MAP_KEY, &map);
        Ok(())
    }

    /// Set the on-chain reputation Merkle root. Admin only.
    pub fn set_reputation_root(env: Env, root: Bytes) -> Result<(), ZkError> {
        Self::require_admin(&env)?;
        env.storage().instance().set(&ROOT_KEY, &root);
        Ok(())
    }

    /// Get the current reputation Merkle root.
    pub fn get_reputation_root(env: Env) -> Result<Bytes, ZkError> {
        env.storage()
            .instance()
            .get(&ROOT_KEY)
            .ok_or(ZkError::ReputationRootNotSet)
    }

    /// Verify an UltraHonk proof for the given circuit.
    ///
    /// circuit_id:    Symbol matching a registered VK
    /// public_inputs: raw public input bytes (field elements, 32 bytes each, big-endian)
    /// proof:         raw UltraHonk proof bytes (PROOF_BYTES = 456 * 32 = 14592)
    ///
    /// Returns Ok(()) if valid, Err(VerificationFailed) otherwise.
    pub fn verify(
        env: Env,
        circuit_id: Symbol,
        public_inputs: Bytes,
        proof: Bytes,
    ) -> Result<(), ZkError> {
        let vk = Self::get_vk(&env, &circuit_id)?;
        let verifier = UltraHonkVerifier::new(&env, &vk).map_err(|e| match e {
            VkLoadError::WrongLength => ZkError::VkInvalidLength,
            VkLoadError::InvalidParameters => ZkError::VkInvalidParameters,
        })?;
        verifier
            .verify(&env, &proof, &public_inputs)
            .map_err(|_| ZkError::VerificationFailed)
    }

    /// Verify a proof AND record its nullifier to prevent replay.
    /// For reputation_v1: public_inputs has 4 fields (128 bytes).
    /// The nullifier is field index 3 → bytes [96..128].
    /// A nullifier can only be used once per ZkVerifierRegistry instance.
    ///
    /// Use this instead of `verify` for circuits that carry a nullifier field.
    pub fn verify_unique(
        env: Env,
        circuit_id: Symbol,
        public_inputs: Bytes,
        proof: Bytes,
    ) -> Result<(), ZkError> {
        // Extract nullifier (bytes 96..128 = field index 3) before verification
        // so a bad proof cannot sneak a nullifier into the used set.
        if public_inputs.len() < 128 {
            return Err(ZkError::ProofParseError);
        }
        let mut nullifier_arr = [0u8; 32];
        for i in 0..32u32 {
            nullifier_arr[i as usize] = public_inputs.get(96 + i).unwrap_or(0);
        }
        let nullifier = Bytes::from_array(&env, &nullifier_arr);

        // Reject replayed nullifiers before doing expensive crypto
        if env.storage().persistent().has(&nullifier) {
            return Err(ZkError::NullifierAlreadyUsed);
        }

        // Run the full UltraHonk verification
        let vk = Self::get_vk(&env, &circuit_id)?;
        let verifier = UltraHonkVerifier::new(&env, &vk).map_err(|e| match e {
            VkLoadError::WrongLength => ZkError::VkInvalidLength,
            VkLoadError::InvalidParameters => ZkError::VkInvalidParameters,
        })?;
        verifier
            .verify(&env, &proof, &public_inputs)
            .map_err(|_| ZkError::VerificationFailed)?;

        // Record nullifier only after proof is valid
        env.storage().persistent().set(&nullifier, &true);
        env.storage()
            .persistent()
            .extend_ttl(&nullifier, 100_000, 200_000);

        Ok(())
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    fn require_admin(env: &Env) -> Result<(), ZkError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&ADMIN_KEY)
            .ok_or(ZkError::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }

    fn get_vk(env: &Env, circuit_id: &Symbol) -> Result<Bytes, ZkError> {
        let map: Map<Symbol, Bytes> = env
            .storage()
            .instance()
            .get(&VK_MAP_KEY)
            .ok_or(ZkError::UnknownCircuit)?;
        map.get(circuit_id.clone()).ok_or(ZkError::UnknownCircuit)
    }
}

#[cfg(test)]
mod test;
