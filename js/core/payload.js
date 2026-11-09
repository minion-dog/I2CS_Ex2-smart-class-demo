// =====================================================================
//  payload.js - what the QR holds
// =====================================================================
// Format: "SC1|<sessionId>|<token>". SC1 = SmartClass format version 1,
// so the scanner ignores every other QR in the room.
//
// Decision: attendance is PHYSICAL only. Scanning the flicker QR = in class
// (only someone in the room can film it live). No Zoom attendance, no location.
// The token changes every 30 s (decision: 15 s was too fast when the
// phone asks to sign in again). The current AND the previous token are
// accepted, which gives up to 60 s.

/** Tuning constants. */
export const CODE = Object.freeze({
    PREFIX: 'SC1',
    ROTATE_MS: 30000,      // a new token every 30 s
    TOKEN_BYTES: 16        // 128 random bits
});

/**
 * Builds the QR text.
 * @param {string} sessionId - the lecture
 * @param {string} token - the current random token
 * @returns {string} the payload
 */
export function encodePayload(sessionId, token)
{
    return CODE.PREFIX + '|' + sessionId + '|' + token;
}


/**
 * Reads a QR text; returns null for anything that is not ours.
 * @param {string} text - scanned text
 * @returns {{sessionId:string, token:string}|null} parts
 */
export function decodePayload(text)
{
    const parts = String(text).split('|');
    if (parts.length !== 3 || parts[0] !== CODE.PREFIX || parts[1] === '' || parts[2] === '')
    {
        return null;
    }
    return { sessionId: parts[1], token: parts[2] };
}

/**
 * Makes a new random token (base64url, 22 characters).
 * @returns {string} token
 */
export function newToken()
{
    const bytes = new Uint8Array(CODE.TOKEN_BYTES);
    globalThis.crypto.getRandomValues(bytes);
    let bin = '';
    for (const b of bytes)
    {
        bin += String.fromCharCode(b);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
    return nowMs - createdMs <= 2 * CODE.ROTATE_MS;
}
