// Tests for emoji reactions on comments (core/reactions.js). TC-RX-1..3. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REACTIONS, reactionId, cleanEmojis, toggleEmoji, tally } from '../js/core/reactions.js';

test('TC-RX-1: only known emojis, each once, in the shown order', () =>
{
    assert.deepEqual(cleanEmojis(['wow', 'like', 'like', 'bomb', '']), ['like', 'wow']);
    assert.deepEqual(cleanEmojis(null), []);
    assert.equal(REACTIONS[0].emoji, '👍');
    assert.equal(reactionId('c1', 'u9'), 'c1_u9');
});

test('TC-RX-2: tapping adds an emoji, tapping again removes it; several emojis are allowed', () =>
{
    let mine = toggleEmoji([], 'like');
    assert.deepEqual(mine, ['like']);
    mine = toggleEmoji(mine, 'think');
    assert.deepEqual(mine, ['like', 'think']);
    mine = toggleEmoji(mine, 'like');
    assert.deepEqual(mine, ['think']);
});

test('TC-RX-3: counts per comment and emoji, one per user, and which ones are mine', () =>
{
    const records = [
        { cid: 'a', uid: 'u1', emojis: ['like', 'haha'] },
        { cid: 'a', uid: 'u2', emojis: ['like'] },
        { cid: 'a', uid: 'u3', emojis: ['like', 'like', 'nope'] },     // a broken record counts once
        { cid: 'b', uid: 'u1', emojis: [] }
    ];
    const t = tally(records, 'u1');
    assert.deepEqual(t.get('a').counts, { like: 3, haha: 1 });
    assert.deepEqual(t.get('a').mine, ['like', 'haha']);
    assert.deepEqual(t.get('b').counts, {});
    assert.equal(t.get('c'), undefined);
});
