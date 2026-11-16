// =====================================================================
//  recorder.js - record the lecture and transcribe it piece by piece
// =====================================================================
// WHY pieces of 60 s: sending one 2-hour file at the end is slow and one
// failure loses everything. Each minute the recorder is stopped and
// restarted (so every piece is a complete, playable file), the piece is
// sent to Whisper, and its text is stored as transcript/<n>. Students see
// the transcript grow during the lecture.

import { transcribe } from '../ai/groq.js';

const PIECE_MS = 60000;
const LANGUAGE = 'he';     // the lecturer teaches in Hebrew (SRS section 9)

/** Records the microphone in 60-second pieces and transcribes each one. */
export class LectureRecorder
{
    /**
     * Creates a recorder for one session.
     * @param {object} store - data layer
     * @param {string} sid - session
     * @param {function(string):void} onStatus - progress messages
     */
    constructor(store, sid, onStatus)
    {
        this.store = store;
        this.sid = sid;
        this.onStatus = onStatus;
        this.stream = null;
        this.recorder = null;
        this.timer = null;
        this.index = Date.now();   // piece numbers stay in order even across restarts
        this.active = false;
    }

    /**
     * Starts recording.
     * @returns {Promise<void>}
     */
    async start()
    {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.active = true;
        this.recordPiece();
    }

    /** Stops after the current piece. */
    stop()
    {
        this.active = false;
        clearTimeout(this.timer);
        if (this.recorder && this.recorder.state !== 'inactive')
        {
            this.recorder.stop();
        }
        if (this.stream)
        {
            for (const tr of this.stream.getTracks())
            {
                tr.stop();
            }
        }
    }

    /** Records one piece, then sends it and starts the next. */
    recordPiece()
    {
        const chunks = [];
        const rec = new MediaRecorder(this.stream);
        this.recorder = rec;
        const myIndex = this.index++;
        rec.ondataavailable = (ev) =>
        {
            if (ev.data.size > 0)
            {
                chunks.push(ev.data);
            }
        };
        rec.onstop = () =>
        {
            const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
            this.sendPiece(myIndex, blob);
            if (this.active)
            {
                this.recordPiece();
            }
        };
        rec.start();
        this.timer = setTimeout(() =>
        {
            if (rec.state !== 'inactive')
            {
                rec.stop();
            }
        }, PIECE_MS);
    }

    /**
     * Transcribes one piece and stores it.
     * @param {number} index - piece number
     * @param {Blob} blob - audio
     */
    async sendPiece(index, blob)
    {
        if (blob.size < 2000)
        {
            return;     // silence or a too-short tail
        }
        try
        {
            this.onStatus('…');
            const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
            const file = new File([blob], 'piece-' + index + '.' + ext, { type: blob.type });
            const text = await transcribe(file, LANGUAGE);
            if (text !== '')
            {
                await this.store.addTranscript(this.sid, index, text);
            }
            this.onStatus('✓');
        }
        catch (e)
        {
            this.onStatus(e.message);
        }
    }
}

/**
 * Transcribes an uploaded recording file in one request.
 * @param {object} store - data layer
 * @param {string} sid - session
 * @param {File} file - audio or video file (Groq limit: 100 MB)
 * @returns {Promise<void>}
 */
export async function transcribeUpload(store, sid, file)
{
    const text = await transcribe(file, LANGUAGE);
    await store.addTranscript(sid, Date.now(), text);
}
