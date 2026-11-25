package il.ac.ariel.smartclass.core;

import java.security.SecureRandom;

/**
 * What the QR holds: "SC2/&lt;sessionId&gt;/&lt;token&gt;" in capitals and digits only
 * (same format as web/js/core/payload.js). SC2 = SmartClass format 2, so the scanner
 * ignores every other QR in the room. WHY capitals and digits: the QR stores them in
 * alphanumeric mode, so the code has fewer, bigger squares (25x25) and can be read
 * from the back of the class.
 * The token changes every 5 s; the current AND the previous token are accepted (about 10 s).
 * Decision: attendance is physical only - a scan of the live flicker code = in class.
 */
public final class Payload
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** A new token every 5 s (decision 25 Nov: signing in is fast, there is no Moodle wait). */
    public static final long ROTATE_MS = 5000;

    /** Time for a scan to reach the server. */
    public static final long NETWORK_SLACK_MS = 2000;

    /** Format marker. */
    private static final String PREFIX = "SC2";

    /** Between the parts. */
    private static final String SEPARATOR = "/";

    /** 14 x 5 = 70 random bits per token (it lives only 60 s). */
    private static final int TOKEN_CHARS = 14;

    /** 10 x 5 = 50 random bits per lecture id. */
    private static final int SESSION_CHARS = 10;

    /** 32 symbols without I, L, O, U (same as CODE.ALPHABET in payload.js). */
    private static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    /** Shared source of secure randomness. */
    private static final SecureRandom RANDOM = new SecureRandom();

    /** The lecture. */
    private final String sessionId;

    /** The random token. */
    private final String token;

    /**
     * Creates a decoded payload.
     * @param (String) sessionId The lecture.
     * @param (String) token The token.
     */
    private Payload(String sessionId, String token)
    {
        this.sessionId = sessionId;
        this.token = token;
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the QR text.
     * @param (String) sessionId The lecture.
     * @param (String) token The current random token.
     * @return (String) The payload.
     */
    public static String encode(String sessionId, String token)
    {
        return PREFIX + SEPARATOR + sessionId + SEPARATOR + token;
    }

    /**
     * Reads a QR text.
     * @param (String) text Scanned text.
     * @return (Payload) The parts, or null for anything that is not ours.
     */
    public static Payload decode(String text)
    {
        if (text == null)
        {
            return null;
        }
        String[] parts = text.split(SEPARATOR, -1);
        if (parts.length != 3 || !PREFIX.equals(parts[0]) || !isCode(parts[1]) || !isCode(parts[2]))
        {
            return null;
        }
        return new Payload(parts[1], parts[2]);
    }

    /**
     * Makes a new random token (14 capitals/digits).
     * @return (String) The token.
     */
    public static String newToken()
    {
        return randomCode(TOKEN_CHARS);
    }

    /**
     * Makes a new lecture id (10 capitals/digits), so the QR text stays short.
     * @return (String) The session id.
     */
    public static String newSessionId()
    {
        return randomCode(SESSION_CHARS);
    }

    /**
     * Random text from ALPHABET.
     * @param (int) length Characters.
     * @return (String) The text.
     */
    private static String randomCode(int length)
    {
        StringBuilder out = new StringBuilder(length);
        for (int i = 0; i < length; i++)
        {
            out.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return out.toString();
    }

    /**
     * Tells whether a part is non-empty letters/digits.
     * @param (String) part The part.
     * @return (boolean) True when it is.
     */
    private static boolean isCode(String part)
    {
        return part.matches("[0-9A-Za-z]+");          // lower case: lectures from an older version
    }

    /**
     * Tells whether a token shown at createdMs is still accepted at nowMs.
     * @param (long) createdMs When the token was shown.
     * @param (long) nowMs Now.
     * @return (boolean) True for the current or the previous token.
     */
    public static boolean isCurrentCode(long createdMs, long nowMs)
    {
        return nowMs - createdMs <= 2 * ROTATE_MS + NETWORK_SLACK_MS;
    }

    /**
     * Returns the lecture id.
     * @return (String) Session id.
     */
    public String sessionId()
    {
        return sessionId;
    }

    /**
     * Returns the token.
     * @return (String) Token.
     */
    public String token()
    {
        return token;
    }
}
