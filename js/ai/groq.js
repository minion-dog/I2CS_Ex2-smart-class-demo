// =====================================================================
//  groq.js - the only place that talks to the AI (Groq)
// =====================================================================
// Groq is free and has Whisper (speech to text, supports Hebrew) and
// chat models. The key is pasted by the lecturer in Settings and kept
// ONLY in this browser (localStorage) - never in the code, never in
// Firestore, never in the Android app that students install.

/** Models and limits. Model names checked at console.groq.com/docs/models (Nov 2026). */
export const GROQ = Object.freeze({
    BASE: 'https://api.groq.com/openai/v1',
    SPEECH_MODEL: 'whisper-large-v3',       // best Whisper; handles Hebrew
    CHAT_MODEL: 'openai/gpt-oss-120b',      // production chat model with a 131k context
    MAX_AUDIO_BYTES: 100 * 1024 * 1024,     // Groq's file limit
    KEY_STORAGE: 'smartclass-groq-key'
});

/**
 * Returns the saved key, or '' when none.
 * @returns {string} key
 */
export function groqKey()
{
    try
    {
        return localStorage.getItem(GROQ.KEY_STORAGE) || '';
    }
    catch (e)
    {
        return '';
    }
}

/**
 * Saves the key on this device.
 * @param {string} key - the Groq API key
 */
export function saveGroqKey(key)
{
    localStorage.setItem(GROQ.KEY_STORAGE, key.trim());
}

/**
 * Transcribes audio to text.
 * @param {Blob} audio - a recording (webm, mp3, m4a, wav...)
 * @param {string} language - ISO code, 'he' for Hebrew
 * @returns {Promise<string>} the text
 * @throws {Error} 'no-key' without a key, or the API error
 */
export async function transcribe(audio, language)
{
    const key = requireKey();
    if (audio.size > GROQ.MAX_AUDIO_BYTES)
    {
        throw new Error('file-too-large');
    }
    const form = new FormData();
    form.append('file', audio, audio.name || 'audio.webm');
    form.append('model', GROQ.SPEECH_MODEL);
    form.append('language', language);
    form.append('response_format', 'json');
    const res = await fetch(GROQ.BASE + '/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key },
        body: form
    });
    const data = await readJson(res);
    return (data.text || '').trim();
}

/**
 * Asks the chat model.
 * @param {{role:string, content:string}[]} messages - the conversation
 * @returns {Promise<string>} the answer
 * @throws {Error} 'no-key' without a key, or the API error
 */
export async function chat(messages)
{
    const key = requireKey();
    const res = await fetch(GROQ.BASE + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GROQ.CHAT_MODEL, messages: messages, temperature: 0.3 })
    });
    const data = await readJson(res);
    return data.choices[0].message.content.trim();
}

/**
 * Returns the key or throws a clear error.
 * @returns {string} key
 */
function requireKey()
{
    const key = groqKey();
    if (key === '')
    {
        throw new Error('no-key');
    }
    return key;
}

/**
 * Reads a JSON answer and turns HTTP errors into exceptions with the API's message.
 * @param {Response} res - fetch response
 * @returns {Promise<object>} body
 */
async function readJson(res)
{
    const body = await res.json().catch(() => ({}));
    if (!res.ok)
    {
        const msg = body.error && body.error.message ? body.error.message : 'HTTP ' + res.status;
        throw new Error(msg);
    }
    return body;
}
