// =====================================================================
//  scanner.js - the camera side of the flicker QR
// =====================================================================
// Takes ~30 camera frames per second, turns each into grey and feeds the
// change map (core/noisyqr.js): pixels that change a lot are the QR's light
// squares, pixels that hardly change are its dark squares. Every few frames
// the map is turned into a black-and-white picture and jsQR reads it.
// A normal camera app (or a photo) sees only random dots.

import { ChangeMap, NOISE } from '../core/noisyqr.js';

const SIDE = 400;                  // analysed square, in pixels
const DECODE_EVERY = 3;            // try to read every 3rd frame (saves battery)

/** Reads our flicker QR codes from the camera. */
export class AveragingScanner
{
    /**
     * Creates a scanner.
     * @param {HTMLVideoElement} video - preview element
     * @param {function(string):void} onText - called once with the decoded text
     * @param {HTMLCanvasElement} [view] - optional: shows what the scanner sees (the change map)
     */
    constructor(video, onText, view)
    {
        this.video = video;
        this.onText = onText;
        this.view = view || null;
        this.canvas = document.createElement('canvas');
        this.canvas.width = SIDE;
        this.canvas.height = SIDE;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.map = new ChangeMap(SIDE * SIDE, NOISE.FRAMES);
        this.stream = null;
        this.frame = 0;
        this.running = false;
    }

    /**
     * Opens the back camera and starts reading.
     * @returns {Promise<void>}
     * @throws {Error} when the camera is not allowed
     */
    async start()
    {
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false
        });
        this.video.srcObject = this.stream;
        this.video.setAttribute('playsinline', '');
        await this.video.play();
        this.running = true;
        this.loop();
    }

    /** Stops the camera. */
    stop()
    {
        this.running = false;
        if (this.stream)
        {
            for (const track of this.stream.getTracks())
            {
                track.stop();
            }
        }
        this.stream = null;
    }

    /** Reads frames until a code is found or stop() is called. */
    loop()
    {
        if (!this.running)
        {
            return;
        }
        if (this.video.readyState >= 2)
        {
            this.processFrame();
        }
        if ('requestVideoFrameCallback' in this.video)
        {
            this.video.requestVideoFrameCallback(() => this.loop());
        }
        else
        {
            setTimeout(() => this.loop(), 33);
        }
    }

    /** Adds the current camera frame to the change map and tries to decode. */
    processFrame()
    {
        const v = this.video;
        const crop = Math.min(v.videoWidth, v.videoHeight);
        const sx = (v.videoWidth - crop) / 2;
        const sy = (v.videoHeight - crop) / 2;
        this.ctx.drawImage(v, sx, sy, crop, crop, 0, 0, SIDE, SIDE);
        const rgba = this.ctx.getImageData(0, 0, SIDE, SIDE).data;
        const grey = new Uint8ClampedArray(SIDE * SIDE);
        for (let i = 0; i < grey.length; i++)
        {
            // integer luma: (299 R + 587 G + 114 B) / 1000
            grey[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
        }
        this.map.push(grey);
        this.frame++;
        if (this.map.count() >= NOISE.FRAMES && this.frame % DECODE_EVERY === 0)
        {
            if (this.map.hasSignal())
            {
                this.tryDecode();
            }
            else
            {
                this.show(null);
            }
        }
    }

    /**
     * Draws the black-and-white change map in the small "what the scanner sees" box,
     * so the user can see the hidden code appear (or grey when nothing changes).
     * @param {Uint8ClampedArray|null} rgba - the picture, or null for "no signal"
     */
    show(rgba)
    {
        if (this.view === null)
        {
            return;
        }
        const g = this.view.getContext('2d');
        if (rgba === null)
        {
            g.fillStyle = '#888';
            g.fillRect(0, 0, this.view.width, this.view.height);
            return;
        }
        if (!this.viewBuffer)
        {
            this.viewBuffer = document.createElement('canvas');
            this.viewBuffer.width = SIDE;
            this.viewBuffer.height = SIDE;
        }
        this.viewBuffer.getContext('2d').putImageData(new ImageData(rgba, SIDE, SIDE), 0, 0);
        g.drawImage(this.viewBuffer, 0, 0, this.view.width, this.view.height);
    }

    /** Runs jsQR on the black-and-white change map. */
    tryDecode()
    {
        const bw = this.map.image(SIDE);
        const rgba = new Uint8ClampedArray(SIDE * SIDE * 4);
        for (let i = 0; i < bw.length; i++)
        {
            rgba[i * 4] = bw[i];
            rgba[i * 4 + 1] = bw[i];
            rgba[i * 4 + 2] = bw[i];
            rgba[i * 4 + 3] = 255;
        }
        this.show(rgba);
        const result = globalThis.jsQR(rgba, SIDE, SIDE, { inversionAttempts: 'dontInvert' });
        if (result && result.data)
        {
            this.stop();
            this.onText(result.data);
        }
    }
}
