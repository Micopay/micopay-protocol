use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    TradeNotFound = 3,
    InvalidSecret = 4,
    TradeNotLocked = 5,
    TimeoutNotReached = 6,
    TimeoutReached = 7,
    Unauthorized = 8,
    InsufficientAmount = 9,
    TradeAlreadyExists = 10,
    AmountOverflow = 11,
    /// labs (E1): `timeout_minutes` fuera de los limites que fijo el admin.
    TimeoutOutOfRange = 12,
    /// labs (E1): configuracion invalida (minimo 0, minimo > maximo o maximo demasiado largo).
    InvalidConfig = 13,
    /// labs (E1): el ledger de vencimiento no cabe en u32.
    LedgerOverflow = 14,
    /// labs (E2): la comision de MicoPay pasa el tope (`fee_cap_bps`).
    FeeAboveCap = 15,
    /// labs (E7): el contrato esta en pausa y no acepta trades nuevos.
    Paused = 16,
    /// labs (E9): no hay un admin propuesto que pueda aceptar.
    NoPendingAdmin = 17,
    /// labs (E12): el comprador ya acepto este trade.
    AlreadyAccepted = 18,
}
