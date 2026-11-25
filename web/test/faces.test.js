// Tests of the class-photo faces logic (web/js/core/faces.js) and the AI Worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    FACES, iou, mergeBoxes, trustLocal, requestedBox, checkCrop, parseCheck, parseGeminiBoxes, tiles, hitTest, boxAt, withIds,
    claimsOf, myStep, photoStats, claimId, compareWithScans, storedSize
} from '../js/core/faces.js';

const box = (x, y, w, h, score) => ({ x: x, y: y, w: w, h: h, score: score });

test('TC-FACE-1: overlap (IoU) of boxes', () =>
{
    assert.equal(iou(box(0, 0, 0.1, 0.1), box(0, 0, 0.1, 0.1)), 1);
    assert.equal(iou(box(0, 0, 0.1, 0.1), box(0.5, 0.5, 0.1, 0.1)), 0);
    assert.ok(Math.abs(iou(box(0, 0, 0.2, 0.1), box(0.1, 0, 0.2, 0.1)) - 1 / 3) < 1e-9);
});

test('TC-FACE-2: merging keeps one box per face (two finders, tiles, a face inside a face)', () =>
{
    const merged = mergeBoxes([
        box(0.10, 0.10, 0.05, 0.06, 1),        // Gemini
        box(0.101, 0.102, 0.05, 0.058, 0.8),   // the same face from MediaPipe
        box(0.11, 0.11, 0.02, 0.02, 0.7),      // part of that face (inside it)
        box(0.50, 0.12, 0.05, 0.06, 0.9),      // another face
        box(0.9, 0.9, 0.001, 0.001, 0.9),      // noise
        box(0.98, 0.5, 0.05, 0.05, 0.9)        // over the edge: clamped
    ]);
    assert.equal(merged.length, 3);
    assert.ok(merged.every((b) => b.x >= 0 && b.x + b.w <= 1.000001));
    assert.ok(merged[0].x < merged[1].x, 'reading order: left to right in a row');
});

test('TC-FACE-3: Gemini boxes are read from [ymin,xmin,ymax,xmax] in 0..1000, also inside ```json fences', () =>
{
    const text = '```json\n[{"box_2d":[100,200,160,250]},{"box_2d":[500,600,560,650]},{"bad":1}]\n```';
    const b = parseGeminiBoxes(text);
    assert.equal(b.length, 2);
    assert.deepEqual([b[0].x, b[0].y], [0.2, 0.1]);
    assert.ok(Math.abs(b[0].w - 0.05) < 1e-9 && Math.abs(b[0].h - 0.06) < 1e-9);
    assert.deepEqual(parseGeminiBoxes('sorry, no list'), []);
    assert.deepEqual(parseGeminiBoxes('[not json'), []);
});

test('TC-FACE-4: tiles cover the whole photo and overlap', () =>
{
    const t = tiles(1600, 1200, 384, 0.35);
    assert.ok(t.length > 20);
    assert.ok(t.some((p) => p.x === 1600 - 384) && t.some((p) => p.y === 1200 - 384), 'last tile touches the edge');
    assert.ok(t.every((p) => p.side === 384));
    assert.equal(tiles(300, 200, 384, 0.35).length, 2, 'a small photo: tiles shrink to fit');
});

test('TC-FACE-5: tapping hits the nearest box, small boxes get slack, empty space is -1', () =>
{
    const boxes = [box(0.1, 0.1, 0.02, 0.02), box(0.13, 0.1, 0.02, 0.02)];
    assert.equal(hitTest(boxes, 0.11, 0.11), 0);
    assert.equal(hitTest(boxes, 0.141, 0.11), 1);
    assert.equal(hitTest(boxes, 0.125, 0.105), 0, 'between two: the closer centre wins');
    assert.equal(hitTest(boxes, 0.1 - 0.01, 0.11), 0, 'just outside a tiny box still hits it');
    assert.equal(hitTest(boxes, 0.6, 0.6), -1);
});

test('TC-FACE-6: a box added by hand has the size of the faces around it and a new id', () =>
{
    const boxes = withIds([box(0.1, 0.1, 0.04, 0.05), box(0.2, 0.1, 0.04, 0.05), box(0.8, 0.8, 0.1, 0.12)]);
    const added = boxAt(boxes, 0.15, 0.12, 4 / 3);
    assert.ok(Math.abs(added.w - 0.04) < 1e-9, 'size of the nearest boxes');
    assert.ok(Math.abs(added.x + added.w / 2 - 0.15) < 1e-9, 'centred on the tap');
    const all = withIds(boxes.concat([added]));
    assert.deepEqual(all.map((b) => b.id), [1, 2, 3, 4]);
    const afterDelete = withIds(all.filter((b) => b.id !== 2).concat([box(0.5, 0.5, 0.04, 0.05)]));
    assert.deepEqual(afterDelete.map((b) => b.id), [1, 3, 4, 5], 'ids never change; deleting does not renumber');
    const first = boxAt([], 0.5, 0.5, 2);
    assert.ok(Math.abs(first.h - FACES.DEFAULT_SIDE * 2) < 1e-9, 'no boxes: a square box on screen');
});

