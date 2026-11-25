// Tests of the scanning guide (web/js/core/guide.js): the box on the screen and the hint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE, boxOnScreen, hintFor, smooth } from '../js/core/guide.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;

test('TC-GD-1: the found box is placed on the preview (middle square of a 1920x1080 picture)', () =>
{
    // not zoomed: the analysed square = the middle 1080x1080 square = the preview
    const crop = { x: 420, y: 0, s: 1080 };
    const r = boxOnScreen({ x0: 100, y0: 100, x1: 300, y1: 300 }, 400, crop, 1920, 1080, 1);
    assert.ok(near(r.x, 0.25) && near(r.y, 0.25) && near(r.w, 0.5) && near(r.h, 0.5));
    // auto-zoomed on a part of the picture: the box is still drawn where it is in the preview
    const zoomed = { x: 960, y: 270, s: 270 };              // the top-right quarter of the middle square
    const z = boxOnScreen({ x0: 0, y0: 0, x1: 400, y1: 400 }, 400, zoomed, 1920, 1080, 1);
    assert.ok(near(z.x, 0.5) && near(z.y, 0.25) && near(z.w, 0.25));
    // picture zoom 2x: the preview shows the middle 540x540, the same box looks twice as big
    const d = boxOnScreen({ x0: 150, y0: 150, x1: 250, y1: 250 }, 400, { x: 690, y: 270, s: 540 }, 1920, 1080, 2);
    assert.ok(near(d.x, 0.375) && near(d.w, 0.25));
});

test('TC-GD-2: hints: search, move closer, found, hold still', () =>
{
    assert.equal(hintFor(null, 0, 0), 'search');
    assert.equal(hintFor({}, GUIDE.CLOSER_PX - 1, 5), 'closer');
    assert.equal(hintFor({}, 300, 1), 'found');
    assert.equal(hintFor({}, 300, GUIDE.STEADY_ROUNDS), 'steady');
});

test('TC-GD-3: the drawn box follows smoothly', () =>
{
    const a = { x: 0, y: 0, w: 0.2, h: 0.2 };
    assert.deepEqual(smooth(null, a), a);
    const b = smooth(a, { x: 1, y: 1, w: 0.2, h: 0.2 });
    assert.ok(b.x > 0 && b.x < 1);
});
