// =====================================================================
//  scanner.js - the camera side of the flicker QR
// =====================================================================
// Takes ~30 camera frames per second, turns each into grey and feeds the
// change map (core/noisyqr.js): pixels that change a lot are the QR's light
// squares, pixels that hardly change are its dark squares. Every few frames
// the map is turned into a black-and-white picture and jsQR reads it.
// A normal camera app (or a photo) sees only random dots.
//
// From the back of the class the code is small in the picture. So the scanner
// looks for WHERE things change, then zooms in on that part of the camera
// picture (at the camera's full resolution) and starts the map again there.
//
// The heavy work (change map + jsQR) runs on a second thread (scan-worker.js),
// so the camera preview stays smooth on slower phones (real-phone test, 25 Nov 2026).

import { ScanEngine } from '../core/scan-engine.js';
import { boxOnScreen, hintFor, smooth } from '../core/guide.js';

const SIDE = 400;                  // analysed square, in pixels
const DECODE_EVERY = 3;            // try to read every 3rd frame (saves battery)
const ZOOM_WHEN = 0.6;             // zoom in when the code covers less than 60% of the square
const ZOOM_FILL = 1.35;            // after zooming, the square is 1.35 x the code (room for shake)
const MIN_CROP = 200;              // never zoom closer than 200 camera pixels
const GIVE_UP_MS = 4000;
const DIGITAL_MAX = 4;             // picture zoom (phones whose browser gives no camera zoom)
const HARDWARE_MAX = 10;           // the camera's own zoom, at most 10x
const DONE_FLASH_MS = 350;         // the box turns green this long before the result shows

/** Reads our flicker QR codes from the camera. */
export class AveragingScanner
{
    /**
     * Creates a scanner.
     * @param {HTMLVideoElement} video - preview element
     * @param {function(string):void} onText - called once with the decoded text
     * @param {HTMLCanvasElement} [view] - optional: shows what the scanner sees (the change map)
     * @param {function({rect:object|null, hint:string}):void} [onGuide] - optional: where the code
     *        is on the preview and what to tell the student (a "Google Lens"-style box)
     */
    constructor(video, onText, view, onGuide)
    {
        this.video = video;
        this.onText = onText;
        this.view = view || null;
        this.onGuide = onGuide || (() => {});
        this.rounds = 0;           // decode tries in a row that found the code
        this.drawn = null;         // the box as drawn (smoothed)
        this.canvas = document.createElement('canvas');
        this.canvas.width = SIDE;
        this.canvas.height = SIDE;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.worker = null;        // the second thread (null = work on this thread)
        this.engine = null;        // ... or the engine right here
        this.busy = false;         // a decode request is waiting for its answer
        this.askedAt = 0;          // frame of the last decode request
        this.gen = 0;              // +1 whenever the analysed part changes (old answers are ignored)
        this.resetNext = false;    // the next frame starts a new map
        this.stream = null;
        this.frame = 0;
        this.running = false;
        this.crop = null;          // part of the camera picture being analysed (null = the middle square)
        this.zoomedAt = 0;
        this.digitalZoom = 1;      // the user's zoom slider when the camera has no zoom of its own
    }

    /**
     * The user's zoom slider (students at the back of the class). Uses the camera's
     * own zoom when it has one (sharper: it zooms on the sensor), otherwise zooms
     * into the picture.
     * @param {number} factor - 1 = no zoom
     * @returns {Promise<void>}
     */
    async setZoom(factor)
    {
        const track = this.stream ? this.stream.getVideoTracks()[0] : null;
        const caps = track && track.getCapabilities ? track.getCapabilities() : {};
        if (caps.zoom)
        {
            const z = Math.min(caps.zoom.max, Math.max(caps.zoom.min, factor));
            try
            {
                await track.applyConstraints({ advanced: [{ zoom: z }] });
                this.digitalZoom = 1;
                this.video.style.transform = '';      // the camera itself zoomed: the preview shows it
                this.unzoom();
                return;
            }
            catch (e)
            {
                // fall through to the picture zoom
            }
        }
        this.digitalZoom = Math.min(DIGITAL_MAX, Math.max(1, factor));
        // show the same zoom in the preview, so the student sees what is analysed
        this.video.style.transform = this.digitalZoom > 1 ? 'scale(' + this.digitalZoom + ')' : '';
        this.unzoom();
    }

    /**
     * How far the zoom can go: the camera's own range, or the picture zoom.
     * @returns {number} the largest zoom factor
     */
    maxZoom()
    {
        const track = this.stream ? this.stream.getVideoTracks()[0] : null;
        const caps = track && track.getCapabilities ? track.getCapabilities() : {};
        return caps.zoom ? Math.min(caps.zoom.max, HARDWARE_MAX) : DIGITAL_MAX;
    }

