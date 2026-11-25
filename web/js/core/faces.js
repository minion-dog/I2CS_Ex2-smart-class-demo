// =====================================================================
//  faces.js - face boxes on the class photo (pure logic, no DOM)
// =====================================================================
// Decision (ours, 25 Nov 2026): the lecturer takes ONE class photo; every
// face gets a box; the lecturer fixes the boxes (tap a box = remove, tap a
// face with no box = add) and saves. After scanning the QR, each student
// taps their own face and confirms. One student per box. A student who
// cannot find themselves tells the lecturer at once.
//
// Boxes are stored as fractions of the photo (0..1), so they fit any
// screen size: {id, x, y, w, h} = number, left, top, width, height.
// The photo has a version: a new photo = new version, and students choose
// again. A student's record keeps {face: box id, photoV: version};
// face = NOT_FOUND means "I am not in the photo".

/** Tuning constants. */
export const FACES = Object.freeze({
    MERGE_IOU: 0.3,           // two boxes overlapping this much are the same face
    // How sure the local finder must be, by face size (tuned on the course's class photos,
    // 25 Nov 2026): small faces at the back are found with low scores; at the front the
    // false hits (hands, shirts, bags) are big, so big boxes need a high score.
    TRUST: [
        { below: 0.018, single: 0.55, repeated: 0.47 },   // back rows (found in 2+ tiles: easier)
        { below: 0.035, single: 0.62, repeated: 0.62 },   // middle rows
        { below: 2, single: 0.70, repeated: 0.70 }        // front rows
    ],
    MIN_SIDE: 0.008,          // smaller than this (of the photo) is noise
    DEFAULT_SIDE: 0.06,       // size of a box added by hand when there are no others
    HIT_SLACK: 0.6,           // a tap this far outside a small box (in box sizes) still hits it
    NOT_FOUND: -2,            // "I am not in the photo"
    PHOTO_MAX_SIDE: 1600,     // the stored photo is scaled down to this (Firestore doc < 1 MB)
    PHOTO_QUALITY: 0.72,
    DETECT_MAX_SIDE: 4032      // faces are searched at up to this size (a 12 MP phone photo)
});

/**
 * Overlap of two boxes: intersection / union (0 = apart, 1 = the same).
 * @param {{x:number,y:number,w:number,h:number}} a - box
 * @param {{x:number,y:number,w:number,h:number}} b - box
 * @returns {number} IoU in 0..1
 */
export function iou(a, b)
{
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const inter = ix * iy;
    const union = a.w * a.h + b.w * b.h - inter;
    return union <= 0 ? 0 : inter / union;
}

/**
 * Keeps one box per face: higher score first, drops boxes that overlap a kept
 * one (non-maximum suppression), drops tiny noise, clamps to the photo.
 * @param {{x:number,y:number,w:number,h:number,score?:number}[]} boxes - candidates
 * @returns {{x:number,y:number,w:number,h:number}[]} clean boxes, top-to-bottom then left-to-right
 */
export function mergeBoxes(boxes)
{
    const sorted = boxes
        .map(clampBox)
        .filter((b) => b !== null && b.w >= FACES.MIN_SIDE && b.h >= FACES.MIN_SIDE)
        .sort((a, b) => (b.score || 0) - (a.score || 0));
    const kept = [];
    for (const b of sorted)
    {
        if (kept.every((k) => iou(k, b) < FACES.MERGE_IOU && !inside(b, k) && !inside(k, b)))
        {
            kept.push(b);
        }
    }
    return readingOrder(kept.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })));
}

/**
 * Cleans the local finder's raw hits: hits of the same face from overlapping tiles are
 * grouped; a group is kept only if its best score is high enough for its size (FACES.TRUST).
 * @param {{x:number,y:number,w:number,h:number,score:number}[]} raw - all hits, all tiles
 * @returns {{x:number,y:number,w:number,h:number,score:number}[]} trusted faces
 */
export function trustLocal(raw)
{
    const groups = [];
    for (const b of raw.slice().sort((a, c) => c.score - a.score))
    {
        const g = groups.find((k) => iou(k.box, b) > FACES.MERGE_IOU);
        if (g)
        {
            g.support++;
        }
        else
        {
            groups.push({ box: b, support: 1 });
        }
    }
    return groups
        .filter((g) =>
        {
            const level = FACES.TRUST.find((t) => g.box.h < t.below);
            return g.box.score >= (g.support >= 2 ? level.repeated : level.single);
        })
        .map((g) => g.box);
}

