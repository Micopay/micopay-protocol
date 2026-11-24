package com.micopay.app;

import static org.junit.Assert.assertThrows;

import org.junit.Test;

public class EscrowSigningPolicyTest {

    private static final String ALLOWED = "CAAA,CBBB";

    @Test
    public void aceptaContratoDeLaLista() {
        EscrowSigningPolicy.requireAllowedContract("CBBB", ALLOWED);
    }

    @Test
    public void rechazaContratoAjeno() {
        assertThrows(IllegalArgumentException.class,
            () -> EscrowSigningPolicy.requireAllowedContract("CCCC", ALLOWED));
    }

    @Test
    public void rechazaContratoConListaVacia() {
        assertThrows(IllegalArgumentException.class,
            () -> EscrowSigningPolicy.requireAllowedContract("", ""));
    }

    @Test
    public void aceptaArgumentosEsperados() {
        EscrowSigningPolicy.requireArgumentCount("lock", 6);
        EscrowSigningPolicy.requireArgumentCount("release", 2);
        EscrowSigningPolicy.requireArgumentCount("decline", 1);
    }

    @Test
    public void rechazaArgumentosDistintos() {
        assertThrows(IllegalArgumentException.class,
            () -> EscrowSigningPolicy.requireArgumentCount("release", 1));
    }
}