test('TC-FACE-7: claims, the student\'s next step, and the lecturer\'s numbers', () =>
{
    const boxes = withIds([box(0.1, 0.1, 0.04, 0.05), box(0.2, 0.1, 0.04, 0.05), box(0.3, 0.1, 0.04, 0.05)]);
    const att = [
        { email: 'a@x', status: 'present', face: 1, photoV: 2 },
        { email: 'b@x', status: 'present', face: FACES.NOT_FOUND, photoV: 2 },
        { email: 'c@x', status: 'present' },
        { email: 'd@x', status: 'present', face: 3, photoV: 1 },          // chose in an old photo
        { email: 'e@x', status: 'manual' }
    ];
    assert.deepEqual([...claimsOf(att, 2)], [[1, 'a@x']]);
    assert.deepEqual(photoStats(boxes, att, 2), { faces: 3, confirmed: 1, notFound: 1, waiting: 2, freeFaces: 2 });
    const photo = { v: 2 };
    assert.equal(myStep(null, photo), 'scan');
    assert.equal(myStep(att[2], null), 'nophoto');
    assert.equal(myStep(att[2], photo), 'pick');
    assert.equal(myStep(att[3], photo), 'pick', 'a new photo: choose again');
    assert.equal(myStep(att[0], photo), 'done');
    assert.equal(myStep(att[1], photo), 'told');
    assert.equal(claimId(2, 7), '2_7');
});

test('TC-FACE-8: more scans than faces is suspicious; stored photo stays small', () =>
{
    assert.deepEqual(compareWithScans(30, 33), { suspicious: true, extra: 3 });
    assert.deepEqual(compareWithScans(30, 28), { suspicious: false, extra: 0 });
    assert.deepEqual(storedSize(4000, 3000), { w: 1600, h: 1200 });
    assert.deepEqual(storedSize(800, 600), { w: 800, h: 600 });
});

test('TC-FACE-9: local hits are trusted by size: back-row faces with low scores stay, big low-score hits (hands) go', () =>
{
    const raw = [
        box(0.30, 0.50, 0.010, 0.013, 0.49), box(0.301, 0.501, 0.010, 0.013, 0.45),   // back face seen in 2 tiles
        box(0.60, 0.50, 0.010, 0.013, 0.50),                                         // back, one weak hit: dropped
        box(0.40, 0.60, 0.020, 0.025, 0.76),                                         // middle face
        box(0.42, 0.75, 0.030, 0.038, 0.68),                                         // big hit, not sure: hands
        box(0.20, 0.72, 0.035, 0.045, 0.83)                                          // front face
    ];
    const kept = trustLocal(raw);
    assert.equal(kept.length, 3);
    assert.ok(kept.some((b) => b.x === 0.30) && kept.some((b) => b.x === 0.40) && kept.some((b) => b.x === 0.20));
});

test('TC-FACE-10: a student places his own box (also at the edge); Gemini gets a crop around it; its yes/no is read', () =>
{
    const boxes = withIds([box(0.1, 0.1, 0.04, 0.05), box(0.2, 0.1, 0.04, 0.05)]);
    const edge = requestedBox(boxes, 1.2, 0.5, 4 / 3);               // tapped past the right edge
    assert.ok(edge.x + edge.w <= 1.000001 && edge.w > 0, 'clamped to the photo');
    const c = checkCrop({ x: 0.5, y: 0.5, w: 0.02, h: 0.03 }, 2000, 1500);
    assert.ok(c.sw > 0 && c.sh > 0 && c.sx >= 0 && c.sy >= 0);
    assert.ok(c.box.x > 0 && c.box.x + c.box.w < c.sw, 'the box is inside the crop');
    const corner = checkCrop({ x: 0.99, y: 0.0, w: 0.01, h: 0.02 }, 2000, 1500);
    assert.ok(corner.sx + corner.sw <= 2000 && corner.sy === 0, 'crop clamped at the corner');
    assert.deepEqual(parseCheck('```json\n{"person": true, "reason": "a head, cut off"}\n```'), { person: true, reason: 'a head, cut off' });
    assert.equal(parseCheck('{"person": "maybe"}'), null);
    assert.equal(parseCheck('no json'), null);
});
