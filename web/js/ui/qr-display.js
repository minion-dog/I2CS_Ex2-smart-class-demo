// =====================================================================
//  qr-display.js - draws the flicker QR on the lecturer's screen
// =====================================================================
// Every PHASE_MS a new phase of the flicker plan is drawn (see
// core/noisyqr.js): dark squares change slowly, light squares fast.
// The canvas is redrawn only when the phase changes.

import { matrixFromText, FlickerSchedule, NOISE } from '../core/noisyqr.js';

const PIXELS_PER_SQUARE = 8;

/** Shows a QR text as a flicker code on a canvas. */
export class NoisyQrDisplay
{
    /**
     * Creates the display.
     * @param {HTMLCanvasElement} canvas - where to draw
     * @param {function} qrcodeLib - the qrcode-generator global
     */
    constructor(canvas, qrcodeLib)
    {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.qrcodeLib = qrcodeLib;
        this.plan = null;
        this.lastPhase = -1;
        this.running = false;
    }

    /**
     * Changes the text (a new token every 30 s) with a fresh random plan.
     * @param {string} text - QR payload
     */
    setText(text)
    {
        const m = matrixFromText(this.qrcodeLib, text);
        const seed = new Uint32Array(1);
        crypto.getRandomValues(seed);
        this.plan = new FlickerSchedule(m, seed[0]);
        const side = this.plan.total * PIXELS_PER_SQUARE;
        this.canvas.width = side;
        this.canvas.height = side;
        this.lastPhase = -1;
    }

    /** Starts the animation. */
    start()
    {
        if (this.running)
        {
            return;
        }
        this.running = true;
        const tick = () =>
        {
            if (!this.running)
            {
                return;
            }
            this.draw(Math.floor(performance.now() / NOISE.PHASE_MS));
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    /** Stops the animation and clears the canvas. */
    stop()
    {
        this.running = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Draws one phase if it is new.
     * @param {number} phase - phase number
     */
    draw(phase)
    {
        if (this.plan === null || phase === this.lastPhase)
        {
            return;
        }
        this.lastPhase = phase;
        const squares = this.plan.frame(phase);
        const n = this.plan.total;
        const ctx = this.ctx;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = '#000000';
        for (let r = 0; r < n; r++)
        {
            for (let c = 0; c < n; c++)
            {
                if (squares[r * n + c] === 1)
                {
                    ctx.fillRect(c * PIXELS_PER_SQUARE, r * PIXELS_PER_SQUARE, PIXELS_PER_SQUARE, PIXELS_PER_SQUARE);
                }
            }
        }
    }
}
