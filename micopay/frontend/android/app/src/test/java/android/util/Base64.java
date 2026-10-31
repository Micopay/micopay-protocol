package android.util;

/** El android.jar de las pruebas JVM trae stubs vacios; el SDK de Stellar lo llama por reflexion. */
public final class Base64 {

    public static final int NO_WRAP = 2;

    private Base64() {}

    public static byte[] encode(byte[] input, int flags) {
        return java.util.Base64.getEncoder().encode(input);
    }

    public static String encodeToString(byte[] input, int flags) {
        return java.util.Base64.getEncoder().encodeToString(input);
    }

    public static byte[] decode(byte[] input, int flags) {
        return java.util.Base64.getDecoder().decode(input);
    }

    public static byte[] decode(String input, int flags) {
        return java.util.Base64.getDecoder().decode(input);
    }
}
