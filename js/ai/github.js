// =====================================================================
//  github.js - read a PUBLIC repository for the AI review
// =====================================================================
// Uses the public GitHub REST API (no key: 60 requests per hour per
// computer, enough for a class). Private repos are not readable; the
// student can upload files instead.

import { githubParts, pickRepoFiles } from './prompts.js';

const API = 'https://api.github.com/repos/';

/**
 * Downloads the chosen files of a repository.
 * @param {string} url - repository URL
 * @returns {Promise<{name:string, text:string}[]>} files
 * @throws {Error} 'not-github' for other URLs, or the API status
 */
export async function fetchRepoFiles(url)
{
    const parts = githubParts(url);
    if (parts === null)
    {
        throw new Error('not-github');
    }
    const base = API + parts.owner + '/' + parts.repo;
    const info = await getJson(base);
    const tree = await getJson(base + '/git/trees/' + encodeURIComponent(info.default_branch) + '?recursive=1');
    const paths = pickRepoFiles(tree.tree || []);
    const out = [];
    for (const p of paths)
    {
        const raw = 'https://raw.githubusercontent.com/' + parts.owner + '/' + parts.repo + '/' +
            encodeURIComponent(info.default_branch) + '/' + p.split('/').map(encodeURIComponent).join('/');
        const res = await fetch(raw);
        if (res.ok)
        {
            out.push({ name: p, text: await res.text() });
        }
    }
    return out;
}

/**
 * GETs JSON from GitHub.
 * @param {string} url - API URL
 * @returns {Promise<object>} body
 */
async function getJson(url)
{
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok)
    {
        throw new Error('GitHub ' + res.status);
    }
    return res.json();
}
