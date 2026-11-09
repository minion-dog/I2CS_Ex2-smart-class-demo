// =====================================================================
//  payload.js - what the QR holds
// =====================================================================
// Format: "SC1|<sessionId>|<token>". SC1 = SmartClass format version 1,
// so the scanner ignores every other QR in the room.
// Demo mode only adds "|<lat>|<lng>" (the lecturer's place, 3 decimals ~ 100 m):
// there each device keeps its own data, so the phone needs the place from the
// code itself to say "in class" or "Zoom". The real modes leave it out (a
// shorter text = bigger squares = easier to read from the back).
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
 * @param {{lat:number, lng:number}} [where] - demo mode only: the lecturer's place
 * @returns {string} the payload
 */
export function encodePayload(sessionId, token, where)
{
    const base = CODE.PREFIX + '|' + sessionId + '|' + token;
    if (!where)
    {
        return base;
    }
    return base + '|' + where.lat.toFixed(3) + '|' + where.lng.toFixed(3);
}

/**
 * Reads a QR text; returns null for anything that is not ours.
 * @param {string} text - scanned text
 * @returns {{sessionId:string, token:string, where:({lat:number, lng:number}|null)}|null} parts
 */
export function decodePayload(text)
{
    const parts = String(text).split('|');
    if ((parts.length !== 3 && parts.length !== 5) || parts[0] !== CODE.PREFIX || parts[1] === '' || parts[2] === '')
    {
        return null;
    }
    let where = null;
    if (parts.length === 5)
    {
        const lat = Number(parts[3]);
        const lng = Number(parts[4]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        {
            return null;
        }
        where = { lat: lat, lng: lng };
    }
    return { sessionId: parts[1], token: parts[2], where: where };
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
