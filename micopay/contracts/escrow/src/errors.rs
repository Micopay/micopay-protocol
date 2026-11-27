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
    /// El cliente ya dejo su constancia de pago en esta operacion.
    AlreadyReported = 12,
    /// Hay constancia de pago y su plazo no ha terminado.
    PaymentReported = 13,
}
