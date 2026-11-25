// Tests for the "QR you can't photograph" v2 (core/noisyqr.js): the flicker code.
// A simulated hand-held 30 fps camera films the screen (exposure blends phases,
// sensor noise, hand shake). TC-QR-1..11. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { matrixFromText, FlickerSchedule, squaresToGrey, ChangeMap, seededRandom, NOISE } from '../js/core/noisyqr.js';

const require = createRequire(import.meta.url);
const qrcode = require('../vendor/qrcode.js');
const jsQR = require('../vendor/jsQR.js');

const TEXT = 'SC2/K7Q2M9X4TB/8F3KQ2M9X4TB7Z';    // the real format: 25x25 squares
const SCALE = 8;           // camera pixels per square
const ROOM = 40;           // grey room around the screen, in pixels
const CAMERA_MS = 1000 / 30;
const EXPOSURE_MS = 16;

/**
 * Films one camera frame of the screen at time t (ms).
 * @returns {Uint8ClampedArray} grey frame, (side + 2*ROOM)^2 pixels
 */
function cameraFrame(plan, t, rng, shake)
{
    const a = squaresToGrey(plan.frame(Math.floor(t / NOISE.PHASE_MS)), plan.total, SCALE);
    const b = squaresToGrey(plan.frame(Math.floor((t + EXPOSURE_MS) / NOISE.PHASE_MS)), plan.total, SCALE);
    const side = a.side;
    const full = side + 2 * ROOM;
    const out = new Uint8ClampedArray(full * full).fill(120);
    for (let y = 0; y < side; y++)
    {
        for (let x = 0; x < side; x++)
        {
            const sx = Math.min(side - 1, Math.max(0, x + shake.x));
            const sy = Math.min(side - 1, Math.max(0, y + shake.y));
            const i = sy * side + sx;
            const noise = (rng() - 0.5) * 24;
            out[(y + ROOM) * full + (x + ROOM)] = (a.pixels[i] + b.pixels[i]) / 2 + noise;
        }
    }
    return out;
}

/**
 * Films n frames with a slow random-walk hand shake.
 * @returns {{frames:Uint8ClampedArray[], side:number}} frames
 */
function film(seed, n, shakeStep)
{
    const m = matrixFromText(qrcode, TEXT);
    const plan = new FlickerSchedule(m, seed * 7919);
    const rng = seededRandom(seed);
    const t0 = rng() * 10000;
    const shake = { x: 0, y: 0 };
    const frames = [];
    for (let k = 0; k < n; k++)
    {
        if (shakeStep > 0 && rng() < shakeStep)
        {
            shake.x += rng() < 0.5 ? -1 : 1;
            shake.y += rng() < 0.5 ? -1 : 1;
        }
        frames.push(cameraFrame(plan, t0 + k * CAMERA_MS, rng, shake));
    }
    return { frames: frames, side: Math.sqrt(frames[0].length) };
}

/**
 * Decodes a grey image with jsQR (normal and inverted).
 * @returns {string|null} text or null
 */
function decode(grey, side)
{
    const rgba = new Uint8ClampedArray(side * side * 4);
    for (let i = 0; i < side * side; i++)
    {
        rgba[i * 4] = grey[i];
        rgba[i * 4 + 1] = grey[i];
        rgba[i * 4 + 2] = grey[i];
        rgba[i * 4 + 3] = 255;
    }
    const r = jsQR(rgba, side, side, { inversionAttempts: 'attemptBoth' });
    return r ? r.data : null;
}

/**
 * Everything an attacker could do to one still photo: stretch the contrast,
 * then try it as is and black-and-white at several thresholds.
 * @returns {boolean} true when any version decodes
 */
function attackerReads(photo, side)
{
    let lo = 255;
    let hi = 0;
    for (const v of photo)
    {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
    }
    const stretched = photo.map((v) => 255 * (v - lo) / Math.max(1, hi - lo));
    if (decode(stretched, side) !== null)
    {
        return true;
    }
    for (const t of [64, 96, 128, 160, 192])
    {
        if (decode(stretched.map((v) => (v > t ? 255 : 0)), side) !== null)
        {
            return true;
        }
    }
    return false;
}