    /**
     * Opens the back camera and starts reading.
     * @returns {Promise<void>}
     * @throws {Error} when the camera is not allowed
     */
    async start()
    {
        this.stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
            audio: false
        });
        this.video.srcObject = this.stream;
        this.video.setAttribute('playsinline', '');
        await this.video.play();
        this.startEngine();
        this.running = true;
        this.loop();
    }

    /** Stops the camera. */
    stop()
    {
        this.running = false;
        if (this.worker !== null)
        {
            this.worker.terminate();
            this.worker = null;
        }
        this.video.style.transform = '';
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

    /** Starts the second thread (or, without workers, the engine on this thread). */
    startEngine()
    {
        this.busy = false;
        this.askedAt = 0;
        this.frame = 0;
        this.gen++;
        this.resetNext = true;
        try
        {
            this.worker = new Worker(new URL('./scan-worker.js', import.meta.url), { type: 'module' });
            this.worker.onmessage = (e) => this.onAnswer(e.data);
            this.worker.onerror = () =>
            {
                // no module workers here: do the work on this thread
                this.worker.terminate();
                this.worker = null;
                this.useLocalEngine();
            };
        }
        catch (e)
        {
            this.worker = null;
            this.useLocalEngine();
        }
    }

    /** The engine on this thread (old browsers): slower preview, same result. */
    useLocalEngine()
    {
        this.busy = false;
        this.resetNext = true;
        this.engine = new ScanEngine(SIDE, (rgba, w, h) =>
        {
            const r = globalThis.jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' });
            return r && r.data ? r.data : null;
        });
    }

    /**
     * Sends the current camera frame to the engine; every few frames (when the
     * engine is free) also asks it to read the code.
     */
    processFrame()
    {
        const v = this.video;
        if (this.crop === null)
        {
            this.crop = this.fullCrop();
        }
        const c = this.crop;
        this.ctx.drawImage(v, c.x, c.y, c.s, c.s, 0, 0, SIDE, SIDE);
        const rgba = this.ctx.getImageData(0, 0, SIDE, SIDE).data;
        this.frame++;
        // ask only when the last answer came back: a slow phone never piles up work
        const decode = !this.busy && this.frame - this.askedAt >= DECODE_EVERY;
        if (decode)
        {
            this.busy = true;
            this.askedAt = this.frame;
        }
        const msg = { rgba: rgba, gen: this.gen, reset: this.resetNext, decode: decode };
        this.resetNext = false;
        if (this.worker !== null)
        {
            this.worker.postMessage(msg, [rgba.buffer]);
        }
        else if (this.engine !== null)
        {
            const out = this.engine.handle(msg);
            if (out !== null)
            {
                this.onAnswer(out);
            }
        }
        if (this.zoomedAt > 0 && performance.now() - this.zoomedAt > GIVE_UP_MS)
        {
            this.unzoom();
        }
    }

    /**
     * An answer from the engine: move the box, show the map, and finish or zoom in.
     * @param {{gen:number, ready:boolean, box:object|null, text:string|null, view:Uint8ClampedArray|null}} out - the answer
     */
    onAnswer(out)
    {
        this.busy = false;
        if (!this.running || out.gen !== this.gen || !out.ready)
        {
            return;                                    // stopped, an old part of the picture, or not enough frames yet
        }
        if (out.box === null)
        {
            this.show(null);
            this.rounds = 0;
            this.drawn = null;
            this.onGuide({ rect: null, hint: 'search' });
            return;
        }
        this.guide(out.box);
        this.show(out.view);
        if (out.text)
        {
            this.stop();
            this.onGuide({ rect: this.drawn, hint: 'done' });            // the box turns green
            setTimeout(() => this.onText(out.text), DONE_FLASH_MS);
            return;
        }
        this.zoomIfSmall(out.box);
    }

    /**
     * The middle square of the camera picture (with the user's zoom slider).
     * @returns {{x:number, y:number, s:number}} crop in camera pixels
     */
    fullCrop()
    {
        const v = this.video;
        const side = Math.min(v.videoWidth, v.videoHeight) / this.digitalZoom;
        return { x: (v.videoWidth - side) / 2, y: (v.videoHeight - side) / 2, s: side };
    }

    /**
     * When the code is small in the picture, zooms in on it: the next frames are taken
     * from just that part of the camera picture, so each square of the code gets more pixels.
     */
    zoomIfSmall(box)
    {
        if (box === null || box.size >= ZOOM_WHEN * SIDE)
        {
            return;
        }
        const c = this.crop;
        const per = c.s / SIDE;                                // camera pixels per analysed pixel
        const s = Math.max(MIN_CROP, box.size * ZOOM_FILL * per);
        if (s > 0.8 * c.s)
        {
            return;                                            // already as close as it gets
        }
        const v = this.video;
        const cx = c.x + box.cx * per;
        const cy = c.y + box.cy * per;
        const side = Math.min(s, v.videoWidth, v.videoHeight);
        this.crop = {
            x: Math.min(Math.max(0, cx - side / 2), v.videoWidth - side),
            y: Math.min(Math.max(0, cy - side / 2), v.videoHeight - side),
            s: side
        };
        this.zoomedAt = performance.now();
        this.restart();
    }

    /** The analysed part changed: start a new map and ignore answers about the old part. */
    restart()
    {
        this.gen++;
        this.resetNext = true;
    }

    /**
     * Tells the page where the code is on the preview and what to tell the student.
     * @param {object} box - the code's box in analysed pixels
     */
    guide(box)
    {
        this.rounds++;
        const v = this.video;
        const c = this.crop;
        this.drawn = smooth(this.drawn, boxOnScreen(box, SIDE, c, v.videoWidth, v.videoHeight, this.digitalZoom));
        this.onGuide({ rect: this.drawn, hint: hintFor(box, box.size * c.s / SIDE, this.rounds) });
    }

    /** Goes back to the whole picture (the phone moved, or zooming did not help). */
    unzoom()
    {
        this.crop = null;
        this.zoomedAt = 0;
        this.restart();
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
}
