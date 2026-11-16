// =====================================================================
//  classlist.js - read the Moodle participants file
// =====================================================================
// The lecturer's file (courseid_..._participants.csv / .xlsx) has the
// columns: first name, last name, ID number, email, groups. Staff
// (lecturer, TA) have an empty "groups" cell. Emails are compared in
// lower case, because Google sign-in returns them lower case.

const COL = Object.freeze({ FIRST: 0, LAST: 1, ID: 2, EMAIL: 3, GROUP: 4 });

/**
 * Splits CSV text into rows of trimmed cells (RFC 4180 quotes, "" = one quote).
 * @param {string} text - the file content
 * @returns {string[][]} rows; empty lines are dropped
 */
export function parseCsv(text)
{
    const src = text.replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i++)
    {
        const ch = src[i];
        if (quoted)
        {
            if (ch === '"' && src[i + 1] === '"')
            {
                cell += '"';
                i++;
            }
            else if (ch === '"')
            {
                quoted = false;
            }
            else
            {
                cell += ch;
            }
        }
        else if (ch === '"')
        {
            quoted = true;
        }
        else if (ch === ',')
        {
            row.push(cell.trim());
            cell = '';
        }
        else if (ch === '\n' || ch === '\r')
        {
            if (ch === '\r' && src[i + 1] === '\n')
            {
                i++;
            }
            row.push(cell.trim());
            pushRow(rows, row);
            row = [];
            cell = '';
        }
        else
        {
            cell += ch;
        }
    }
    row.push(cell.trim());
    pushRow(rows, row);
    return rows;
}

/**
 * Turns the rows of the participants file into roster entries.
 * The first row is the header and is skipped.
 * @param {string[][]} rows - from parseCsv or readXlsx
 * @returns {{first:string,last:string,id:string,email:string,group:string,staff:boolean}[]} entries
 */
export function rosterFromRows(rows)
{
    const out = [];
    const seen = new Set();
    for (let i = 1; i < rows.length; i++)
    {
        const r = rows[i];
        const email = normaliseEmail(r[COL.EMAIL] || '');
        if (email === '' || seen.has(email))
        {
            continue;
        }
        seen.add(email);
        const group = (r[COL.GROUP] || '').trim();
        out.push({
            first: (r[COL.FIRST] || '').trim(),
            last: (r[COL.LAST] || '').trim(),
            id: (r[COL.ID] || '').trim(),
            email: email,
            group: group,
            staff: group === ''
        });
    }
    return out;
}

/**
 * Normalises an email for comparison.
 * @param {string} email - any case, may have spaces
 * @returns {string} trimmed lower case
 */
export function normaliseEmail(email)
{
    return email.trim().toLowerCase();
}

/**
 * Adds a row unless every cell is empty.
 * @param {string[][]} rows - target
 * @param {string[]} row - candidate
 */
function pushRow(rows, row)
{
    for (const c of row)
    {
        if (c !== '')
        {
            rows.push(row);
            return;
        }
    }
}
