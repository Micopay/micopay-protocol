package com.micopay.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.junit.Test;
import org.stellar.sdk.Account;
import org.stellar.sdk.KeyPair;
import org.stellar.sdk.Network;
import org.stellar.sdk.Sep10Challenge;
import org.stellar.sdk.TimeBounds;
import org.stellar.sdk.Transaction;
import org.stellar.sdk.TransactionBuilder;
import org.stellar.sdk.exception.InvalidSep10ChallengeException;
import org.stellar.sdk.operations.ManageDataOperation;

public class Sep10SigningPolicyTest {

    private static final String HOME = "app.micopay.com.mx";
    private static final String AUTH = "api.micopay.app";
    private static final Network NET = Network.TESTNET;

    private final KeyPair server = KeyPair.random();
    private final KeyPair client = KeyPair.random();

    private String challengeFor(KeyPair from, Network network, String home) throws Exception {
        long now = System.currentTimeMillis() / 1000;
        return Sep10Challenge.newChallenge(
            from, network, client.getAccountId(), home, AUTH, new TimeBounds(now, now + 300)
        ).toEnvelopeXdrBase64();
    }

    private Transaction read(String xdr, String account) throws Exception {
        return Sep10SigningPolicy.readChallenge(xdr, account, NET, server.getAccountId(), HOME, AUTH);
    }

    @Test
    public void aceptaElRetoDeLaCuenta() throws Exception {
        Transaction tx = read(challengeFor(server, NET, HOME), client.getAccountId());
        tx.sign(client);
        assertEquals(2, tx.getSignatures().size());
    }

    @Test
    public void rechazaRetoDeOtraCuenta() throws Exception {
        String xdr = challengeFor(server, NET, HOME);
        assertThrows(IllegalArgumentException.class, () -> read(xdr, KeyPair.random().getAccountId()));
    }

    @Test
    public void rechazaOtroServidor() throws Exception {
        String xdr = challengeFor(KeyPair.random(), NET, HOME);
        assertThrows(InvalidSep10ChallengeException.class, () -> read(xdr, client.getAccountId()));
    }

    @Test
    public void rechazaOtroDominio() throws Exception {
        String xdr = challengeFor(server, NET, "micopay.evil.io");
        assertThrows(InvalidSep10ChallengeException.class, () -> read(xdr, client.getAccountId()));
    }

    @Test
    public void rechazaOtraRed() throws Exception {
        String xdr = challengeFor(server, Network.PUBLIC, HOME);
        assertThrows(InvalidSep10ChallengeException.class, () -> read(xdr, client.getAccountId()));
    }

    @Test
    public void rechazaSinLlaveConfigurada() throws Exception {
        String xdr = challengeFor(server, NET, HOME);
        assertThrows(IllegalArgumentException.class, () -> Sep10SigningPolicy.readChallenge(
            xdr, client.getAccountId(), NET, "", HOME, AUTH
        ));
    }

    /** Secuencia real: una transaccion asi si se podria ejecutar. */
    @Test
    public void rechazaSecuenciaDistintaDeCero() {
        Account source = new Account(server.getAccountId(), 41L);
        Transaction tx = new TransactionBuilder(source, NET)
            .setBaseFee(100)
            .setTimeout(300)
            .addOperation(ManageDataOperation.builder()
                .name(HOME + " auth")
                .value(new byte[48])
                .sourceAccount(client.getAccountId())
                .build())
            .build();
        tx.sign(server);
        assertThrows(InvalidSep10ChallengeException.class, () -> read(tx.toEnvelopeXdrBase64(), client.getAccountId()));
    }
}
