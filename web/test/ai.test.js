// Tests for the AI helpers that do not need the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryPrompt, githubParts, pickRepoFiles, submissionText, reviewPrompt, reviewSummaryLine, LIMITS } from '../js/ai/prompts.js';
import { peopleOnly, compareWithScans } from '../js/ai/headcount.js';
import { keysOf } from '../js/ui/i18n.js';

test('TC-AI-1: summary prompt asks for Hebrew by default and contains the transcript', () =>
{
    const m = summaryPrompt('שיעור 3', 'היום נלמד על ירושה', 'he');
    assert.match(m[0].content, /Hebrew/);
    assert.match(m[1].content, /ירושה/);
});

test('TC-AI-2: GitHub URLs are parsed; other URLs are rejected', () =>
{
    assert.deepEqual(githubParts('https://github.com/NoamTheGolem/Intro2SE_Ex1'), { owner: 'NoamTheGolem', repo: 'Intro2SE_Ex1' });
    assert.deepEqual(githubParts('https://github.com/a/b.git'), { owner: 'a', repo: 'b' });
    assert.deepEqual(githubParts('https://github.com/a/b/tree/main/src'), { owner: 'a', repo: 'b' });
    assert.equal(githubParts('https://gitlab.com/a/b'), null);
});

test('TC-AI-3: repo files: README first, build folders skipped, at most REPO_FILES', () =>
{
    const tree = [
        { path: 'src/deep/X.java', type: 'blob', size: 10 },
        { path: 'README.md', type: 'blob', size: 10 },
        { path: 'build/Out.java', type: 'blob', size: 10 },
        { path: 'node_modules/a.js', type: 'blob', size: 10 },
        { path: 'Main.java', type: 'blob', size: 10 },
        { path: 'logo.png', type: 'blob', size: 10 },
        { path: 'src', type: 'tree', size: 0 }
    ];
    assert.deepEqual(pickRepoFiles(tree), ['README.md', 'Main.java', 'src/deep/X.java']);
    const many = [];
    for (let i = 0; i < 100; i++)
    {
        many.push({ path: 'f' + i + '.py', type: 'blob', size: 1 });
    }
    assert.equal(pickRepoFiles(many).length, LIMITS.REPO_FILES);
});

test('TC-AI-4: long submissions are cut', () =>
{
    const big = 'x'.repeat(LIMITS.FILE_CHARS + 50);
    const text = submissionText([{ name: 'A.java', text: big }]);
    assert.match(text, /cut/);
    assert.ok(text.length < LIMITS.FILE_CHARS + 200);
});

test('TC-AI-5: review prompt compares with anonymous peers and never shows their names', () =>
{
    const m = reviewPrompt('implement a stack', 'code', ['did a queue instead', 'full stack + tests'], 'he');
    assert.match(m[1].content, /Student A: did a queue/);
    assert.match(m[1].content, /Student B: full stack/);
    assert.match(m[0].content, /Comparison with the class/);
});

test('TC-AI-6: summary line is extracted from a review', () =>
{
    assert.equal(reviewSummaryLine('...\nSUMMARY: A stack with tests.'), 'A stack with tests.');
    assert.equal(reviewSummaryLine('no line'), 'no line');
});

test('TC-HC-1: only confident people are counted', () =>
{
    const p = [
        { class: 'person', score: 0.9, bbox: [] },
        { class: 'person', score: 0.2, bbox: [] },
        { class: 'chair', score: 0.99, bbox: [] }
    ];
    assert.equal(peopleOnly(p, 0.35).length, 1);
});

test('TC-HC-2: more scans than people is suspicious', () =>
{
    assert.deepEqual(compareWithScans(30, 33), { suspicious: true, extra: 3 });
    assert.deepEqual(compareWithScans(30, 28), { suspicious: false, extra: 0 });
});

test('TC-I18N-1: Hebrew and English have exactly the same keys', () =>
{
    assert.deepEqual(keysOf('he').sort(), keysOf('en').sort());
});

test('TC-AI-7: Gemini request: system -> systemInstruction, assistant -> model; Groq keys stay on Groq', async () =>
{
    const { toGeminiBody, textOf } = await import('../js/ai/gemini.js');
    const { providerOf } = await import('../js/ai/groq.js');
    const body = toGeminiBody([
        { role: 'system', content: 'Answer in Hebrew.' },
        { role: 'user', content: 'Q1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'Q2' }
    ]);
    assert.deepEqual(body.systemInstruction, { parts: [{ text: 'Answer in Hebrew.' }] });
    assert.deepEqual(body.contents.map((c) => c.role), ['user', 'model', 'user']);
    assert.equal(body.contents[2].parts[0].text, 'Q2');
    assert.equal(textOf({ candidates: [{ content: { parts: [{ text: 'שלום ' }, { text: 'עולם' }] } }] }), 'שלום עולם');
    assert.equal(textOf({}), '');
    assert.equal(providerOf('gsk_abc'), 'groq');
    assert.equal(providerOf('AQ.xyz'), 'gemini');
    assert.equal(providerOf('AIzaSyX'), 'gemini');
});
