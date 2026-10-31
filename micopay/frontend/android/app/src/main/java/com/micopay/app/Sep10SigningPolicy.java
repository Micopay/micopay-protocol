package com.micopay.app;

import org.stellar.sdk.Network;
import org.stellar.sdk.Sep10Challenge;
import org.stellar.sdk.Transaction;

/**
 * Lo unico que la APK firma sin ser dueña de la transaccion: el reto de inicio
 * de sesion. El SDK exige fuente y firma del servidor, secuencia 0, solo
 * ManageData y vigencia, asi que lo firmado nunca puede ejecutarse.
 */
final class Sep10SigningPolicy {

    private Sep10SigningPolicy() {}

    /** La llave del servidor viene fijada en el build, no de lo que diga la web. */
    static Transaction readChallenge(
        String xdr,
        String account,
        Network network,
        String signingKey,
        String homeDomain,
        String webAuthDomain
    ) throws Exception {
        if (signingKey.isEmpty()) {
            throw new IllegalArgumentException("El inicio de sesión web no está configurado");
        }
        Sep10Challenge.ChallengeTransaction challenge =
            Sep10Challenge.readChallengeTransaction(xdr, signingKey, network, homeDomain, webAuthDomain);
        if (!account.equals(challenge.getClientAccountId())) {
            throw new IllegalArgumentException("El reto es de otra cuenta");
        }
        return challenge.getTransaction();
    }
}
