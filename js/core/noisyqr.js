// =====================================================================
//  noisyqr.js - the "QR you can't photograph" (version 2: flicker code)
// =====================================================================
// WHY version 2: version 1 drew the QR with noise that cancels out when
// frames are averaged. Real phones take a photo by MERGING several frames
// (HDR, night mode), which is averaging, so photos could be read. Here
// the QR is hidden in HOW FAST each square changes, not in its colour:
//
//   * every square shows a random colour (black or white);
//   * a DARK square of the QR keeps its random colour for HOLD phases;
//   * a LIGHT square (and the quiet border) gets a new random colour
//     every phase.
//
// So any single frame is random dots, and the average of ANY number of
// frames is plain grey (each square is black half of the time). A photo -
// even a merged one - carries nothing. Our scanner measures, for every
// pixel, how much it CHANGES between consecutive camera frames: light
// squares change a lot, dark squares hardly change, and that "change map"
// IS the QR. Only a live video can do this.
//
// Pure logic, no DOM: the same file runs in the browser and in Node tests.
// The Android app has the same algorithm in Java (core/FlickerSchedule,
// core/ChangeMap).

// ---------------------------------------------------------------------
//  CONSTANTS
// ---------------------------------------------------------------------

/** Tuning constants (checked with a simulation of a hand-held 30 fps camera). */
export const NOISE = Object.freeze({
    PHASE_MS: 33,              // a new phase every 33 ms (30 per second)
    HOLD: 8,                   // a dark square keeps its colour for 8 phases (~0.27 s)
    FRAMES: 25,                // camera frames in the change map (~0.8 s at 30 fps)
    BLUR_SIGMA: 1.5,           // smooths square edges in the change map (pixels, at 400 px)
    ERROR_CORRECTION: 'H',     // highest QR error correction (30 %)
    QUIET_ZONE: 4,             // white border in modules, required by the QR standard
    DARK: 0,
    LIGHT: 255
});

// ---------------------------------------------------------------------
//  BUILD THE MATRIX
// ---------------------------------------------------------------------

/**
 * Builds the QR module matrix for a text.
 * @param {object} qrcodeLib - the qrcode-generator library (injected so this file stays pure)
 * @param {string} text - what the QR holds
 * @returns {{size:number, dark:Uint8Array}} size = modules per side; dark[r*size+c] = 1 for dark
 */
export function matrixFromText(qrcodeLib, text)
{
    const qr = qrcodeLib(0, NOISE.ERROR_CORRECTION);
    qr.addData(text);
    qr.make();
    const size = qr.getModuleCount();
    const dark = new Uint8Array(size * size);
    for (let r = 0; r < size; r++)
    {
        for (let c = 0; c < size; c++)
        {
            dark[r * size + c] = qr.isDark(r, c) ? 1 : 0;
        }
    }
    return { size: size, dark: dark };
}

// ---------------------------------------------------------------------
//  THE SCREEN SIDE: WHAT EACH PHASE SHOWS
// ---------------------------------------------------------------------

/**
 * Decides the colour of every square in every phase, including the quiet border
 * (the border is "light", so it flickers fast and frames the code in the change map).
 */
export class FlickerSchedule
{
    /**
     * Builds the plan for one QR.
     * @param {{size:number, dark:Uint8Array}} matrix - the clean QR
     * @param {number} seed - random seed (a fresh one for every code)
     */
    constructor(matrix, seed)
    {
        this.size = matrix.size;
        this.total = matrix.size + 2 * NOISE.QUIET_ZONE;
        this.seed = seed >>> 0;
        this.slow = new Uint8Array(this.total * this.total);
        this.offset = new Uint8Array(this.total * this.total);
        const q = NOISE.QUIET_ZONE;
        for (let r = 0; r < matrix.size; r++)
        {
            for (let c = 0; c < matrix.size; c++)
            {
                this.slow[(r + q) * this.total + (c + q)] = matrix.dark[r * matrix.size + c];
            }
        }
        for (let i = 0; i < this.offset.length; i++)
        {
            // slow squares change at different moments, so no frame shows "who just changed"
            this.offset[i] = mix(this.seed, i, 0x51ED, 7) % NOISE.HOLD;
        }
    }