/**
 * Merges frames the way a phone's HDR / night mode does (average).
 * @returns {Uint8ClampedArray} the merged photo
 */
function mergedPhoto(frames)
{
    const out = new Float64Array(frames[0].length);
    for (const f of frames)
    {
        for (let i = 0; i < f.length; i++)
        {
            out[i] += f[i];
        }
    }
    return Uint8ClampedArray.from(out, (v) => v / frames.length);
}

/**
 * Runs our scanner like the real one: a sliding window of FRAMES frames,
 * a decode attempt every 3rd frame once the window is full.
 * @returns {string|null} decoded text
 */
function ourScanner(frames, side)
{
    const map = new ChangeMap(side * side, NOISE.FRAMES);
    for (let k = 0; k < frames.length; k++)
    {
        map.push(frames[k]);
        const full = map.count() >= Math.min(NOISE.FRAMES, frames.length);
        if (full && (k % 3 === 0 || k === frames.length - 1))
        {
            const text = decode(map.image(side), side);
            if (text !== null)
            {
                return text;
            }
        }
    }
    return null;
}

const TWO_SECONDS = 60;     // camera frames

test('TC-QR-1: the QR itself is valid (a clean drawing decodes)', () =>
{
    const m = matrixFromText(qrcode, TEXT);
    const total = m.size + 2 * NOISE.QUIET_ZONE;
    const squares = new Uint8Array(total * total);
    for (let r = 0; r < m.size; r++)
    {
        for (let c = 0; c < m.size; c++)
        {
            squares[(r + NOISE.QUIET_ZONE) * total + c + NOISE.QUIET_ZONE] = m.dark[r * m.size + c];
        }
    }
    const img = squaresToGrey(squares, total, SCALE);
    assert.equal(decode(img.pixels, img.side), TEXT);
});

test('TC-QR-2: a single photo never decodes, whatever the attacker does to it', () =>
{
    for (let seed = 1; seed <= 8; seed++)
    {
        const { frames, side } = film(seed, 1, 0);
        assert.equal(attackerReads(frames[0], side), false, 'seed ' + seed);
    }
});

test('TC-QR-3: a merged photo (HDR / night mode: 3, 10, 30, 90 frames) never decodes', () =>
{
    for (const k of [3, 10, 30, 90])
    {
        for (let seed = 1; seed <= 3; seed++)
        {
            const { frames, side } = film(seed * 13 + k, k, 0);
            assert.equal(attackerReads(mergedPhoto(frames), side), false, k + ' frames, seed ' + seed);
        }
    }
});

test('TC-QR-4: a merged photo is plain grey: dark and light squares look the same', () =>
{
    const m = matrixFromText(qrcode, TEXT);
    const plan = new FlickerSchedule(m, 12345);
    const PHASES = 800;
    let darkSum = 0;
    let darkN = 0;
    let lightSum = 0;
    let lightN = 0;
    for (let p = 0; p < PHASES; p++)
    {
        const f = plan.frame(p);
        for (let i = 0; i < f.length; i++)
        {
            if (plan.slow[i] === 1)
            {
                darkSum += f[i];
                darkN++;
            }
            else
            {
                lightSum += f[i];
                lightN++;
            }
        }
    }
    assert.ok(Math.abs(darkSum / darkN - 0.5) < 0.02, 'dark ' + darkSum / darkN);
    assert.ok(Math.abs(lightSum / lightN - 0.5) < 0.02, 'light ' + lightSum / lightN);
});

test('TC-QR-5: our scanner reads it within 2 s (steady phone)', () =>
{
    let ok = 0;
    for (let seed = 1; seed <= 10; seed++)
    {
        const { frames, side } = film(seed, TWO_SECONDS, 0);
        if (ourScanner(frames, side) === TEXT)
        {
            ok++;
        }
    }
    assert.equal(ok, 10, 'decoded ' + ok + '/10');
});

