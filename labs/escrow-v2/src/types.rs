use soroban_sdk::{contracttype, Address, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TradeStatus {
    Locked,
    /// labs (E4): el comprador reporto "ya pague" entre T y G. Sigue abierto:
    /// `release` y `decline` funcionan, y `refund` espera hasta D.
    Disputed,
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
    /// labs (E12): el comprador firmo que el trade es suyo. Sin esto el trade
    /// funciona igual, pero no contara en las estadisticas (E6).
    pub accepted: bool,
    /// labs (E8): ledger en el que se bloqueo.
    pub lock_ledger: u32,
    /// labs (E8): vida maxima del trade en ledgers, contada desde `lock_ledger`.
    /// Se copia del maximo de E1 al bloquear: si el admin lo cambia despues, este
    /// trade conserva el suyo.
    pub max_total_ledgers: u32,
    /// labs (E3): margen en ledgers despues del vencimiento. `refund` espera hasta
    /// G = `timeout_ledger` + este margen. Se copia al bloquear.
    pub margin_ledgers: u32,
    /// labs (E4): plazo de disputa en ledgers. Se copia al bloquear.
    pub dispute_ledgers: u32,
    /// labs (E4): D, el ledger desde el que `refund` vuelve a funcionar en una
    /// disputa. 0 mientras no haya reporte.
    pub dispute_deadline: u32,
}

/// labs (E1): limites del tiempo de bloqueo, en minutos. Los fija el admin.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeoutBounds {
    pub min_minutes: u32,
    pub max_minutes: u32,
}

/// labs (X1): lo que devuelve `get_tier` del registro de `labs/agent-tier`. Mismos
/// nombres y tipos que su `TierRecord`, para que se lea igual en cadena.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TierRecord {
    pub tier: u32,
    pub epoch: u32,
}

/// labs (X1): desde que monto se pide un participante con tier, y cual.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TierGate {
    /// Contrato `AgentTierRegistry` de `labs/agent-tier`.
    pub registry: Address,
    /// En unidades del token de este escrow (stroops).
    pub threshold: i128,
    /// 1 Bronce, 2 Plata, 3 Oro.
    pub min_tier: u32,
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
    /// labs (E9): admin propuesto que todavia no acepta.
    PendingAdmin,
    /// labs (E11): comisiones de MicoPay cobradas en `release` y aun no retiradas.
    AccruedFees,
    /// labs (X1): regla de tier para trades grandes. Sin la llave, no hay regla.
    TierGate,
    /// labs (E3): margen antes del reembolso, en minutos.
    ClaimMargin,
    /// labs (E4): plazo de disputa, en minutos.
    DisputeWindow,
}