    /**
     * Returns the colours of one phase, border included.
     * @param {number} phase - phase number (time / PHASE_MS)
     * @returns {Uint8Array} total*total values, 1 = black
     */
    frame(phase)
    {
        const out = new Uint8Array(this.total * this.total);
        for (let i = 0; i < out.length; i++)
        {
            if (this.slow[i] === 1)
            {
                // dark: a new random colour every HOLD phases (changes ~6 % of the time)
                const epoch = Math.floor((phase + this.offset[i]) / NOISE.HOLD);
                out[i] = mix(this.seed, i, epoch, 1) & 1;
            }
            else
            {
                // light: a new random colour every phase (changes 50 % of the time).
                // Not more: if light squares changed MORE often than at random, lining
                // up two frames of a shaking phone would prefer a wrong shift.
                out[i] = mix(this.seed, i, phase, 0) & 1;
            }
        }
        return out;
    }
}

/**
 * Turns a frame of squares into a grey image.
 * @param {Uint8Array} squares - total*total values, 1 = black
 * @param {number} total - squares per side (border included)
 * @param {number} scale - pixels per square
 * @returns {{side:number, pixels:Uint8ClampedArray}} the image
 */
export function squaresToGrey(squares, total, scale)
{
    const side = total * scale;
    const pixels = new Uint8ClampedArray(side * side);
    for (let r = 0; r < total; r++)
    {
        for (let c = 0; c < total; c++)
        {
            const v = squares[r * total + c] === 1 ? NOISE.DARK : NOISE.LIGHT;
            for (let y = r * scale; y < (r + 1) * scale; y++)
            {
                pixels.fill(v, y * side + c * scale, y * side + (c + 1) * scale);
            }
        }
    }
    return { side: side, pixels: pixels };
}

// ---------------------------------------------------------------------
//  THE SCANNER SIDE: THE CHANGE MAP
// ---------------------------------------------------------------------

/**
 * Keeps the newest FRAMES camera frames and builds the change map:
 * per pixel, the average absolute difference between consecutive frames.
 * Running sums make every frame cost one pass.
 */
export class ChangeMap
{
    /**
     * Creates the map.
     * @param {number} length - pixels per frame
     * @param {number} capacity - frames to look at
     */
    constructor(length, capacity)
    {
        this.length = length;
        this.capacity = capacity;
        this.reset();
    }

    /** Forgets everything (new resolution, or the phone moved a lot). */
    reset()
    {
        this.side = Math.round(Math.sqrt(this.length));
        this.last = null;
        this.diffs = [];
        this.sum = new Float64Array(this.length);
        this.cx = 0;           // where the current frame sits relative to the first one
        this.cy = 0;
    }

    /**
     * Adds a camera frame. WHY the alignment: a hand-held phone moves a pixel or two
     * between frames, and then the edges of every square would look like "change".
     * So each frame is first lined up with the previous one (best shift within
     * +-MAX_SHIFT pixels), and its differences are stored in the first frame's
     * coordinates, so the map stays sharp while the phone drifts.
     * @param {ArrayLike<number>} grey - one value per pixel (a square image)
     */
    push(grey)
    {
        if (grey.length !== this.length)
        {
            this.length = grey.length;
            this.reset();
        }
        const frame = Uint8ClampedArray.from(grey);
        if (this.last !== null)
        {
            const s = bestShift(frame, this.last, this.side);
            this.cx += s.dx;
            this.cy += s.dy;
            if (Math.abs(this.cx) > MAX_DRIFT || Math.abs(this.cy) > MAX_DRIFT)
            {
                this.reset();      // moved too much: start over from this frame
                this.last = frame;
                return;
            }
            const n = this.side;
            const d = new Uint8ClampedArray(this.length);
            for (let y = 0; y < n; y++)
            {
                const ly = y + s.dy;          // the same scene point in the previous frame
                const ry = y + this.cy;       // ... and in the first frame
                if (ly < 0 || ly >= n || ry < 0 || ry >= n)
                {
                    continue;
                }
                for (let x = 0; x < n; x++)
                {
                    const lx = x + s.dx;
                    const rx = x + this.cx;
                    if (lx < 0 || lx >= n || rx < 0 || rx >= n)
                    {
                        continue;
                    }
                    const v = Math.abs(frame[y * n + x] - this.last[ly * n + lx]);
                    d[ry * n + rx] = v;
                    this.sum[ry * n + rx] += v;
                }
            }
            this.diffs.push(d);
            if (this.diffs.length > this.capacity - 1)
            {
                const old = this.diffs.shift();
                for (let i = 0; i < old.length; i++)
                {
                    this.sum[i] -= old[i];
                }
            }
        }
        this.last = frame;
    }