/**
 * Reads Gemini's answer: a JSON list of {box_2d: [ymin, xmin, ymax, xmax]} in 0..1000.
 * Tolerates ```json fences and extra text around the list.
 * @param {string} text - model output
 * @returns {{x:number,y:number,w:number,h:number}[]} boxes (fractions)
 */
export function parseGeminiBoxes(text)
{
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start)
    {
        return [];
    }
    let list;
    try
    {
        list = JSON.parse(text.slice(start, end + 1));
    }
    catch (e)
    {
        return [];
    }
    const out = [];
    for (const item of Array.isArray(list) ? list : [])
    {
        const b = item && (item.box_2d || item.box || item);
        if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite))
        {
            continue;
        }
        const [ymin, xmin, ymax, xmax] = b;
        out.push({ x: xmin / 1000, y: ymin / 1000, w: (xmax - xmin) / 1000, h: (ymax - ymin) / 1000, score: 1 });
    }
    return mergeBoxes(out);
}

/**
 * Splits a photo into overlapping square tiles, so a small face at the back
 * becomes big enough for the local detector.
 * @param {number} width - photo width in pixels
 * @param {number} height - photo height in pixels
 * @param {number} tile - tile side in pixels
 * @param {number} overlap - 0..0.9, how much neighbouring tiles share
 * @returns {{x:number,y:number,side:number}[]} tiles in pixels
 */
export function tiles(width, height, tile, overlap)
{
    const side = Math.min(tile, width, height);
    const step = Math.max(1, Math.floor(side * (1 - overlap)));
    const xs = positions(width, side, step);
    const ys = positions(height, side, step);
    const out = [];
    for (const y of ys)
    {
        for (const x of xs)
        {
            out.push({ x: x, y: y, side: side });
        }
    }
    return out;
}

/**
 * Finds the box under a tap. Small boxes get some slack so a finger can hit them;
 * when two boxes are near, the one whose centre is closest wins.
 * @param {{x:number,y:number,w:number,h:number}[]} boxes - boxes
 * @param {number} px - tap x (fraction)
 * @param {number} py - tap y (fraction)
 * @returns {number} index, or -1 for none
 */
export function hitTest(boxes, px, py)
{
    let best = -1;
    let bestD = Infinity;
    boxes.forEach((b, i) =>
    {
        const sx = b.w * FACES.HIT_SLACK;
        const sy = b.h * FACES.HIT_SLACK;
        if (px < b.x - sx || px > b.x + b.w + sx || py < b.y - sy || py > b.y + b.h + sy)
        {
            return;
        }
        const d = Math.hypot((b.x + b.w / 2 - px) / b.w, (b.y + b.h / 2 - py) / b.h);
        if (d < bestD)
        {
            bestD = d;
            best = i;
        }
    });
    return best;
}

/**
 * Makes a box for a face the detector missed, centred on the tap, the size
 * of the nearest boxes (faces near each other are about the same size).
 * @param {{x:number,y:number,w:number,h:number}[]} boxes - existing boxes
 * @param {number} px - tap x (fraction)
 * @param {number} py - tap y (fraction)
 * @param {number} aspect - photo width / height (so the new box is square on screen)
 * @returns {{x:number,y:number,w:number,h:number}} the new box
 */
