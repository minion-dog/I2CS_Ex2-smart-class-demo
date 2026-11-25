// =====================================================================
//  reactions.js - emoji reactions on comments (pure logic)
// =====================================================================
// Idea (25 Nov 2026, seen in classmates' projects and liked by us): a student
// can react to a public question with a few emojis, e.g. 👍 "me too", and
// everyone, the lecturer too, sees how many of each. Popular questions stand
// out without anyone writing "+1". Only counts are shown, never who reacted.
//
// Storage: one record per (comment, user): { cid, uid, emojis: ['like', ...] }.
// A user may pick several emojis on one comment, each once.

/** The emojis, in the order they are shown. */
export const REACTIONS = Object.freeze([
    Object.freeze({ key: 'like', emoji: '👍' }),
    Object.freeze({ key: 'love', emoji: '❤️' }),
    Object.freeze({ key: 'haha', emoji: '😂' }),
    Object.freeze({ key: 'wow', emoji: '😮' }),
    Object.freeze({ key: 'think', emoji: '🤔' })
]);

const KEYS = new Set(REACTIONS.map((r) => r.key));

/**
 * The record id for one user on one comment (one record each, so one vote per emoji).
 * @param {string} cid - comment id
 * @param {string} uid - user id
 * @returns {string} id
 */
export function reactionId(cid, uid)
{
    return cid + '_' + uid;
}

/**
 * Keeps only known emoji keys, each once, in the shown order.
 * @param {string[]} emojis - keys
 * @returns {string[]} clean keys
 */
export function cleanEmojis(emojis)
{
    const set = new Set((emojis || []).filter((k) => KEYS.has(k)));
    return REACTIONS.map((r) => r.key).filter((k) => set.has(k));
}

/**
 * Adds an emoji when it is not picked yet, removes it when it is.
 * @param {string[]} emojis - my keys on this comment
 * @param {string} key - the tapped emoji
 * @returns {string[]} new keys
 */
export function toggleEmoji(emojis, key)
{
    const mine = new Set(emojis || []);
    if (mine.has(key))
    {
        mine.delete(key);
    }
    else
    {
        mine.add(key);
    }
    return cleanEmojis([...mine]);
}

/**
 * Counts the emojis per comment, and which ones I picked.
 * @param {{cid:string, uid:string, emojis:string[]}[]} records - all reaction records
 * @param {string} myUid - the signed-in user
 * @returns {Map<string, {counts:Object<string,number>, mine:string[]}>} by comment id
 */
export function tally(records, myUid)
{
    const out = new Map();
    for (const r of records || [])
    {
        if (!out.has(r.cid))
        {
            out.set(r.cid, { counts: {}, mine: [] });
        }
        const t = out.get(r.cid);
        for (const k of cleanEmojis(r.emojis))
        {
            t.counts[k] = (t.counts[k] || 0) + 1;
        }
        if (r.uid === myUid)
        {
            t.mine = cleanEmojis(r.emojis);
        }
    }
    return out;
}