    /**
     * Returns how many frames are in the map.
     * @returns {number} frames (differences + 1)
     */
    count()
    {
        return this.last === null ? 0 : this.diffs.length + 1;
    }

    /**
     * Tells whether anything changes at all (a frozen picture held up to the camera does not).
     * @returns {boolean} true when some pixels change
     */
    hasSignal()
    {
        const n = Math.max(1, this.diffs.length);
        for (let i = 0; i < this.length; i++)
        {
            if (this.sum[i] / n >= MIN_SIGNAL)
            {
                return true;
            }
        }
        return false;
    }

    /**
     * Builds the black-and-white image a QR reader can read: little change = black,
     * much change = white. Steps: stretch (2nd..98th percentile), blur, Otsu threshold.
     * @param {number} side - width = height in pixels
     * @returns {Uint8ClampedArray} 0 or 255 per pixel
     */
    image(side)
    {
        const n = Math.max(1, this.diffs.length);
        const mean = new Float32Array(this.length);
        for (let i = 0; i < this.length; i++)
        {
            mean[i] = this.sum[i] / n;
        }
        const lo = percentile(mean, 0.02);
        const hi = percentile(mean, 0.98);
        const span = Math.max(hi - lo, 1e-6);
        const img = new Float32Array(this.length);
        for (let i = 0; i < this.length; i++)
        {
            const a = Math.min(1, Math.max(0, (mean[i] - lo) / span));
            img[i] = 255 * a;            // much change -> white, still -> black
        }
        const blurred = gaussianBlur(img, side, side, NOISE.BLUR_SIGMA);
        const t = otsu(blurred);
        const out = new Uint8ClampedArray(this.length);
        for (let i = 0; i < this.length; i++)
        {
            out[i] = blurred[i] > t ? 255 : 0;
        }
        return out;
    }
}

// ---------------------------------------------------------------------
//  LOW-LEVEL HELPERS
// ---------------------------------------------------------------------

const MAX_SHIFT = 3;           // largest hand movement between two frames, in pixels
const MAX_DRIFT = 12;          // larger total drift = start the map over
const SHIFT_STEP = 7;          // compare every 7th pixel when lining frames up (fast)
const MIN_SIGNAL = 4;          // below this mean change (grey levels) the picture is frozen

/**
 * Finds the shift that best lines up a frame with the previous one:
 * frame(x, y) ~ last(x + dx, y + dy). Compares a sparse grid of pixels in the
 * middle of the image (the random squares make the match very clear).
 * @param {Uint8ClampedArray} frame - new frame
 * @param {Uint8ClampedArray} last - previous frame
 * @param {number} n - side in pixels
 * @returns {{dx:number, dy:number}} the shift
 */
function bestShift(frame, last, n)
{
    let best = Infinity;
    let bx = 0;
    let by = 0;
    const lo = Math.max(Math.floor(n / 4), MAX_SHIFT);
    const hi = Math.min(n - Math.floor(n / 4), n - MAX_SHIFT);
    for (let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy++)
    {
        for (let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx++)
        {
            let sad = 0;
            for (let y = lo; y < hi; y += SHIFT_STEP)
            {
                for (let x = lo; x < hi; x += SHIFT_STEP)
                {
                    sad += Math.abs(frame[y * n + x] - last[(y + dy) * n + (x + dx)]);
                }
            }
            if (sad < best)
            {
                best = sad;
                bx = dx;
                by = dy;
            }
        }
    }
    return { dx: bx, dy: by };
}

