// =====================================================================
//  headcount.js - count the people in a class photo, in the browser
// =====================================================================
// Model: COCO-SSD (TensorFlow.js), which finds 80 kinds of objects,
// among them "person". It runs on the lecturer's computer: the photo is
// never uploaded anywhere and nobody is identified - it only counts.

/** Tuning constants. */
export const HEAD = Object.freeze({
    MIN_SCORE: 0.35,          // lower = finds people at the back too, but more false hits
    MAX_BOXES: 200,           // a big lecture hall
    TFJS: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
    COCO: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'
});

let modelPromise = null;

/**
 * Keeps only confident "person" detections.
 * @param {{class:string, score:number, bbox:number[]}[]} predictions - model output
 * @param {number} minScore - threshold
 * @returns {{class:string, score:number, bbox:number[]}[]} people
 */
export function peopleOnly(predictions, minScore)
{
    return predictions.filter((p) => p.class === 'person' && p.score >= minScore);
}

/**
 * Compares the photo with the scans.
 * @param {number} people - counted in the photo (after manual correction)
 * @param {number} scannedInClass - in-class scans for this lecture
 * @returns {{suspicious:boolean, extra:number}} extra = scans beyond the people seen
 */
export function compareWithScans(people, scannedInClass)
{
    const extra = scannedInClass - people;
    return { suspicious: extra > 0, extra: Math.max(0, extra) };
}

/**
 * Counts people in an image element.
 * @param {HTMLImageElement} img - the loaded photo
 * @returns {Promise<{class:string, score:number, bbox:number[]}[]>} people found
 */
export async function detectPeople(img)
{
    const model = await loadModel();
    const predictions = await model.detect(img, HEAD.MAX_BOXES, HEAD.MIN_SCORE);
    return peopleOnly(predictions, HEAD.MIN_SCORE);
}

/**
 * Loads TensorFlow.js and COCO-SSD once (about 6 MB, cached by the browser).
 * @returns {Promise<object>} the model
 */
function loadModel()
{
    if (modelPromise === null)
    {
        modelPromise = loadScript(HEAD.TFJS)
            .then(() => loadScript(HEAD.COCO))
            .then(() => globalThis.cocoSsd.load({ base: 'mobilenet_v2' }));
    }
    return modelPromise;
}

/**
 * Adds a script tag and waits for it.
 * @param {string} src - URL
 * @returns {Promise<void>}
 */
function loadScript(src)
{
    return new Promise((resolve, reject) =>
    {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('could not load ' + src));
        document.head.append(s);
    });
}
