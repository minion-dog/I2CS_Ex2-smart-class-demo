// =====================================================================
//  prompts.js - what we ask the AI (pure functions, unit tested)
// =====================================================================

/** Limits that keep a request inside the model's context. */
export const LIMITS = Object.freeze({
    TRANSCRIPT_CHARS: 200000,     // ~ a 3-hour lecture
    REPO_FILES: 25,               // files read from a GitHub repo
    FILE_CHARS: 12000,            // characters kept per file
    SUBMISSION_CHARS: 60000,      // characters per submission sent to the AI
    PEER_SUMMARY_CHARS: 1500      // characters per other student's summary (for comparison)
});

const CODE_EXT = /\.(java|kt|py|js|ts|c|h|cpp|hpp|cs|go|rs|html|css|md|txt|json|xml|gradle|sql|ipynb)$/i;
const SKIP_DIR = /(^|\/)(node_modules|build|dist|out|\.git|\.idea|venv|__pycache__|target)(\/|$)/;

/**
 * Builds the messages for a lecture summary.
 * @param {string} title - lecture name
 * @param {string} transcript - the full text
 * @param {string} uiLang - 'he' or 'en' (language of the summary)
 * @returns {{role:string, content:string}[]} messages
 */
export function summaryPrompt(title, transcript, uiLang)
{
    const langName = uiLang === 'en' ? 'English' : 'Hebrew';
    const text = transcript.slice(0, LIMITS.TRANSCRIPT_CHARS);
    return [
        {
            role: 'system',
            content: 'You summarise university lectures for students. Write in ' + langName + '. ' +
                'Structure: 1) the main topics as short headings, 2) key definitions and formulas, ' +
                '3) examples the lecturer gave, 4) what to review before next time. ' +
                'Use only what is in the transcript; if something is unclear, say so instead of guessing.'
        },
        { role: 'user', content: 'Lecture: ' + title + '\n\nTranscript:\n' + text }
    ];
}

/**
 * Splits a GitHub URL into owner and repo.
 * @param {string} url - e.g. https://github.com/owner/repo(.git)(/tree/...)
 * @returns {{owner:string, repo:string}|null} parts, or null when not a GitHub repo URL
 */
export function githubParts(url)
{
    const m = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/.exec(String(url).trim());
    if (!m)
    {
        return null;
    }
    return { owner: m[1], repo: m[2] };
}

/**
 * Picks which repository files to read: README first, then source files,
 * smallest paths first (top-level files tell most), skipping build output.
 * @param {{path:string, type:string, size:number}[]} tree - from the GitHub trees API
 * @returns {string[]} paths, at most LIMITS.REPO_FILES
 */
export function pickRepoFiles(tree)
{
    const files = tree.filter((n) => n.type === 'blob' && CODE_EXT.test(n.path) && !SKIP_DIR.test(n.path) && n.size < 400000);
    const readme = files.filter((n) => /(^|\/)readme\.md$/i.test(n.path));
    const rest = files.filter((n) => !/(^|\/)readme\.md$/i.test(n.path));
    rest.sort((a, b) => depth(a.path) - depth(b.path) || a.path.localeCompare(b.path));
    return readme.concat(rest).slice(0, LIMITS.REPO_FILES).map((n) => n.path);
}

/**
 * Joins submission files into one text, cutting long files and the total.
 * @param {{name:string, text:string}[]} files - files
 * @returns {string} text for the prompt
 */
export function submissionText(files)
{
    let out = '';
    for (const f of files)
    {
        let body = f.text;
        if (body.length > LIMITS.FILE_CHARS)
        {
            body = body.slice(0, LIMITS.FILE_CHARS) + '\n[... cut ...]';
        }
        out += '\n===== ' + f.name + ' =====\n' + body + '\n';
        if (out.length > LIMITS.SUBMISSION_CHARS)
        {
            return out.slice(0, LIMITS.SUBMISSION_CHARS) + '\n[... more files not shown ...]';
        }
    }
    return out;
}

/**
 * Builds the messages for a homework review, including a comparison with
 * the other students' work (the sheet asks for "comparisons to the other
 * students' work"). Other students appear only as short anonymous
 * summaries ("Student A"), never with their names or full code.
 * @param {string} requirements - the assignment's requirements
 * @param {string} submission - output of submissionText
 * @param {string[]} peerSummaries - short summaries of other submissions
 * @param {string} uiLang - 'he' or 'en'
 * @returns {{role:string, content:string}[]} messages
 */
export function reviewPrompt(requirements, submission, peerSummaries, uiLang)
{
    const langName = uiLang === 'en' ? 'English' : 'Hebrew';
    let peers = '';
    for (let i = 0; i < peerSummaries.length; i++)
    {
        peers += '\nStudent ' + String.fromCharCode(65 + (i % 26)) + ': ' + peerSummaries[i].slice(0, LIMITS.PEER_SUMMARY_CHARS);
    }
    return [
        {
            role: 'system',
            content: 'You are a teaching assistant reviewing a software-engineering homework. Write in ' + langName + '. ' +
                'Sections: 1) Requirements check: a table with each requirement, Met / Partly / Missing, and evidence (file name). ' +
                '2) Missing elements. 3) Code quality (design, naming, tests). ' +
                '4) Comparison with the class: how this work compares with the other submissions (more/less complete, ' +
                'unusual ideas), without naming anyone. 5) Three concrete suggestions. ' +
                'Finish with one line: "SUMMARY: <one sentence about what this submission does>". ' +
                'Be specific and fair; do not invent files that are not shown.'
        },
        {
            role: 'user',
            content: 'REQUIREMENTS:\n' + requirements + '\n\nOTHER SUBMISSIONS (anonymous summaries):' +
                (peers === '' ? ' none yet' : peers) + '\n\nTHIS SUBMISSION:\n' + submission
        }
    ];
}

/**
 * Pulls the one-sentence summary line out of a review (used for later comparisons).
 * @param {string} review - the AI review
 * @returns {string} the summary, or the first 200 characters
 */
export function reviewSummaryLine(review)
{
    const m = /SUMMARY:\s*(.+)/i.exec(review || '');
    if (m)
    {
        return m[1].trim();
    }
    return (review || '').slice(0, 200);
}

/**
 * Counts path depth.
 * @param {string} p - path
 * @returns {number} number of slashes
 */
function depth(p)
{
    return p.split('/').length - 1;
}
