use soroban_sdk::{contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TradeStatus {
    Locked,
    Released,
    /// Reembolso por vencimiento (`refund`).
    Refunded,
    /// El comprador rechazo el trade (`decline`). En produccion queda como `Refunded`.
    Declined,
    /// Lo cerro el arbitro (`resolve`, E5). Todavia no hay funcion que lo use.
    Resolved,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TradeEscrow {
    pub seller: Address,
    pub buyer: Address,
    pub amount: i128,
    pub platform_fee: i128,
    pub secret_hash: BytesN<32>,
    pub timeout_ledger: u32,
    pub status: TradeStatus,
}

/// labs (E1): limites del tiempo de bloqueo, en minutos. Los fija el admin.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeoutBounds {
    pub min_minutes: u32,
    pub max_minutes: u32,
}

#[contracttype]
pub enum DataKey {
    Admin,
    TokenId,
    PlatformWallet,
    Trade(BytesN<32>),
    TimeoutBounds,
    /// labs (E2): tope de la comision de MicoPay, en puntos base del monto.
    FeeCapBps,
    /// labs (E7): pausa de emergencia. Sin la llave, no hay pausa.
    Paused,
}
