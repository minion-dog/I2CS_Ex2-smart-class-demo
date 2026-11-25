// =====================================================================
//  guide.js - "Google Lens"-style help while scanning (pure logic)
// =====================================================================
// Idea from a classmate (25 Nov 2026): like Google's scanner, light up a box
// around the code as soon as the camera finds it, and tell the student what
// to do ("point at the flickering code", "move closer", "hold still"),
// because some students do not know what they are looking for.
// The scanner already knows WHERE things flicker (ChangeMap.activeBox, used
// for the auto-zoom); this module turns that box into screen coordinates
// and a hint.

/** Guide settings. */
export const GUIDE = Object.freeze({
    CLOSER_PX: 110,         // the code is smaller than this in camera pixels: too small to read well
    STEADY_ROUNDS: 2,       // the box was found this many times in a row: "hold still, reading"
    SMOOTH: 0.45            // how fast the drawn box follows (0..1): less jumping on a shaking hand
});

/**
 * Where the found box is on the screen: the preview is a square that shows the middle
 * square of the camera picture (object-fit: cover), scaled by the picture zoom.
 * @param {{x0:number,y0:number,x1:number,y1:number}} box - the box in analysed pixels (0..side)
 * @param {number} side - analysed square size (pixels)
 * @param {{x:number,y:number,s:number}} crop - the analysed part of the camera picture (camera pixels)
 * @param {number} vw - camera picture width
 * @param {number} vh - camera picture height
 * @param {number} zoom - picture zoom shown in the preview (1 = none)
 * @returns {{x:number,y:number,w:number,h:number}} the box as fractions of the preview (may stick out)
 */
export function boxOnScreen(box, side, crop, vw, vh, zoom)
{
    const per = crop.s / side;                              // camera pixels per analysed pixel
    const visible = Math.min(vw, vh) / zoom;                // camera pixels shown across the preview
    const left = (vw - visible) / 2;
    const top = (vh - visible) / 2;
    const x0 = crop.x + box.x0 * per;
    const y0 = crop.y + box.y0 * per;
    const x1 = crop.x + box.x1 * per;
    const y1 = crop.y + box.y1 * per;
    return { x: (x0 - left) / visible, y: (y0 - top) / visible, w: (x1 - x0) / visible, h: (y1 - y0) / visible };
}

/**
 * What to tell the student.
 * @param {object|null} box - activeBox (null = nothing flickers)
 * @param {number} cameraPx - the box size in camera pixels
 * @param {number} rounds - how many tries in a row found the box
 * @returns {string} 'search' | 'closer' | 'found' | 'steady'
 */
export function hintFor(box, cameraPx, rounds)
{
    if (box === null)
    {
        return 'search';
    }
    if (cameraPx < GUIDE.CLOSER_PX)
    {
        return 'closer';
    }
    return rounds >= GUIDE.STEADY_ROUNDS ? 'steady' : 'found';
}

/**
 * Moves the drawn box part of the way to the new one (smooth on a shaking hand).
 * @param {{x:number,y:number,w:number,h:number}|null} prev - drawn box, or null
 * @param {{x:number,y:number,w:number,h:number}} next - new box
 * @returns {{x:number,y:number,w:number,h:number}} box to draw
 */
export function smooth(prev, next)
{
    if (prev === null)
    {
        return next;
    }
    const k = GUIDE.SMOOTH;
    return { x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k, w: prev.w + (next.w - prev.w) * k, h: prev.h + (next.h - prev.h) * k };
}