/**
 * A fast integer hash (deterministic "random" bits from numbers).
 * @param {number} seed - code seed
 * @param {number} i - square index
 * @param {number} epoch - time slot
 * @param {number} salt - extra input
 * @returns {number} 32-bit unsigned value
 */
function mix(seed, i, epoch, salt)
{
    let h = (seed ^ Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(epoch + 0x7F4A7C15, 0x85EBCA77) ^ Math.imul(salt + 3, 0xC2B2AE3D)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7FEB352D) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x846CA68B) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Returns the value below which a fraction q of the values lie (via a 256-bin histogram).
 * @param {Float32Array} values - values 0..255
 * @param {number} q - fraction 0..1
 * @returns {number} the percentile
 */
function percentile(values, q)
{
    const hist = new Uint32Array(256);
    for (let i = 0; i < values.length; i++)
    {
        hist[Math.min(255, Math.max(0, Math.round(values[i])))]++;
    }
    const target = q * values.length;
    let acc = 0;
    for (let v = 0; v < 256; v++)
    {
        acc += hist[v];
        if (acc >= target)
        {
            return v;
        }
    }
    return 255;
}

/**
 * Blurs an image with a separable Gaussian.
 * @param {Float32Array} img - pixels
 * @param {number} w - width
 * @param {number} h - height
 * @param {number} sigma - blur radius
 * @returns {Float32Array} blurred copy
 */
function gaussianBlur(img, w, h, sigma)
{
    const r = Math.ceil(2 * sigma);
    const k = [];
    let ks = 0;
    for (let i = -r; i <= r; i++)
    {
        const v = Math.exp(-(i * i) / (2 * sigma * sigma));
        k.push(v);
        ks += v;
    }
    for (let i = 0; i < k.length; i++)
    {
        k[i] /= ks;
    }
    const tmp = new Float32Array(img.length);
    const out = new Float32Array(img.length);
    for (let y = 0; y < h; y++)
    {
        for (let x = 0; x < w; x++)
        {
            let s = 0;
            for (let i = -r; i <= r; i++)
            {
                const xx = Math.min(w - 1, Math.max(0, x + i));
                s += img[y * w + xx] * k[i + r];
            }
            tmp[y * w + x] = s;
        }
    }
    for (let y = 0; y < h; y++)
    {
        for (let x = 0; x < w; x++)
        {
            let s = 0;
            for (let i = -r; i <= r; i++)
            {
                const yy = Math.min(h - 1, Math.max(0, y + i));
                s += tmp[yy * w + x] * k[i + r];
            }
            out[y * w + x] = s;
        }
    }
    return out;
}

/**
 * Finds the threshold that best splits an image into two groups (Otsu's method).
 * @param {Float32Array} img - pixels 0..255
 * @returns {number} threshold
 */
function otsu(img)
{
    const hist = new Float64Array(256);
    for (let i = 0; i < img.length; i++)
    {
        hist[Math.min(255, Math.max(0, Math.round(img[i])))]++;
    }
    let total = 0;
    let sumAll = 0;
    for (let v = 0; v < 256; v++)
    {
        total += hist[v];
        sumAll += v * hist[v];
    }
    let wB = 0;
    let sumB = 0;
    let best = 0;
    let bestT = 127;
    for (let t = 0; t < 256; t++)
    {
        wB += hist[t];
        if (wB === 0)
        {
            continue;
        }
        const wF = total - wB;
        if (wF === 0)
        {
            break;
        }
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sumAll - sumB) / wF;
        const between = wB * wF * (mB - mF) * (mB - mF);
        if (between > best)
        {
            best = between;
            bestT = t;
        }
    }
    return bestT;
}

/**
 * A small seeded random generator (mulberry32), so tests are repeatable.
 * @param {number} seed - any integer
 * @returns {function():number} numbers in [0, 1)
 */
export function seededRandom(seed)
{
    let s = seed >>> 0;
    return function next()
    {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
