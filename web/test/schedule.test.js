// Tests of the timetable (web/js/core/schedule.js): lectures open by themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minutes, cleanSlots, slotNow, dueSlot, newlyOpened } from '../js/core/schedule.js';

const SLOTS = cleanSlots([
    { day: 3, start: '10:00', end: '12:00', title: 'Intro2SE' },
    { day: 3, start: '13:00', end: '12:00', title: 'bad: ends before it starts' },
    { day: 9, start: '10:00', end: '11:00', title: 'bad day' },
    { day: 1, start: '9:5', end: '11:00', title: 'bad time' }
]);
const at = (d, h, m) => new Date(2026, 10, 22 + d, h, m);      // 22 Nov 2026 is a Sunday (day 0)

test('TC-SCH-1: times are read and wrong slots are dropped', () =>
{
    assert.equal(minutes('10:30'), 630);
    assert.ok(Number.isNaN(minutes('25:00')));
    assert.equal(SLOTS.length, 1);
});

test('TC-SCH-2: the slot runs from 5 minutes before the start to the end, on its weekday only', () =>
{
    assert.equal(slotNow(SLOTS, at(3, 9, 54)), null);
    assert.equal(slotNow(SLOTS, at(3, 9, 55)).title, 'Intro2SE');
    assert.equal(slotNow(SLOTS, at(3, 11, 59)).title, 'Intro2SE');
    assert.equal(slotNow(SLOTS, at(3, 12, 0)), null);
    assert.equal(slotNow(SLOTS, at(2, 10, 30)), null);
});

test('TC-SCH-3: a lecture opens by itself once: not when one is open, not twice the same day', () =>
{
    const now = at(3, 10, 2);
    assert.equal(dueSlot(SLOTS, [], now).title, 'Intro2SE');
    assert.equal(dueSlot(SLOTS, [{ startedAt: now.getTime() - 60000, endedAt: null }], now), null);
    assert.equal(dueSlot(SLOTS, [{ startedAt: at(3, 10, 0).getTime(), endedAt: at(3, 10, 1).getTime() }], now), null, 'already ran (ended early)');
    assert.equal(dueSlot(SLOTS, [{ startedAt: at(-4, 10, 0).getTime(), endedAt: at(-4, 12, 0).getTime() }], now).title, 'Intro2SE', 'last week does not count');
});

test('TC-SCH-4: students are told about a lecture that just opened, once', () =>
{
    const known = new Set(['a']);
    assert.deepEqual(newlyOpened(known, [{ id: 'a', endedAt: null }, { id: 'b', endedAt: null }, { id: 'c', endedAt: 5 }]), ['b']);
});
