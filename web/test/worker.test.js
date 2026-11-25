// Tests of the Cloudflare AI Worker (worker/src/index.js) with a fake Google.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, corsHeaders, tokenClaims, cleanBody, underLimit, LIMITS } from '../../worker/src/index.js';
import { proxySender } from '../js/ai/ai.js';

const ENV = { GEMINI_KEY: 'SECRET', FIREBASE_PROJECT: 'oop-ex2', ALLOWED_ORIGINS: 'https://site.test', MODEL: 'm1' };
const SITE = 'https://site.test';

/** A fake Firebase ID token (the Worker never trusts it itself; Firestore checks it). */
function jwt(claims)
{
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return b({ alg: 'RS256' }) + '.' + b(claims) + '.sig';
}

/** Fake Google: Firestore says 200 only for the lecturer token; Gemini echoes. */
function fakeGoogle(log)
{
    return async (url, init) =>
    {
        log.push({ url: url, init: init });
        if (url.includes('firestore'))
        {
            return new Response('{}', { status: init.headers.Authorization.includes(LECTURER) ? 200 : 403 });
        }
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 });
    };
}

const exp = Math.floor(Date.now() / 1000) + 3600;
const LECTURER = jwt({ aud: 'oop-ex2', user_id: 'LECT1', exp: exp });
const STUDENT = jwt({ aud: 'oop-ex2', user_id: 'STUD1', exp: exp });

/**
 * A POST to the Worker.
 * @param {string} token - ID token ('' = none)
 * @param {string} origin - Origin header
 * @returns {Request} request
 */
function post(token, origin)
{
    const headers = { 'Content-Type': 'application/json', 'Origin': origin };
    if (token)
    {
        headers.Authorization = 'Bearer ' + token;
    }
    return new Request('https://worker.test/', {
        method: 'POST', headers: headers,
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hi' }] }], tools: [{ evil: 1 }] })
    });
}

test('TC-WRK-1: the lecturer gets an answer; the key is added only by the Worker; extra fields are dropped', async () =>
{
    const log = [];
    const res = await handle(post(LECTURER, SITE), ENV, fakeGoogle(log));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), SITE);
    const gemini = log.find((l) => l.url.includes('generativelanguage'));
    assert.ok(gemini.url.endsWith('/m1:generateContent'));
    assert.equal(gemini.init.headers['x-goog-api-key'], 'SECRET');
    assert.equal(JSON.parse(gemini.init.body).tools, undefined, 'only contents / systemInstruction / generationConfig');
});

test('TC-WRK-2: students, no token, other projects, expired tokens and other sites are refused', async () =>
{
    const log = [];
    assert.equal((await handle(post(STUDENT, SITE), ENV, fakeGoogle(log))).status, 403);
    assert.equal((await handle(post('', SITE), ENV, fakeGoogle(log))).status, 401);
    assert.equal((await handle(post(jwt({ aud: 'other', user_id: 'LECT1', exp: exp }), SITE), ENV, fakeGoogle(log))).status, 401);
    assert.equal((await handle(post(jwt({ aud: 'oop-ex2', user_id: 'LECT1', exp: 1 }), SITE), ENV, fakeGoogle(log))).status, 401);
    assert.equal((await handle(post(LECTURER, 'https://evil.test'), ENV, fakeGoogle(log))).status, 403);
    assert.ok(!log.some((l) => l.url.includes('generativelanguage')), 'Gemini was never called');
});

test('TC-WRK-3: helpers - CORS list, token payload, body cleaning, rate limit', () =>
{
    assert.equal(corsHeaders('https://a', 'https://a, https://b')['Access-Control-Allow-Origin'], 'https://a');
    assert.equal(corsHeaders('https://c', 'https://a'), null);
    assert.equal(tokenClaims(LECTURER).user_id, 'LECT1');
    assert.equal(tokenClaims('nope'), null);
    assert.throws(() => cleanBody({}), /no contents/);
    let allowed = 0;
    for (let i = 0; i < LIMITS.PER_MINUTE + 5; i++)
    {
        allowed += underLimit('u-limit', 60_000 * 1000) ? 1 : 0;
    }
    assert.equal(allowed, LIMITS.PER_MINUTE);
    assert.equal(underLimit('u-limit', 60_000 * 1001), true, 'a new minute starts again');
});

test('TC-WRK-4: the page side sends the sign-in token, never a key', async () =>
{
    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) =>
    {
        seen.push(init);
        return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    };
    try
    {
        await proxySender('https://worker.test', async () => 'ID-TOKEN')({ contents: [] });
    }
    finally
    {
        globalThis.fetch = realFetch;
    }
    assert.equal(seen[0].headers.Authorization, 'Bearer ID-TOKEN');
    assert.ok(!('x-goog-api-key' in seen[0].headers));
});
