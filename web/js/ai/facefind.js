// =====================================================================
//  facefind.js - find the faces in the class photo
// =====================================================================
// Two finders, results merged (the lecturer fixes what is left):
//   1. Gemini (when AI is set up): best at small faces at the back,
//      faces turned sideways, partly hidden faces.
//   2. MediaPipe Face Detector, in this browser, free, no upload. Its model
//      is made for faces close to the camera, so the photo is cut into
//      overlapping tiles: a small face at the back fills a tile and is found.
// This replaces the old COCO-SSD "person" count: a box per FACE is what a
// student can recognise and tap.

import { mergeBoxes, parseGeminiBoxes, tiles, trustLocal } from '../core/faces.js';
import { aiReady, see } from './ai.js';

/** Settings of the local finder. */
export const FINDER = Object.freeze({
    VISION: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
    MODEL: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    MIN_SCORE: 0.5,
    TILES: [0.3, 0.14, 0.07], // tile sides as parts of the photo's long side: big faces, middle rows, back rows
    OVERLAP: 0.4,
    PROMPT: 'This is a photo of students in a classroom or lecture hall. Find EVERY human face, '
        + 'including small faces far at the back, faces turned sideways or down, and partly hidden faces. '
        + 'Return only a JSON list, one item per face: [{"box_2d": [ymin, xmin, ymax, xmax]}], '
        + 'coordinates normalized to 0-1000. No labels, no other text.'
});

let detectorPromise = null;

/**
 * Finds faces with every finder available and merges them.
 * @param {HTMLCanvasElement} canvas - the photo
 * @param {string} jpegBase64 - the same photo as JPEG base64 (for Gemini)
 * @param {function(string):void} status - progress text
 * @returns {Promise<{boxes:object[], used:string[]}>} boxes (fractions) and the finders that worked
 */
export async function findFaces(canvas, jpegBase64, status)
{
    const jobs = [];
    const used = [];
    if (aiReady())
    {
        jobs.push(see(FINDER.PROMPT, jpegBase64, true)
            .then((text) => { used.push('Gemini'); return parseGeminiBoxes(text); }));
    }
    jobs.push(findLocal(canvas, status)
        .then((boxes) => { used.push('MediaPipe'); return trustLocal(boxes); }));
    const results = await Promise.allSettled(jobs);
    const all = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
    if (used.length === 0)
    {
        throw results.find((r) => r.status === 'rejected').reason;
    }
    return { boxes: mergeBoxes(all), used: used };
}

/**
 * The local finder: whole photo + overlapping tiles at three sizes (raw hits, not yet cleaned).
 * @param {HTMLCanvasElement} canvas - the photo
 * @param {function(string):void} status - progress text
 * @returns {Promise<object[]>} boxes (fractions, with score)
 */
export async function findLocal(canvas, status)
{
    const detector = await loadDetector();
    const W = canvas.width;
    const H = canvas.height;
    const found = [];
    let parts = [{ x: 0, y: 0, side: Math.max(W, H), whole: true }];
    for (const k of FINDER.TILES)
    {
        parts = parts.concat(tiles(W, H, Math.round(k * Math.max(W, H)), FINDER.OVERLAP));
    }
    const tile = document.createElement('canvas');
    const ctx = tile.getContext('2d');
    let done = 0;
    for (const p of parts)
    {
        const sw = p.whole ? W : p.side;
        const sh = p.whole ? H : p.side;
        tile.width = sw;
        tile.height = sh;
        ctx.drawImage(canvas, p.x, p.y, sw, sh, 0, 0, sw, sh);
        const result = detector.detect(tile);
        for (const d of result.detections)
        {
            const score = d.categories && d.categories[0] ? d.categories[0].score : 0;
            const b = d.boundingBox;
            if (score < FINDER.MIN_SCORE || !b)
            {
                continue;
            }
            found.push({ x: (p.x + b.originX) / W, y: (p.y + b.originY) / H, w: b.width / W, h: b.height / H, score: score * 0.9 });   // a bit below Gemini's, which wins ties
        }
        done++;
        if (done % 8 === 0)
        {
            status(Math.round(100 * done / parts.length) + '%');
            await new Promise((r) => setTimeout(r, 0));   // let the page breathe
        }
    }
    return found;
}

/**
 * Loads MediaPipe once (a few MB, cached by the browser).
 * @returns {Promise<object>} FaceDetector
 */
function loadDetector()
{
    if (detectorPromise === null)
    {
        detectorPromise = (async () =>
        {
            const vision = await import(FINDER.VISION + '/vision_bundle.mjs');
            const files = await vision.FilesetResolver.forVisionTasks(FINDER.VISION + '/wasm');
            return vision.FaceDetector.createFromOptions(files, {
                baseOptions: { modelAssetPath: FINDER.MODEL },
                runningMode: 'IMAGE',
                minDetectionConfidence: FINDER.MIN_SCORE
            });
        })();
        detectorPromise.catch(() => { detectorPromise = null; });
    }
    return detectorPromise;
}
