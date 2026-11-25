// =====================================================================
//  faceview.js - the class photo with a box on every face
// =====================================================================
// One view, three uses:
//   'edit'  lecturer fixes the boxes: tap a box = remove, tap a face
//           without a box = add one (the size of the boxes around it).
//   'pick'  student taps their own face; taken boxes are grey.
//   'watch' lecturer sees who chose which face (green) and free faces (yellow).
// Zoom: + / - buttons or two-finger pinch; drag with one finger to move.
// Boxes are positioned in % of the photo, so they stay on the faces at any size.

import { el, fill } from './dom.js';
import { hitTest, boxAt, withIds } from '../core/faces.js';

/** Interaction tuning. */
const VIEW = Object.freeze({
    TAP_MOVE_PX: 10,          // more movement than this = a drag, not a tap
    ZOOM_MIN: 1,
    ZOOM_MAX: 6,
    ZOOM_STEP: 0.5
});

/**
 * The photo with boxes.
 */
export class FaceView
{
    /**
     * @param {HTMLElement} host - where to draw
     * @param {{mode:string, onChange?:function(object[]):void, onPick?:function(number):void, onBox?:function(number):void}} opts - mode and callbacks
     */
    constructor(host, opts)
    {
        this.host = host;
        this.mode = opts.mode;
        this.onChange = opts.onChange || (() => {});
        this.onPick = opts.onPick || (() => {});
        this.onBox = opts.onBox || (() => {});
        this.onPlace = opts.onPlace || (() => {});
        this.placing = false;         // pick: "no box on me" - the next tap places my own box
        this.extra = [];              // boxes drawn on top: my request (pick) / students' requests (watch)
        this.boxes = [];
        this.history = [];
        this.taken = new Set();       // pick: box ids chosen by others
        this.labels = new Map();      // watch: box id -> name
        this.mine = 0;                // pick: my chosen box id
        this.meLabel = '';            // pick: the label on my box ("me")
        this.selected = 0;
        this.zoom = 1;
        this.aspect = 1;
        this.build();
    }

    /**
     * Shows a photo and its boxes.
     * @param {string} src - image URL or data URL
     * @param {object[]} boxes - boxes (fractions)
     * @param {number} aspect - width / height of the photo
     */
    setPhoto(src, boxes, aspect)
    {
        this.img.src = src;
        this.aspect = aspect;
        this.boxes = withIds(boxes);
        this.history = [];
        this.selected = 0;
        this.setZoom(1);
        this.draw();
    }

    /**
     * Pick mode: which boxes are taken and which one is mine.
     * @param {Set<number>} taken - ids chosen by others
     * @param {number} mine - my id (0 = none)
     */
    setTaken(taken, mine)
    {
        this.taken = taken;
        this.mine = mine;
        this.draw();
    }

    /**
     * Watch mode: names on chosen boxes.
     * @param {Map<number,string>} labels - id -> name
     */
    setLabels(labels)
    {
        this.labels = labels;
        this.draw();
    }

    /**
     * Pick mode: the next tap places the student's own box (anywhere, also at the edge).
     * @param {boolean} on - placing
     */
    setPlacing(on)
    {
        this.placing = on;
        this.host.classList.toggle('placing', on);
    }

    /**
     * Extra dashed boxes: my requested box (pick) or the students' requests (watch).
     * @param {{x:number,y:number,w:number,h:number,label?:string,state?:string}[]} list - boxes
     */
    setExtra(list)
    {
        this.extra = list;
        this.draw();
    }

    /** Edit mode: takes back the last change. */
    undo()
    {
        const last = this.history.pop();
        if (last)
        {
            this.boxes = last;
            this.draw();
            this.onChange(this.boxes);
        }
    }

    /**
     * Marks one box as selected (pick mode, before confirming).
     * @param {number} id - box id (0 = none)
     */
    select(id)
    {
        this.selected = id;
        this.draw();
    }

    /**
     * A zoomed-in picture of one box, so the student can check it is really them.
     * @param {number} id - box id
     * @param {number} side - canvas side in pixels
     * @returns {HTMLCanvasElement|null} crop
     */
    crop(id, side)
    {
        const b = this.boxes.find((x) => x.id === id);
        if (!b || !this.img.naturalWidth)
        {
            return null;
        }
        const W = this.img.naturalWidth;
        const H = this.img.naturalHeight;
        const pad = 0.6;
        const cx = (b.x + b.w / 2) * W;
        const cy = (b.y + b.h / 2) * H;
        const s = Math.max(b.w * W, b.h * H) * (1 + 2 * pad);
        const c = el('canvas', { width: side, height: side, class: 'face-crop' });
        c.getContext('2d').drawImage(this.img, cx - s / 2, cy - s / 2, s, s, 0, 0, side, side);
        return c;
    }

    /**
     * Sets the zoom and keeps the middle of the view in place.
     * @param {number} z - zoom factor
     */
    setZoom(z)
    {
        const vp = this.viewport;
        const old = this.zoom;
        this.zoom = Math.min(VIEW.ZOOM_MAX, Math.max(VIEW.ZOOM_MIN, z));
        const mx = (vp.scrollLeft + vp.clientWidth / 2) / old;
        const my = (vp.scrollTop + vp.clientHeight / 2) / old;
        this.stage.style.width = (this.zoom * 100) + '%';
        vp.scrollLeft = mx * this.zoom - vp.clientWidth / 2;
        vp.scrollTop = my * this.zoom - vp.clientHeight / 2;
        this.zoomLabel.textContent = (Math.round(this.zoom * 10) / 10) + '×';
    }

    // ------------------------------------------------------------ drawing

