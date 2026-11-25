// =====================================================================
//  ai.js - the only place the pages call for AI (Google Gemini)
// =====================================================================
// Decision (ours, 25 Nov 2026): Gemini instead of Groq, and the lecturer
// NEVER types a key ("works as you get it", like an operating system).
// The key is built in but private:
//   1. Firebase: the course admin puts it once in Firestore at
//      config/ai { geminiKey }. The security rules let only the lecturer
//      account read it; students and visitors never can.
//   2. Running from our own PC (demo / local server): an untracked file
//      js/ai-key.local.js (in .gitignore, never on GitHub).
// A key written into public code would be readable by anyone, so there
// is no third place.

import { geminiChat, geminiTranscribe } from './gemini.js';

/** Where the key comes from. */
export const AI = Object.freeze({
    LOCAL_FILE: '../ai-key.local.js',     // relative to this module: web/js/ai-key.local.js
    SOURCE_FIREBASE: 'firebase',
    SOURCE_LOCAL: 'local'
});

let key = '';
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
 * Returns the key or throws a clear error.
 * @returns {string} key
 */
function requireKey()
{
    if (key === '')
    {
        throw new Error('no-key');
    }
    return key;
}