test('TC-QR-6: our scanner reads it within 2 s with hand shake', () =>
{
    let ok = 0;
    for (let seed = 1; seed <= 10; seed++)
    {
        const { frames, side } = film(seed + 100, TWO_SECONDS, 0.3);
        if (ourScanner(frames, side) === TEXT)
        {
            ok++;
        }
    }
    assert.ok(ok >= 9, 'decoded ' + ok + '/10');
});

test('TC-QR-7: a burst of 3 photos is not enough, even with our algorithm', () =>
{
    let ok = 0;
    for (let seed = 1; seed <= 10; seed++)
    {
        const { frames, side } = film(seed + 200, 3, 0);
        if (ourScanner(frames, side) !== null)
        {
            ok++;
        }
    }
    assert.equal(ok, 0);
});

test('TC-QR-8: a frozen picture held in front of the scanner (forwarded photo) never decodes', () =>
{
    const { frames, side } = film(5, 1, 0);
    const still = [];
    for (let k = 0; k < NOISE.FRAMES; k++)
    {
        still.push(frames[0]);
    }
    assert.equal(ourScanner(still, side), null);
    const map = new ChangeMap(side * side, NOISE.FRAMES);
    for (const f of still)
    {
        map.push(f);
    }
    assert.equal(map.hasSignal(), false);
});

// ---------------------------------------------------------------------
//  From the back of the class: the code is small in the camera picture
// ---------------------------------------------------------------------
const FAR = { W: 1280, H: 720, SIDE: 400, MIN_CROP: 200, FILL: 1.35, ZOOM_WHEN: 0.6 };

/**
 * A 720p camera films a room where the code covers only `frac` of the picture height.
 * `crop` is the part of the camera picture the scanner analyses (in camera pixels),
 * scaled to SIDE x SIDE like the real scanner does.
 * @returns {Uint8ClampedArray} grey analysed frame
 */
function farFrame(plan, box, t, crop, shake, rng)
{
    const n = plan.total;
    const a = plan.frame(Math.floor(t / NOISE.PHASE_MS));
    const b = plan.frame(Math.floor((t + EXPOSURE_MS) / NOISE.PHASE_MS));
    const g = new Uint8ClampedArray(FAR.SIDE * FAR.SIDE);
    for (let y = 0; y < FAR.SIDE; y++)
    {
        for (let x = 0; x < FAR.SIDE; x++)
        {
            let acc = 0;
            for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]])
            {
                const vx = crop.x + (x + sx) * crop.s / FAR.SIDE + shake.x;
                const vy = crop.y + (y + sy) * crop.s / FAR.SIDE + shake.y;
                const c = Math.floor((vx - box.x) / box.s * n);
                const r = Math.floor((vy - box.y) / box.s * n);
                let v = 60;                                   // the dark room around the screen
                if (r >= 0 && r < n && c >= 0 && c < n)
                {
                    v = ((a[r * n + c] ? 25 : 230) + (b[r * n + c] ? 25 : 230)) / 2;
                }
                acc += v;
            }
            g[y * FAR.SIDE + x] = acc / 4 + (rng() - 0.5) * 16;
        }
    }
    return g;
}

/**
 * Runs the scanner from far away, with or without zooming in on the code like scanner.js.
 * @returns {{text:string|null, box:object|null}} what was read, and the first box found
 */
