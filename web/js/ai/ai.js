// =====================================================================
//  ai.js - the only place the pages call for AI (Google Gemini)
// =====================================================================
// Decision (ours, 25 Nov 2026): Gemini instead of Groq, and the lecturer
// NEVER types a key ("works as you get it", like an operating system).
// The key is built in but private. Where it comes from, best first:
//   1. Cloudflare Worker (worker/): the key is a secret of the Worker and
//      NEVER reaches any browser. The page sends the request with the
//      lecturer's Firebase sign-in token; the Worker checks with Firestore
//      that this is the lecturer, then calls Gemini. Address in ai-config.js.
//   2. Firebase: config/ai { geminiKey }, readable only by the lecturer.
//   3. Running from our own PC (demo / local server): an untracked file
//      js/ai-key.local.js (in .gitignore, never on GitHub).
// A key written into public code would be readable by anyone, so there
// is no fourth place.

import { geminiChat, geminiTranscribe, geminiVision, answerOf } from './gemini.js';
import { AI_PROXY } from '../ai-config.js';

/** Where the key comes from. */
export const AI = Object.freeze({
    LOCAL_FILE: '../ai-key.local.js',     // relative to this module: web/js/ai-key.local.js
    SOURCE_PROXY: 'worker',
    SOURCE_FIREBASE: 'firebase',
    SOURCE_LOCAL: 'local'
});

let key = '';                  // a key string, or a sender function (Worker)
let source = null;

/**
 * Finds the built-in key: first from the store (Firebase, lecturer only), then
 * from the local untracked file. Safe to call many times.
 * @param {object} store - the data store (may have loadAiKey())
 * @returns {Promise<boolean>} true when AI is ready
 */
export async function initAi(store)
{
    if (key !== '')
    {
        return true;
    }
    if (AI_PROXY && store && typeof store.idToken === 'function')
    {
        key = proxySender(AI_PROXY, () => store.idToken());
        source = AI.SOURCE_PROXY;
        return true;
    }
    if (store && typeof store.loadAiKey === 'function')
    {
        try
        {
            key = (await store.loadAiKey()) || '';
            source = key ? AI.SOURCE_FIREBASE : null;
        }
        catch (e)
        {
            key = '';
        }
    }
    if (key === '')
    {
        try
        {
            const local = await import(AI.LOCAL_FILE);
            key = String(local.GEMINI_KEY || '').trim();
            source = key ? AI.SOURCE_LOCAL : null;
        }
        catch (e)
        {
            key = '';                       // no local file: normal on the public site
        }
    }
    return key !== '';
}

/**
 * Tells whether a built-in key was found.
 * @returns {boolean} true when AI can be used
 */
export function aiReady()
{
    return key !== '';
}

/**
 * Where the key came from (for the about line), or null.
 * @returns {string|null} 'firebase' | 'local' | null
 */
export function aiSource()
{
    return source;
}

/**
 * Asks the model.
 * @param {{role:string, content:string}[]} messages - the conversation
 * @returns {Promise<string>} the answer
 * @throws {Error} 'no-key' when AI is not set up
 */
export async function chat(messages)
{
    return geminiChat(requireKey(), messages);
}

/**
 * Transcribes audio to text.
 * @param {Blob} audio - a recording
 * @param {string} language - ISO code, 'he' for Hebrew
 * @returns {Promise<string>} the text
 * @throws {Error} 'no-key' when AI is not set up
 */
export async function transcribe(audio, language)
{
    return geminiTranscribe(requireKey(), audio, language);
}

/**
 * Asks the model about a picture.
 * @param {string} prompt - what to do
 * @param {string} base64 - JPEG, base64 without prefix
 * @param {boolean} json - true for a JSON answer
 * @returns {Promise<string>} the answer
 */
export async function see(prompt, base64, json)
{
    return geminiVision(requireKey(), prompt, base64, json);
}

/**
 * Builds the Worker route: every request goes to the Worker with the
 * lecturer's sign-in token; the Worker adds the key.
 * @param {string} url - Worker address
 * @param {function():Promise<string>} token - gets a fresh Firebase ID token
 * @returns {function(object):Promise<object>} sender
 */
export function proxySender(url, token)
{
    return async (body) =>
    {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + await token(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return answerOf(res);
    };
}

/**
 * For tests: forgets the key.
 */
export function resetAi()
{
    key = '';
    source = null;
}

/**
 * Returns the key or throws a clear error.
 * @returns {string|function} key or sender
 */
function requireKey()
{
    if (key === '')
    {
        throw new Error('no-key');
    }
    return key;
}
