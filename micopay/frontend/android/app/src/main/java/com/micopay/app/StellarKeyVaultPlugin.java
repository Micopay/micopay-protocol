package com.micopay.app;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.security.keystore.StrongBoxUnavailableException;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.stellar.sdk.KeyPair;
import org.stellar.sdk.Network;
import org.stellar.sdk.StrKey;
import org.stellar.sdk.Transaction;
import org.stellar.sdk.operations.ChangeTrustOperation;
import org.stellar.sdk.operations.InvokeHostFunctionOperation;
import org.stellar.sdk.operations.Operation;
import org.stellar.sdk.operations.PaymentOperation;
import org.stellar.sdk.xdr.EnvelopeType;
import org.stellar.sdk.xdr.HostFunctionType;
import org.stellar.sdk.xdr.TransactionEnvelope;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "StellarKeyVault")
public class StellarKeyVaultPlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "micopay_stellar_seed_aes_v1";
    private static final String PREFS = "micopay_stellar_key_vault";
    private static final String PREF_CIPHERTEXT = "ciphertext";
    private static final String PREF_IV = "iv";
    private static final String PREF_PUBLIC_KEY = "public_key";
    private static final int AUTH_WINDOW_SECONDS = 30;
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_STRONG
            | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    private final AtomicBoolean authenticationInProgress = new AtomicBoolean(false);

    @PluginMethod
    public void status(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("exists", hasVault());
            result.put("publicKey", preferences().getString(PREF_PUBLIC_KEY, null));
            result.put("securityLevel", securityLevel());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo consultar Android Keystore.", "KEYSTORE_STATUS_FAILED", error);
        }
    }

    @PluginMethod
    public void generate(PluginCall call) {
        if (hasVault()) {
            call.reject("Ya existe una cuenta protegida en este dispositivo.", "KEY_ALREADY_EXISTS");
            return;
        }
        authenticate(call, () -> {
            KeyPair keyPair = KeyPair.random();
            char[] encodedSeed = keyPair.getSecretSeed();
            byte[] rawSeed = StrKey.decodeEd25519SecretSeed(encodedSeed);
            Arrays.fill(encodedSeed, '\0');
            try {
                storeSeed(rawSeed, keyPair.getAccountId());
                resolveAccount(call, keyPair.getAccountId());
            } finally {
                Arrays.fill(rawSeed, (byte) 0);
            }
        });
    }

    @PluginMethod
    public void importSeed(PluginCall call) {
        String secret = call.getString("secretKey");
        boolean replace = Boolean.TRUE.equals(call.getBoolean("replace", false));
        String expectedPublicKey = call.getString("expectedPublicKey");
        if (secret == null || secret.isEmpty()) {
            call.reject("Falta la llave Stellar.", "INVALID_SEED");
            return;
        }
        if (hasVault() && !replace) {
            call.reject("Ya existe una cuenta protegida en este dispositivo.", "KEY_ALREADY_EXISTS");
            return;
        }

        char[] encodedSeed = secret.toCharArray();
        final String publicKey;
        try {
            KeyPair keyPair = KeyPair.fromSecretSeed(encodedSeed);
            publicKey = keyPair.getAccountId();
        } catch (Exception error) {
            Arrays.fill(encodedSeed, '\0');
            call.reject("La llave Stellar no es válida.", "INVALID_SEED", error);
            return;
        }
        Arrays.fill(encodedSeed, '\0');

        if (expectedPublicKey != null && !expectedPublicKey.equals(publicKey)) {
            call.reject("La migración produciría una cuenta diferente.", "PUBLIC_KEY_MISMATCH");
            return;
        }

        authenticate(call, () -> {
            char[] authenticatedSeed = secret.toCharArray();
            byte[] rawSeed;
            try {
                rawSeed = StrKey.decodeEd25519SecretSeed(authenticatedSeed);
            } finally {
                Arrays.fill(authenticatedSeed, '\0');
            }
            try {
                storeSeed(rawSeed, publicKey);
                resolveAccount(call, publicKey);
            } finally {
                Arrays.fill(rawSeed, (byte) 0);
            }
        });
    }

    @PluginMethod
    public void getPublicKey(PluginCall call) {
        String publicKey = preferences().getString(PREF_PUBLIC_KEY, null);
        if (!hasVault() || publicKey == null) {
            call.reject("No existe una cuenta protegida.", "KEY_NOT_FOUND");
            return;
        }
        resolveAccount(call, publicKey);
    }

    @PluginMethod
    public void signChallenge(PluginCall call) {
        String challenge = call.getString("challenge");
        if (challenge == null) {
            call.reject("Falta el challenge.", "INVALID_CHALLENGE");
            return;
        }
        authenticate(call, () -> withKeyPair(call, keyPair -> {
            byte[] signature = keyPair.sign(challenge.getBytes(StandardCharsets.UTF_8));
            JSObject result = new JSObject();
            result.put("signature", Base64.encodeToString(signature, Base64.NO_WRAP));
            Arrays.fill(signature, (byte) 0);
            call.resolve(result);
        }));
    }

    @PluginMethod
    public void signTransaction(PluginCall call) {
        String xdr = call.getString("xdr");
        String networkPassphrase = call.getString("networkPassphrase");
        String reason = call.getString("reason");
        if (xdr == null || networkPassphrase == null || reason == null) {
            call.reject("Falta la transacción o la red.", "INVALID_TRANSACTION");
            return;
        }
        if (!expectedNetworkPassphrase().equals(networkPassphrase)) {
            call.reject("La red no coincide con la red fijada en este APK.", "NETWORK_MISMATCH");
            return;
        }
        authenticate(call, () -> withKeyPair(call, keyPair -> {
            TransactionEnvelope envelope = TransactionEnvelope.fromXdrBase64(xdr);
            if (envelope.getDiscriminant() != EnvelopeType.ENVELOPE_TYPE_TX) {
                throw new IllegalArgumentException("Solo se admiten transacciones V1, no fee-bump");
            }
            if (envelope.getV1().getSignatures().length != 0) {
                throw new IllegalArgumentException("La transacción ya contiene firmas");
            }
            Transaction transaction = Transaction.fromV1EnvelopeXdr(
                envelope.getV1(),
                new Network(networkPassphrase)
            );
            if (!keyPair.getAccountId().equals(transaction.getSourceAccount())) {
                throw new IllegalArgumentException("La cuenta source no coincide con la llave protegida");
            }
            validateSigningIntent(transaction, reason);
            transaction.sign(keyPair);
            JSObject result = new JSObject();
            result.put("signedXdr", transaction.toEnvelopeXdr().toXdrBase64());
            call.resolve(result);
        }));
    }

    @PluginMethod
    public void revealSeed(PluginCall call) {
        authenticate(call, () -> withKeyPair(call, keyPair -> {
            char[] secret = keyPair.getSecretSeed();
            JSObject result = new JSObject();
            result.put("secretKey", new String(secret));
            Arrays.fill(secret, '\0');
            call.resolve(result);
        }));
    }

    @PluginMethod
    public void deleteKey(PluginCall call) {
        authenticate(call, () -> {
            try {
                preferences().edit().clear().commit();
                KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
                keyStore.load(null);
                if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
                call.resolve();
            } catch (Exception error) {
                call.reject("No se pudo eliminar la llave protegida.", "KEY_DELETE_FAILED", error);
            }
        });
    }

    private void authenticate(PluginCall call, ThrowingRunnable action) {
        if (!hasSecureLockScreen()) {
            call.reject(
                "Configura un PIN, patrón o biometría en Android antes de usar MicoPay.",
                "DEVICE_NOT_SECURE"
            );
            return;
        }
        if (!authenticationInProgress.compareAndSet(false, true)) {
            call.reject("Ya hay una autenticación en curso.", "AUTH_IN_PROGRESS");
            return;
        }

        getActivity().runOnUiThread(() -> {
            Executor executor = ContextCompat.getMainExecutor(getContext());
            BiometricPrompt prompt = new BiometricPrompt(
                (FragmentActivity) getActivity(),
                executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errorText) {
                        authenticationInProgress.set(false);
                        call.reject("No se autorizó la operación.", "AUTH_CANCELLED");
                    }

                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        authenticationInProgress.set(false);
                        try {
                            action.run();
                        } catch (Exception error) {
                            call.reject("La operación criptográfica falló.", "CRYPTO_OPERATION_FAILED", error);
                        }
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // Android mantiene abierto el diálogo para permitir otro intento.
                    }
                }
            );
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("MicoPay")
                .setSubtitle(promptText(call.getString("reason")))
                .setAllowedAuthenticators(AUTHENTICATORS)
                .setConfirmationRequired(true)
                .build();
            prompt.authenticate(promptInfo);
        });
    }

    private void withKeyPair(PluginCall call, KeyPairAction action) throws Exception {
        byte[] rawSeed = decryptSeed();
        try {
            action.run(KeyPair.fromSecretSeed(rawSeed));
        } finally {
            Arrays.fill(rawSeed, (byte) 0);
        }
    }

    private void storeSeed(byte[] rawSeed, String publicKey) throws Exception {
        SecretKey key = getOrCreateKey();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(aad(publicKey));
        byte[] ciphertext = cipher.doFinal(rawSeed);
        byte[] iv = cipher.getIV();
        boolean committed = preferences().edit()
            .putString(PREF_CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
            .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
            .putString(PREF_PUBLIC_KEY, publicKey)
            .commit();
        Arrays.fill(ciphertext, (byte) 0);
        Arrays.fill(iv, (byte) 0);
        if (!committed) throw new IllegalStateException("No se pudo persistir el vault");
    }

    private byte[] decryptSeed() throws Exception {
        String publicKey = preferences().getString(PREF_PUBLIC_KEY, null);
        String ciphertext = preferences().getString(PREF_CIPHERTEXT, null);
        String iv = preferences().getString(PREF_IV, null);
        if (publicKey == null || ciphertext == null || iv == null) {
            throw new IllegalStateException("No existe una cuenta protegida");
        }
        byte[] encrypted = Base64.decode(ciphertext, Base64.NO_WRAP);
        byte[] nonce = Base64.decode(iv, Base64.NO_WRAP);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(aad(publicKey));
            return cipher.doFinal(encrypted);
        } finally {
            Arrays.fill(encrypted, (byte) 0);
            Arrays.fill(nonce, (byte) 0);
        }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }
        try {
            return generateKey(true);
        } catch (StrongBoxUnavailableException error) {
            return generateKey(false);
        }
    }

    private SecretKey generateKey(boolean strongBox) throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(
                AUTH_WINDOW_SECONDS,
                KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL
            );
        } else {
            builder.setUserAuthenticationValidityDurationSeconds(AUTH_WINDOW_SECONDS);
        }
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(true);
        }
        generator.init(builder.build());
        return generator.generateKey();
    }

    private String securityLevel() {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
            keyStore.load(null);
            if (!keyStore.containsAlias(KEY_ALIAS)) return "not_created";
            SecretKey key = (SecretKey) keyStore.getKey(KEY_ALIAS, null);
            SecretKeyFactory factory = SecretKeyFactory.getInstance(key.getAlgorithm(), KEYSTORE);
            KeyInfo info = (KeyInfo) factory.getKeySpec(key, KeyInfo.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && info.getSecurityLevel() == KeyProperties.SECURITY_LEVEL_STRONGBOX) {
                return "strongbox";
            }
            return info.isInsideSecureHardware() ? "tee" : "software";
        } catch (Exception error) {
            return "unknown";
        }
    }

    private boolean hasSecureLockScreen() {
        KeyguardManager manager = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        return manager != null && manager.isDeviceSecure()
            && BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS)
                == BiometricManager.BIOMETRIC_SUCCESS;
    }

    private boolean hasVault() {
        return preferences().contains(PREF_CIPHERTEXT)
            && preferences().contains(PREF_IV)
            && preferences().contains(PREF_PUBLIC_KEY);
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private byte[] aad(String publicKey) {
        return (getContext().getPackageName() + ":stellar-seed:v1:" + publicKey)
            .getBytes(StandardCharsets.UTF_8);
    }

    private void resolveAccount(PluginCall call, String publicKey) {
        JSObject result = new JSObject();
        result.put("publicKey", publicKey);
        result.put("securityLevel", securityLevel());
        call.resolve(result);
    }

    private String promptText(String reason) {
        if ("lock".equals(reason)) return "Confirma para bloquear tu dinero en garantía";
        if ("release".equals(reason)) return "Confirma para liberar el dinero";
        if ("decline".equals(reason)) return "Confirma para devolver los fondos";
        if ("reveal_key".equals(reason)) return "Confirma para ver tu llave secreta";
        if ("migration".equals(reason)) return "Confirma para proteger tu cuenta con Android Keystore";
        return "Confirma para firmar esta operación";
    }

    private String expectedNetworkPassphrase() {
        return "PUBLIC".equals(BuildConfig.STELLAR_NETWORK)
            ? Network.PUBLIC.getNetworkPassphrase()
            : Network.TESTNET.getNetworkPassphrase();
    }

    private void validateSigningIntent(Transaction transaction, String reason) {
        Operation[] operations = transaction.getOperations();
        if (operations.length != 1) {
            throw new IllegalArgumentException("La intención debe contener exactamente una operación");
        }
        Operation operation = operations[0];
        if ("payment".equals(reason)) {
            if (!(operation instanceof PaymentOperation) && !(operation instanceof ChangeTrustOperation)) {
                throw new IllegalArgumentException("La intención de pago contiene una operación no permitida");
            }
            return;
        }
        if ("lock".equals(reason) || "release".equals(reason) || "decline".equals(reason)) {
            if (!(operation instanceof InvokeHostFunctionOperation)) {
                throw new IllegalArgumentException("La intención de escrow no invoca un contrato");
            }
            InvokeHostFunctionOperation invocation = (InvokeHostFunctionOperation) operation;
            if (invocation.getHostFunction().getDiscriminant()
                != HostFunctionType.HOST_FUNCTION_TYPE_INVOKE_CONTRACT) {
                throw new IllegalArgumentException("La intención no es una llamada de contrato");
            }
            String functionName = new String(
                invocation.getHostFunction().getInvokeContract().getFunctionName().getSCSymbol().getBytes(),
                StandardCharsets.UTF_8
            );
            if (!reason.equals(functionName)) {
                throw new IllegalArgumentException("El método del contrato no coincide con la intención aprobada");
            }
            return;
        }
        throw new IllegalArgumentException("Esta intención todavía no está habilitada en el firmador nativo");
    }

    private interface ThrowingRunnable {
        void run() throws Exception;
    }

    private interface KeyPairAction {
        void run(KeyPair keyPair) throws Exception;
    }
}