function farScanner(frac, zoom, seed, shakeStep = 1.2)
{
    const plan = new FlickerSchedule(matrixFromText(qrcode, TEXT), seed * 131);
    const rng = seededRandom(seed);
    const s = frac * FAR.H;
    const box = { x: (FAR.W - s) / 2 + 40, y: (FAR.H - s) / 2 - 25, s: s };    // a bit off the middle
    const map = new ChangeMap(FAR.SIDE * FAR.SIDE, NOISE.FRAMES);
    let crop = { x: (FAR.W - FAR.H) / 2, y: 0, s: FAR.H };
    const shake = { x: 0, y: 0 };
    let firstBox = null;
    for (let k = 0; k < 3 * 30; k++)
    {
        shake.x += (rng() - 0.5) * shakeStep;
        shake.y += (rng() - 0.5) * shakeStep;
        map.push(farFrame(plan, box, k * CAMERA_MS, crop, shake, rng));
        if (map.count() >= NOISE.FRAMES && k % 3 === 0)
        {
            const text = decode(map.image(FAR.SIDE), FAR.SIDE);
            if (text !== null)
            {
                return { text: text, box: firstBox };
            }
            const b = map.activeBox();
            firstBox = firstBox || (b && { cx: crop.x + b.cx * crop.s / FAR.SIDE, cy: crop.y + b.cy * crop.s / FAR.SIDE });
            if (zoom && b !== null && b.size < FAR.ZOOM_WHEN * FAR.SIDE)
            {
                const per = crop.s / FAR.SIDE;
                const side = Math.max(FAR.MIN_CROP, b.size * FAR.FILL * per);
                if (side <= 0.8 * crop.s)
                {
                    crop = { x: crop.x + b.cx * per - side / 2, y: crop.y + b.cy * per - side / 2, s: side };
                    map.reset();
                }
            }
        }
    }
    return { text: null, box: firstBox };
}

test('TC-QR-9: the scanner finds where a small code is (the box around what changes)', () =>
{
    const r = farScanner(0.25, false, 5);
    const s = 0.25 * FAR.H;
    assert.ok(r.box !== null, 'no box found');
    assert.ok(Math.abs(r.box.cx - ((FAR.W - s) / 2 + 40 + s / 2)) < 15, 'box x off');
    assert.ok(Math.abs(r.box.cy - ((FAR.H - s) / 2 - 25 + s / 2)) < 15, 'box y off');
});

test('TC-QR-10: from the back of the class (code = 15-30% of the picture) zooming in reads it within 3 s', () =>
{
    for (const frac of [0.3, 0.2, 0.15])
    {
        for (const seed of [1, 2])
        {
            assert.equal(farScanner(frac, true, seed).text, TEXT, 'code at ' + frac + ', seed ' + seed);
        }
    }
    // without zooming, a code this small is not read (that was the bug)
    assert.equal(farScanner(0.2, false, 1).text, null);
});

test('TC-QR-11: zoomed in from far with a shaking hand (up to 8 camera px per frame) still reads within 3 s', () =>
{
    for (const step of [3, 8])
    {
        for (const seed of [1, 2])
        {
            assert.equal(farScanner(0.15, true, seed, step).text, TEXT, 'shake ' + step + ', seed ' + seed);
        }
    }
});

test('TC-QR-12: the scan engine (the scanner\'s second thread) reads the code from RGBA frames, ignores the old part after a reset', async () =>
{
    const { ScanEngine } = await import('../js/core/scan-engine.js');
    const { frames, side } = film(5, TWO_SECONDS, 0.3);
    const read = (rgba, w, h) =>
    {
        const r = jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' });
        return r && r.data ? r.data : null;
    };
    const rgbaOf = (g) =>
    {
        const out = new Uint8ClampedArray(g.length * 4);
        for (let i = 0; i < g.length; i++)
        {
            out[i * 4] = g[i];
            out[i * 4 + 1] = g[i];
            out[i * 4 + 2] = g[i];
            out[i * 4 + 3] = 255;
        }
        return out;
    };
    const engine = new ScanEngine(side, read);
    let text = null;
    let early = null;
    for (let k = 0; k < frames.length && text === null; k++)
    {
        const out = engine.handle({ rgba: rgbaOf(frames[k]), gen: 1, reset: k === 0, decode: k % 3 === 0 });
        if (k === 3)
        {
            early = out;                                   // not enough frames yet
        }
        if (out !== null && out.ready && out.text)
        {
            text = out.text;
            assert.ok(out.box !== null && out.view.length === side * side * 4);
        }
    }
    assert.equal(early.ready, false);
    assert.equal(text, TEXT);
    // a frozen picture (the same frame again and again) never reads
    const still = new ScanEngine(side, read);
    let frozen = null;
    for (let k = 0; k < 40; k++)
    {
        frozen = still.handle({ rgba: rgbaOf(frames[0]), gen: 1, reset: false, decode: true }) || frozen;
    }
    assert.equal(frozen.box, null);
});