    /** Builds the elements and the pointer handling. */
    build()
    {
        this.img = el('img', { alt: '', draggable: 'false' });
        this.layer = el('div', { class: 'fv-layer' });
        this.stage = el('div', { class: 'fv-stage' }, [this.img, this.layer]);
        this.viewport = el('div', { class: 'fv-viewport' }, [this.stage]);
        this.zoomLabel = el('span', { dir: 'ltr', text: '1×' });
        const zoomBar = el('div', { class: 'zoom-buttons fv-zoom' }, [
            el('button', { type: 'button', text: '+', 'aria-label': 'zoom in', onclick: () => this.setZoom(this.zoom + VIEW.ZOOM_STEP) }),
            this.zoomLabel,
            el('button', { type: 'button', text: '−', 'aria-label': 'zoom out', onclick: () => this.setZoom(this.zoom - VIEW.ZOOM_STEP) })
        ]);
        fill(this.host, el('div', { class: 'faceview fv-' + this.mode }, [this.viewport, zoomBar]));
        this.bindPointers();
    }

    /** Draws the boxes. */
    draw()
    {
        const items = [];
        this.boxes.forEach((b) =>
        {
            let cls = 'fv-box';
            let label = '';
            if (this.mode === 'pick')
            {
                if (b.id === this.mine)
                {
                    cls += ' mine';
                    label = this.meLabel || '';
                }
                else if (this.taken.has(b.id))
                {
                    cls += ' taken';
                }
                if (b.id === this.selected)
                {
                    cls += ' selected';
                }
            }
            else if (this.mode === 'watch')
            {
                label = this.labels.get(b.id) || '';
                cls += label ? ' claimed' : ' free';
            }
            // edit mode: no numbers (the count is above); numbers would hide the small faces
            items.push(el('div', {
                class: cls,
                style: 'left:' + (b.x * 100) + '%;top:' + (b.y * 100) + '%;width:' + (b.w * 100) + '%;height:' + (b.h * 100) + '%'
            }, label ? [el('span', { text: label })] : []));
        });
        for (const b of this.extra)
        {
            items.push(el('div', {
                class: 'fv-box request ' + (b.state || ''),
                style: 'left:' + (b.x * 100) + '%;top:' + (b.y * 100) + '%;width:' + (b.w * 100) + '%;height:' + (b.h * 100) + '%'
            }, b.label ? [el('span', { text: b.label })] : []));
        }
        fill(this.layer, ...items);
    }

    // ------------------------------------------------------------ input

    /** Tap / drag / pinch on the photo. */
    bindPointers()
    {
        const vp = this.viewport;
        const fingers = new Map();
        let start = null;
        let pinch = null;
        vp.addEventListener('pointerdown', (ev) =>
        {
            fingers.set(ev.pointerId, ev);
            if (fingers.size === 1)
            {
                start = { x: ev.clientX, y: ev.clientY, sl: vp.scrollLeft, st: vp.scrollTop, moved: false };
            }
            else if (fingers.size === 2)
            {
                const [a, b] = [...fingers.values()];
                pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), zoom: this.zoom };
                start = null;
            }
        });
        vp.addEventListener('pointermove', (ev) =>
        {
            if (!fingers.has(ev.pointerId))
            {
                return;
            }
            fingers.set(ev.pointerId, ev);
            if (pinch && fingers.size === 2)
            {
                const [a, b] = [...fingers.values()];
                const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                if (pinch.d > 0)
                {
                    this.setZoom(pinch.zoom * d / pinch.d);
                }
            }
            else if (start)
            {
                const dx = ev.clientX - start.x;
                const dy = ev.clientY - start.y;
                if (Math.hypot(dx, dy) > VIEW.TAP_MOVE_PX)
                {
                    start.moved = true;
                }
                if (start.moved && this.zoom > 1)
                {
                    vp.scrollLeft = start.sl - dx;
                    vp.scrollTop = start.st - dy;
                }
            }
        });
        const end = (ev) =>
        {
            const wasTap = start && !start.moved && fingers.size === 1 && ev.type === 'pointerup';
            fingers.delete(ev.pointerId);
            if (fingers.size < 2)
            {
                pinch = null;
            }
            if (wasTap)
            {
                this.tap(ev.clientX, ev.clientY);
            }
            start = null;
        };
        vp.addEventListener('pointerup', end);
        vp.addEventListener('pointercancel', end);
    }

    /**
     * Handles a tap at screen coordinates.
     * @param {number} cx - client x
     * @param {number} cy - client y
     */
    tap(cx, cy)
    {
        const r = this.img.getBoundingClientRect();
        if (r.width === 0)
        {
            return;
        }
        const px = (cx - r.left) / r.width;
        const py = (cy - r.top) / r.height;
        if (px < 0 || px > 1 || py < 0 || py > 1)
        {
            return;
        }
        if (this.mode === 'pick' && this.placing)
        {
            this.onPlace(px, py);
            return;
        }
        const i = hitTest(this.boxes, px, py);
        if (this.mode === 'edit')
        {
            this.history.push(this.boxes.slice());
            if (i >= 0)
            {
                this.boxes = this.boxes.filter((_, k) => k !== i);
            }
            else
            {
                this.boxes = withIds(this.boxes.concat([boxAt(this.boxes, px, py, this.aspect)]));
            }
            this.draw();
            this.onChange(this.boxes);
        }
        else if (this.mode === 'pick' && i >= 0)
        {
            const id = this.boxes[i].id;
            if (!this.taken.has(id) && id !== this.mine)
            {
                this.onPick(id);              // a free face (also to change my choice); green = taken
            }
        }
        else if (this.mode === 'watch' && i >= 0)
        {
            this.onBox(this.boxes[i].id);
        }
    }
}
