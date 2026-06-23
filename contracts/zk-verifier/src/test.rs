#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Env};

fn make_env() -> Env {
    Env::default()
}

fn deploy_and_init(env: &Env) -> (ZkVerifierRegistryClient, Address) {
    let admin = Address::generate(env);
    let contract_id = env.register(ZkVerifierRegistry, ());
    let client = ZkVerifierRegistryClient::new(env, &contract_id);
    env.mock_all_auths();
    client.init(&admin).expect("init should succeed");
    (client, admin)
}

#[test]
fn test_init_sets_admin() {
    let env = make_env();
    let (client, admin) = deploy_and_init(&env);
    // Second init must return AlreadyInitialized
    let result = client.try_init(&admin);
    assert!(result.is_err(), "double init should return error");
}

#[test]
fn test_register_requires_auth() {
    let env = make_env();
    let (client, _) = deploy_and_init(&env);
    // Without mocked auth a second time, register must fail
    env.mock_auths(&[]);
    let circuit_id = Symbol::new(&env, "poseidon_v1");
    let vk = Bytes::from_slice(&env, &[0xabu8; 1764]);
    let result = client.try_register_circuit(&circuit_id, &vk);
    assert!(result.is_err(), "register without auth should fail");
}

#[test]
fn test_reputation_root_roundtrip() {
    let env = make_env();
    let (client, _) = deploy_and_init(&env);
    env.mock_all_auths();

    let root = Bytes::from_slice(&env, &[0xffu8; 32]);
    client.set_reputation_root(&root).expect("set should succeed");

    let got = client.get_reputation_root().expect("get should succeed");
    assert_eq!(got, root);
}

#[test]
fn test_verify_unknown_circuit_returns_error() {
    let env = make_env();
    let (client, _) = deploy_and_init(&env);

    let bad_id = Symbol::new(&env, "no_such");
    let proof = Bytes::from_slice(&env, &[0u8; 14592]);
    let inputs = Bytes::from_slice(&env, &[0u8; 32]);

    let result = client.try_verify(&bad_id, &inputs, &proof);
    assert!(result.is_err(), "unknown circuit_id should return error");
}

#[test]
fn test_verify_unique_rejects_short_public_inputs() {
    let env = make_env();
    let (client, _) = deploy_and_init(&env);
    env.mock_all_auths();

    let circuit_id = Symbol::new(&env, "rep_v1");
    // Register a dummy VK so we get past UnknownCircuit
    let vk = Bytes::from_slice(&env, &[0xabu8; 1764]);
    client
        .register_circuit(&circuit_id, &vk)
        .expect("register should succeed");

    // Only 96 bytes — nullifier (bytes 96..128) is missing
    let short_inputs = Bytes::from_slice(&env, &[0u8; 96]);
    let proof = Bytes::from_slice(&env, &[0u8; 14592]);

    let result = client.try_verify_unique(&circuit_id, &short_inputs, &proof);
    assert!(result.is_err(), "short public_inputs should return error");
    // Should be ProofParseError (code 7)
    let err = result.unwrap_err().unwrap();
    assert_eq!(err, ZkError::ProofParseError);
}

#[test]
fn test_verify_unique_prevents_nullifier_replay() {
    let env = make_env();
    let (client, _) = deploy_and_init(&env);
    env.mock_all_auths();

    let circuit_id = Symbol::new(&env, "rep_v1");
    // Dummy VK — verification will fail (invalid VK), but nullifier logic
    // runs BEFORE the expensive crypto call, so we test replay rejection
    // via the ProofParseError path with 128-byte inputs.
    // For a true replay test we'd need a real VK; here we exercise the
    // nullifier-already-used branch by manually setting the persistent key.
    let nullifier_bytes = [0xbbu8; 32];
    let nullifier = Bytes::from_slice(&env, &nullifier_bytes);
    // Simulate a prior successful verify_unique by writing the nullifier
    env.storage().persistent().set(&nullifier, &true);

    // Build 128-byte public_inputs with our nullifier at bytes [96..128]
    let mut inputs_arr = [0u8; 128];
    inputs_arr[96..128].copy_from_slice(&nullifier_bytes);
    let inputs = Bytes::from_slice(&env, &inputs_arr);
    let proof = Bytes::from_slice(&env, &[0u8; 14592]);

    // Register a dummy VK so we pass the UnknownCircuit check
    let vk = Bytes::from_slice(&env, &[0xabu8; 1764]);
    client
        .register_circuit(&circuit_id, &vk)
        .expect("register should succeed");

    let result = client.try_verify_unique(&circuit_id, &inputs, &proof);
    assert!(result.is_err(), "replayed nullifier must be rejected");
    let err = result.unwrap_err().unwrap();
    assert_eq!(err, ZkError::NullifierAlreadyUsed, "should be NullifierAlreadyUsed");
}
