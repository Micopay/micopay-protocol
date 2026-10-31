package com.micopay.app;

import java.util.Arrays;

/**
 * Reglas nativas de lo que se puede firmar contra el escrow. Viven aqui, y no en
 * JavaScript, para que sigan vigentes aunque la capa web quede comprometida.
 */
final class EscrowSigningPolicy {

    private EscrowSigningPolicy() {}

    /** Lista de contratos fijada en el build: IDs separados por coma. */
    static void requireAllowedContract(String contractId, String allowedContracts) {
        if (contractId.isEmpty() || !Arrays.asList(allowedContracts.split(",")).contains(contractId)) {
            throw new IllegalArgumentException("El contrato no es un escrow de MicoPay");
        }
    }

    static void requireArgumentCount(String function, int count) {
        int expected;
        switch (function) {
            case "lock":
                expected = 6;
                break;
            case "release":
                expected = 2;
                break;
            case "decline":
                expected = 1;
                break;
            default:
                throw new IllegalArgumentException("Función de escrow no permitida");
        }
        if (count != expected) {
            throw new IllegalArgumentException("Los argumentos no coinciden con la función del escrow");
        }
    }
}
