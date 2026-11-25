// =====================================================================
//  gemini.js - Google Gemini (free tier), the project's AI provider
// =====================================================================
// Two jobs: speech to text (Hebrew) and chat (summary, homework review).
// The key is passed in by ai.js (built in, never typed by the lecturer).
// Model names checked with this key against the models list (25 Nov 2026).

/** Models and limits. */
export const GEMINI = Object.freeze({
    BASE: 'https://generativelanguage.googleapis.com/v1beta/models/',
    MODEL: 'gemini-3.5-flash',              // answers in Hebrew; tested 25 Nov 2026
    MAX_INLINE_BYTES: 18 * 1024 * 1024      // audio sent inside the request (Gemini limit 20 MB)
});

/**
 * Turns OpenAI-style messages into a Gemini request body.
 * system -> systemInstruction, assistant -> role "model".
 * @param {{role:string, content:string}[]} messages - the conversation
 * @returns {object} the request body
 */
export function toGeminiBody(messages)
{
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));
    const body = { contents: contents, generationConfig: { temperature: 0.3 } };
    if (system !== '')
    {
        body.systemInstruction = { parts: [{ text: system }] };
    }
    return body;
}

/**
 * Reads the text out of a Gemini answer.
 * @param {object} data - the response body
 * @returns {string} the text ('' when the model returned nothing)
 */
export function textOf(data)
{
    const c = data.candidates && data.candidates[0];
    if (!c || !c.content || !c.content.parts)
    {
        return '';
    }
    return c.content.parts.map((p) => p.text || '').join('').trim();
}

/**
 * Asks Gemini.
 * @param {string} key - the API key
 * @param {{role:string, content:string}[]} messages - the conversation
 * @returns {Promise<string>} the answer
 */
export async function geminiChat(key, messages)
{
    return textOf(await call(key, toGeminiBody(messages)));
}

/**
 * Transcribes audio with Gemini (the audio goes inside the request).
 * @param {string} key - the API key
 * @param {Blob} audio - a recording
 * @param {string} language - ISO code, 'he' for Hebrew
 * @returns {Promise<string>} the text
 */
export async function geminiTranscribe(key, audio, language)
{
    if (audio.size > GEMINI.MAX_INLINE_BYTES)
    {
        throw new Error('file-too-large');
    }
    const data = await base64Of(audio);
    const lang = language === 'he' ? 'Hebrew' : 'the spoken language';
    const body = {
        contents: [{
            role: 'user',
            parts: [
                { text: 'Transcribe this lecture recording word by word in ' + lang + '. Output only the transcript, no comments.' },
                { inline_data: { mime_type: (audio.type || 'audio/webm').split(';')[0], data: data } }
            ]
        }],
        generationConfig: { temperature: 0 }
    };
    return textOf(await call(key, body));
}

/**
 * POSTs to generateContent and turns errors into exceptions with Google's message.
 * @param {string} key - the API key
 * @param {object} body - request body
 * @returns {Promise<object>} the response body
 */
async function call(key, body)
{
    const res = await fetch(GEMINI.BASE + GEMINI.MODEL + ':generateContent', {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
    {
        throw new Error(data.error && data.error.message ? data.error.message : 'HTTP ' + res.status);
    }
    return data;
}

/**
 * Reads a Blob as base64 (without the "data:...;base64," prefix).
 * @param {Blob} blob - data
 * @returns {Promise<string>} base64
 */
function base64Of(blob)
{
    return new Promise((resolve, reject) =>
    {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });
}
