// =====================================================================
//  scan-engine.js - the scanner's heavy work, away from the screen
// =====================================================================
// A real-phone test (25 Nov 2026) found the code but the camera preview was
// slow and jumpy: every few frames the phone built the black-and-white map
// and ran the QR reader on the page's own thread, so the preview stopped
// for a moment each time. This module does that work; the scanner runs it in
// a Web Worker (a second thread), so the preview stays smooth. When a phone
// has no workers it runs right here, as before.
//
// Messages: { rgba, gen, reset, decode } in; for a decode request the answer is
// { gen, ready, box, text, view }.

import { ChangeMap, NOISE } from './noisyqr.js';

/** Turns camera frames into a change map and reads the code from it. */
export class ScanEngine
{
    /**
     * Creates the engine.
     * @param {number} side - frames are side x side pixels
     * @param {function(Uint8ClampedArray, number, number):(string|null)} read - QR reader (RGBA in, text out)
     */
    constructor(side, read)
    {
        this.side = side;
        this.read = read;
        this.map = new ChangeMap(side * side, NOISE.FRAMES);
    }

    /**
     * Adds one frame; for a decode request also finds the code and tries to read it.
     * @param {{rgba:Uint8ClampedArray, gen:number, reset:boolean, decode:boolean}} msg - one camera frame (RGBA)
     * @returns {object|null} the answer to a decode request, else null
     */
    handle(msg)
    {
        if (msg.reset)
        {
            this.map.reset();
        }
        this.map.push(toGrey(msg.rgba));
        if (!msg.decode)
        {
            return null;
        }
        if (this.map.count() < NOISE.FRAMES)
        {
            return { gen: msg.gen, ready: false };
        }
        if (!this.map.hasSignal())
        {
            return { gen: msg.gen, ready: true, box: null, text: null, view: null };
        }
        const box = this.map.activeBox();
        const bw = this.map.image(this.side, box);
        const view = new Uint8ClampedArray(bw.length * 4);
        for (let i = 0; i < bw.length; i++)
        {
            view[i * 4] = bw[i];
            view[i * 4 + 1] = bw[i];
            view[i * 4 + 2] = bw[i];
            view[i * 4 + 3] = 255;
        }
        return { gen: msg.gen, ready: true, box: box, text: this.read(view, this.side, this.side), view: view };
    }
}

/**
 * RGBA camera pixels to grey (integer luma: (299 R + 587 G + 114 B) / 1000).
 * @param {Uint8ClampedArray} rgba - 4 values per pixel
 * @returns {Uint8ClampedArray} one value per pixel
 */
export function toGrey(rgba)
{
    const grey = new Uint8ClampedArray(rgba.length / 4);
    for (let i = 0; i < grey.length; i++)
    {
        grey[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
    }
    return grey;
}
