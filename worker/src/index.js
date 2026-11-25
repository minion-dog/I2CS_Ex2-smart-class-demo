// =====================================================================
//  SmartClass AI Worker (Cloudflare Workers, free plan)
// =====================================================================
// Decision (ours, 25 Nov 2026): the Gemini key must be built in but
// private. In a website, any key the browser holds can be read, so the
// key lives ONLY here, as a Worker secret (GEMINI_KEY). Nobody types it.
//
// Every request:
//   1. comes from our site (Origin in ALLOWED_ORIGINS),
//   2. carries the lecturer's Firebase sign-in token,
//   3. the Worker asks Firestore, WITH THAT TOKEN, to read staff/{uid}.
//      Firestore checks the token's signature and our security rules, so
//      the Worker needs no crypto of its own: only the real lecturer gets 200.
//   4. Only then the Worker adds the key and forwards to Gemini.
// Students, visitors and other sites get 401/403 and never touch the key.

/** Limits. */
export const LIMITS = Object.freeze({
    MAX_BODY_BYTES: 26 * 1024 * 1024,   // an 18 MB recording in base64 fits
    PER_MINUTE: 30,                     // requests per lecturer per minute
    CHECK_TTL_MS: 5 * 60 * 1000,        // a lecturer check is reused for 5 minutes
    BODY_KEYS: ['contents', 'systemInstruction', 'generationConfig']
});

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const checked = new Map();              // token -> {uid, until}
const counts = new Map();               // uid -> {minute, n}

export default {
    /**
     * Cloudflare entry point.
     * @param {Request} request - incoming request
     * @param {object} env - GEMINI_KEY (secret), FIREBASE_PROJECT, ALLOWED_ORIGINS, MODEL
     * @returns {Promise<Response>} answer
     */
    async fetch(request, env)
    {
        return handle(request, env, fetch);
    }
};

/**
 * The whole Worker, with fetch passed in so tests can fake Google.
 * @param {Request} request - incoming request
 * @param {object} env - settings and the secret key
 * @param {function} send - fetch
 * @returns {Promise<Response>} answer
 */
export async function handle(request, env, send)
{
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);
    if (cors === null)
    {
        return json({ error: { message: 'origin not allowed' } }, 403, {});
    }
    if (request.method === 'OPTIONS')
    {
        return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST')
    {
        return json({ error: { message: 'POST only' } }, 405, cors);
    }
    if (!env.GEMINI_KEY)
    {
        return json({ error: { message: 'the Worker has no GEMINI_KEY secret' } }, 500, cors);
    }
    const token = bearer(request.headers.get('Authorization'));
    const claims = token ? tokenClaims(token) : null;
    if (claims === null || claims.aud !== env.FIREBASE_PROJECT || claims.exp * 1000 < Date.now())
    {
        return json({ error: { message: 'sign in as the lecturer' } }, 401, cors);
    }
    if (!await isLecturer(token, claims.user_id || claims.sub, env.FIREBASE_PROJECT, send))
    {
        return json({ error: { message: 'lecturer only' } }, 403, cors);
    }
    if (!underLimit(claims.user_id || claims.sub, Date.now()))
    {
        return json({ error: { message: 'too many requests, wait a minute' } }, 429, cors);
    }
    const length = Number(request.headers.get('Content-Length') || 0);
    if (length > LIMITS.MAX_BODY_BYTES)
    {
        return json({ error: { message: 'request too large' } }, 413, cors);
    }
    let body;
    try
    {
        body = cleanBody(await request.json());
    }
    catch (e)
    {
        return json({ error: { message: 'bad request' } }, 400, cors);
    }
    const res = await send(GEMINI_BASE + (env.MODEL || 'gemini-3.5-flash') + ':generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': env.GEMINI_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

/**
 * CORS headers for an allowed origin, or null.
 * @param {string} origin - request Origin
 * @param {string} allowed - comma-separated list
 * @returns {object|null} headers
 */
export function corsHeaders(origin, allowed)
{
    const list = String(allowed || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!list.includes(origin))
    {
        return null;
    }
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
        'Vary': 'Origin'
    };
}

/**
 * Reads the payload of a Firebase ID token WITHOUT trusting it (Firestore checks
 * the signature in isLecturer).
 * @param {string} token - JWT
 * @returns {object|null} claims
 */
export function tokenClaims(token)
{
    const parts = token.split('.');
    if (parts.length !== 3)
    {
        return null;
    }
    try
    {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)));
    }
    catch (e)
    {
        return null;
    }
}

/**
 * Keeps only the fields Gemini needs (no tools, no other models).
 * @param {object} body - request body
 * @returns {object} clean body
 */
export function cleanBody(body)
{
    if (!body || !Array.isArray(body.contents) || body.contents.length === 0)
    {
        throw new Error('no contents');
    }
    const out = {};
    for (const k of LIMITS.BODY_KEYS)
    {
        if (body[k] !== undefined)
        {
            out[k] = body[k];
        }
    }
    return out;
}

/**
 * Counts requests per lecturer per minute.
 * @param {string} uid - lecturer
 * @param {number} now - ms
 * @returns {boolean} allowed
 */
export function underLimit(uid, now)
{
    const minute = Math.floor(now / 60000);
    const c = counts.get(uid);
    if (!c || c.minute !== minute)
    {
        counts.set(uid, { minute: minute, n: 1 });
        return true;
    }
    c.n++;
    return c.n <= LIMITS.PER_MINUTE;
}

/**
 * Asks Firestore, with the user's own token, for staff/{uid}. Firestore verifies the
 * token and applies our rules (a user may read only their own staff document), so
 * 200 = a real, signed-in lecturer.
 * @param {string} token - Firebase ID token
 * @param {string} uid - user id from the token
 * @param {string} project - Firebase project id
 * @param {function} send - fetch
 * @returns {Promise<boolean>} lecturer
 */
async function isLecturer(token, uid, project, send)
{
    const hit = checked.get(token);
    if (hit && hit.until > Date.now())
    {
        return hit.uid === uid;
    }
    if (!uid || !/^[A-Za-z0-9]+$/.test(uid))
    {
        return false;
    }
    const url = 'https://firestore.googleapis.com/v1/projects/' + project
        + '/databases/(default)/documents/staff/' + uid;
    const res = await send(url, { headers: { 'Authorization': 'Bearer ' + token } });
    if (res.status !== 200)
    {
        return false;
    }
    checked.set(token, { uid: uid, until: Date.now() + LIMITS.CHECK_TTL_MS });
    return true;
}

/**
 * The token after "Bearer ".
 * @param {string|null} header - Authorization header
 * @returns {string} token or ''
 */
function bearer(header)
{
    const m = /^Bearer\s+(\S+)$/.exec(header || '');
    return m ? m[1] : '';
}

/**
 * A JSON response.
 * @param {object} data - body
 * @param {number} status - HTTP status
 * @param {object} headers - extra headers
 * @returns {Response} response
 */
function json(data, status, headers)
{
    return new Response(JSON.stringify(data), { status: status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