export function boxAt(boxes, px, py, aspect)
{
    let w = FACES.DEFAULT_SIDE;
    let h = FACES.DEFAULT_SIDE * aspect;
    if (boxes.length > 0)
    {
        const near = boxes
            .map((b) => ({ b: b, d: Math.hypot(b.x + b.w / 2 - px, b.y + b.h / 2 - py) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 3)
            .map((n) => n.b);
        w = median(near.map((b) => b.w));
        h = median(near.map((b) => b.h));
    }
    return clampBox({ x: px - w / 2, y: py - h / 2, w: w, h: h });
}

/**
 * Gives every box a number that never changes (the lecturer may remove or add
 * boxes after students chose theirs). New boxes get the next free number.
 * @param {{id?:number}[]} boxes - boxes, some maybe without id
 * @returns {{id:number,x:number,y:number,w:number,h:number}[]} boxes with ids
 */
export function withIds(boxes)
{
    let next = boxes.reduce((m, b) => Math.max(m, Number.isInteger(b.id) ? b.id : 0), 0) + 1;
    return boxes.map((b) => ({
        id: Number.isInteger(b.id) ? b.id : next++,
        x: round4(b.x), y: round4(b.y), w: round4(b.w), h: round4(b.h)
    }));
}

/**
 * Who chose which box in the CURRENT photo.
 * @param {{email:string, face?:number, photoV?:number}[]} attendance - records
 * @param {number} version - current photo version
 * @returns {Map<number, string>} box id -> email
 */
export function claimsOf(attendance, version)
{
    const map = new Map();
    for (const r of attendance)
    {
        if (r.photoV === version && Number.isInteger(r.face) && r.face > 0 && !map.has(r.face))
        {
            map.set(r.face, r.email);
        }
    }
    return map;
}

/**
 * What a student still has to do after scanning.
 * @param {{face?:number, photoV?:number}|null} record - my attendance record
 * @param {{v:number}|null} photo - the class photo (null = none yet)
 * @returns {string} 'scan' | 'done' | 'pick' | 'told' | 'nophoto'
 */
export function myStep(record, photo)
{
    if (!record)
    {
        return 'scan';
    }
    if (!photo)
    {
        return 'nophoto';
    }
    if (record.photoV !== photo.v)
    {
        return 'pick';
    }
    return record.face === FACES.NOT_FOUND ? 'told' : 'done';
}

/**
 * Numbers for the lecturer: faces, confirmed, not in photo, scanned but not yet chosen.
 * @param {{id:number}[]} boxes - boxes of the saved photo
 * @param {{status:string, face?:number, photoV?:number}[]} attendance - records
 * @param {number} version - photo version
 * @returns {{faces:number, confirmed:number, notFound:number, waiting:number, freeFaces:number}} counts
 */
export function photoStats(boxes, attendance, version)
{
    const ids = new Set(boxes.map((b) => b.id));
    // a student marked by hand may also tap his face: he counts once he did; "waiting" is
    // only for students who scanned (one marked by hand may have no phone)
    const inClass = attendance.filter((r) => r.status === 'present' || r.status === 'manual');
    const confirmed = [...claimsOf(inClass, version).keys()].filter((id) => ids.has(id)).length;
    const notFound = inClass.filter((r) => r.photoV === version && r.face === FACES.NOT_FOUND).length;
    const waiting = attendance.filter((r) => r.status === 'present' && r.photoV !== version).length;
    return {
        faces: boxes.length,
        confirmed: confirmed,
        notFound: notFound,
        waiting: waiting,
        freeFaces: Math.max(0, boxes.length - confirmed)
    };
}

/**
 * The id of a claim document: one per box per photo version, so two students
 * can never take the same box (the second create fails).
 * @param {number} version - photo version
 * @param {number} id - box id
 * @returns {string} claim id
 */
export function claimId(version, id)
{
    return version + '_' + id;
}

/**
 * A box the student places himself (his face has no box, or he is cut off at the
 * edge of the photo): centred on the tap, sized like the boxes around it. A tap on
 * the very edge still gives a box (it may stick out; it is clamped to the photo).
 * @param {{x:number,y:number,w:number,h:number}[]} boxes - existing boxes
 * @param {number} px - tap x (fraction)
 * @param {number} py - tap y (fraction)
 * @param {number} aspect - photo width / height
 * @returns {{x:number,y:number,w:number,h:number}} the requested box
 */
export function requestedBox(boxes, px, py, aspect)
{
    return boxAt(boxes, Math.min(1, Math.max(0, px)), Math.min(1, Math.max(0, py)), aspect);
}

/**
 * The part of the photo Gemini gets to check a requested box: the box with room around it
 * (3 box sizes each way), clamped to the photo, in pixels.
 * @param {{x:number,y:number,w:number,h:number}} b - requested box (fractions)
 * @param {number} W - photo width in pixels
 * @param {number} H - photo height in pixels
 * @returns {{sx:number,sy:number,sw:number,sh:number, box:{x:number,y:number,w:number,h:number}}} crop and the box inside it (pixels)
 */
export function checkCrop(b, W, H)
{
    const side = Math.max(b.w * W, b.h * H) * 7;
    const cx = (b.x + b.w / 2) * W;
    const cy = (b.y + b.h / 2) * H;
    const sx = Math.max(0, Math.round(cx - side / 2));
    const sy = Math.max(0, Math.round(cy - side / 2));
    const sw = Math.min(W, Math.round(cx + side / 2)) - sx;
    const sh = Math.min(H, Math.round(cy + side / 2)) - sy;
    return { sx: sx, sy: sy, sw: sw, sh: sh, box: { x: b.x * W - sx, y: b.y * H - sy, w: b.w * W, h: b.h * H } };
}

/**
 * Reads Gemini's yes / no about a requested box.
 * @param {string} text - model output, e.g. {"person": true, "reason": "..."}
 * @returns {{person:boolean, reason:string}|null} the answer, or null when unreadable
 */
export function parseCheck(text)
{
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start)
    {
        return null;
    }
    try
    {
        const o = JSON.parse(text.slice(start, end + 1));
        if (typeof o.person !== 'boolean')
        {
            return null;
        }
        return { person: o.person, reason: String(o.reason || '').slice(0, 200) };
    }
    catch (e)
    {
        return null;
    }
}

/**
 * Compares the photo with the scans.
 * @param {number} people - faces in the photo (after the lecturer's fixes)
 * @param {number} scannedInClass - in-class scans for this lecture
 * @returns {{suspicious:boolean, extra:number}} extra = scans beyond the faces seen
 */
export function compareWithScans(people, scannedInClass)
{
    const extra = scannedInClass - people;
    return { suspicious: extra > 0, extra: Math.max(0, extra) };
}

/**
 * Size to scale a photo down to before storing it.
 * @param {number} w - width
 * @param {number} h - height
 * @returns {{w:number,h:number}} new size (never bigger)
 */
export function storedSize(w, h)
{
    const k = Math.min(1, FACES.PHOTO_MAX_SIDE / Math.max(w, h));
    return { w: Math.round(w * k), h: Math.round(h * k) };
}

// ------------------------------------------------------------- helpers

/**
 * Rounds to 4 digits (smaller documents).
 * @param {number} v - value
 * @returns {number} rounded
 */
function round4(v)
{
    return Math.round(v * 10000) / 10000;
}

/**
 * Clamps a box to the photo; null when nothing is left.
 * @param {{x:number,y:number,w:number,h:number,score?:number}} b - box
 * @returns {object|null} clamped box
 */
function clampBox(b)
{
    const x = Math.max(0, b.x);
    const y = Math.max(0, b.y);
    const w = Math.min(1, b.x + b.w) - x;
    const h = Math.min(1, b.y + b.h) - y;
    if (!(w > 0) || !(h > 0))
    {
        return null;
    }
    return { x: x, y: y, w: w, h: h, score: b.score };
}

/**
 * True when a is (almost) inside b - a detector sometimes finds a face and part of it.
 * @param {object} a - box
 * @param {object} b - box
 * @returns {boolean} inside
 */
function inside(a, b)
{
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy >= 0.8 * a.w * a.h;
}

/**
 * Sorts boxes in rows (like reading), so box numbers make sense on screen.
 * @param {object[]} boxes - boxes
 * @returns {object[]} sorted
 */
function readingOrder(boxes)
{
    if (boxes.length === 0)
    {
        return boxes;
    }
    const rowH = median(boxes.map((b) => b.h));
    return boxes.slice().sort((a, b) =>
    {
        const ra = Math.round((a.y + a.h / 2) / rowH);
        const rb = Math.round((b.y + b.h / 2) / rowH);
        return ra !== rb ? ra - rb : a.x - b.x;
    });
}

/**
 * Tile start positions along one side (the last tile touches the edge).
 * @param {number} length - side length
 * @param {number} side - tile side
 * @param {number} step - distance between tiles
 * @returns {number[]} positions
 */
function positions(length, side, step)
{
    const out = [];
    for (let p = 0; p + side < length; p += step)
    {
        out.push(p);
    }
    out.push(length - side);
    return out;
}

/**
 * Median of numbers.
 * @param {number[]} v - values (not empty)
 * @returns {number} median
 */
function median(v)
{
    const s = v.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
