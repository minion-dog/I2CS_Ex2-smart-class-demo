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

import { ChangeMap, NOISE } from '../core/noisyqr.js';

const SIDE = 400;                  // analysed square, in pixels
const DECODE_EVERY = 3;            // try to read every 3rd frame (saves battery)
const ZOOM_WHEN = 0.6;             // zoom in when the code covers less than 60% of the square
const ZOOM_FILL = 1.35;            // after zooming, the square is 1.35 x the code (room for shake)
const MIN_CROP = 200;              // never zoom closer than 200 camera pixels
const GIVE_UP_MS = 4000;
const DIGITAL_MAX = 4;             // picture zoom (phones whose browser gives no camera zoom)
const HARDWARE_MAX = 10;           // the camera's own zoom, at most 10x           // zoomed but nothing read for 4 s: look at the whole picture again

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
        this.running = true;
        this.loop();
    }

    /** Stops the camera. */
    stop()
    {
        this.running = false;
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

    /** Adds the current camera frame to the change map and tries to decode. */
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
                if (this.running)
                {
                    this.zoomIfSmall();
                }
            }
            else
            {
                this.show(null);
            }
            if (this.zoomedAt > 0 && performance.now() - this.zoomedAt > GIVE_UP_MS)
            {
                this.unzoom();
            }
        }
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
    zoomIfSmall()
    {
        const box = this.map.activeBox();
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
        this.map.reset();
    }

    /** Goes back to the whole picture (the phone moved, or zooming did not help). */
    unzoom()
    {
        this.crop = null;
        this.zoomedAt = 0;
        this.map.reset();
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
