// =====================================================================
//  payload.js - what the QR holds
// =====================================================================
// Format: "SC2/<sessionId>/<token>", all in CAPITAL letters and digits.
// SC2 = SmartClass format version 2, so the scanner ignores every other QR.
// WHY capitals and digits only: a QR stores them in "alphanumeric mode"
// (5.5 bits a character instead of 8), so the code has fewer, BIGGER squares
// and can be read from the back of the class (25x25 squares instead of 41x41).
//
// Decision: attendance is PHYSICAL only. Scanning the flicker QR = in class
// (only someone in the room can film it live). No Zoom attendance, no location.
// The token changes every 5 s (decision 25 Nov 2026: the old 30 s was for
// slow Moodle sign-ins; signing in is now fast). The current AND the
// previous token are accepted, about 10 s, so a code sent to a friend
// outside is useless by the time it arrives.

/** Tuning constants. */
export const CODE = Object.freeze({
    PREFIX: 'SC2',
    SEPARATOR: '/',
    ROTATE_MS: 5000,       // a new token every 5 s (decision 25 Nov: sign-in is fast, no Moodle wait)
    NETWORK_SLACK_MS: 2000, // time for the scan to reach the server
    TOKEN_CHARS: 14,       // 14 x 5 bits = 70 random bits, and it lives only 60 s
    SESSION_CHARS: 10,     // 50 random bits per lecture
    // 32 symbols without I, L, O, U (no confusion with 1 and 0)
    ALPHABET: '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
});

/**
 * Builds the QR text.
 * @param {string} sessionId - the lecture
 * @param {string} token - the current random token
 * @returns {string} the payload
 */
export function encodePayload(sessionId, token)
{
    return CODE.PREFIX + CODE.SEPARATOR + sessionId + CODE.SEPARATOR + token;
}

/**
 * Reads a QR text; returns null for anything that is not ours.
 * @param {string} text - scanned text
 * @returns {{sessionId:string, token:string}|null} parts
 */
export function decodePayload(text)
{
    const parts = String(text).split(CODE.SEPARATOR);
    const ok = /^[0-9A-Z]+$/;
    if (parts.length !== 3 || parts[0] !== CODE.PREFIX || !ok.test(parts[1]) || !ok.test(parts[2]))
    {
        return null;
    }
    return { sessionId: parts[1], token: parts[2] };
}

/**
 * Makes a new random token (14 capitals/digits, 70 bits).
 * @returns {string} token
 */
export function newToken()
{
    return randomCode(CODE.TOKEN_CHARS);
}

/**
 * Makes a new lecture id (10 capitals/digits). The stores use it as the
 * session's id, so the QR stays short.
 * @returns {string} session id
 */
export function newSessionId()
{
    return randomCode(CODE.SESSION_CHARS);
}

/**
 * Random text from CODE.ALPHABET (crypto random; 32 symbols = exactly 5 bits each).
 * @param {number} length - characters
 * @returns {string} the text
 */
function randomCode(length)
{
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    let out = '';
    for (const b of bytes)
    {
        out += CODE.ALPHABET[b & 31];
    }
    return out;
}

/**
 * Tells whether a token issued at createdMs is still accepted at nowMs
 * (it is the current one or the one before it).
 * @param {number} createdMs - when the token was shown
 * @param {number} nowMs - now
 * @returns {boolean} accepted
 */
export function isCurrentCode(createdMs, nowMs)
{
    return nowMs - createdMs <= 2 * CODE.ROTATE_MS + CODE.NETWORK_SLACK_MS;
}
