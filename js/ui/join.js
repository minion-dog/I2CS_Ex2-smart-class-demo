// =====================================================================
//  join.js - a plain QR with the website's address for phones
// =====================================================================
// Local server only. The PC shows it; a phone on the same Wi-Fi scans it
// with the normal camera app and the site opens. It is an ordinary QR
// (only the address, no attendance code), so photographing it is fine.

import { matrixFromText } from '../core/noisyqr.js';

const QUIET = 2;            // white squares around the code

/**
 * Asks the server for the phones' address and draws it as a QR.
 * @param {HTMLCanvasElement} canvas - where to draw
 * @param {HTMLElement} urlBox - where to write the address
 * @returns {Promise<boolean>} true when shown
 */
export async function showJoinCode(canvas, urlBox)
{
    try
    {
        const info = await (await fetch('/api/info')).json();
        drawQr(canvas, info.urls.phones);
        urlBox.textContent = info.urls.phones;
        return true;
    }
    catch (e)
    {
        console.warn('join code:', e.message);
        return false;
    }
}

/**
 * Draws a normal black-and-white QR.
 * @param {HTMLCanvasElement} canvas - where to draw
 * @param {string} text - what the QR holds
 */
export function drawQr(canvas, text)
{
    const m = matrixFromText(globalThis.qrcode, text);
    const cell = Math.floor(canvas.width / (m.size + 2 * QUIET));
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#000';
    for (let r = 0; r < m.size; r++)
    {
        for (let c = 0; c < m.size; c++)
        {
            if (m.dark[r * m.size + c])
            {
                g.fillRect((c + QUIET) * cell, (r + QUIET) * cell, cell, cell);
            }
        }
    }
}

/**
 * Tells whether this page is open on the PC that runs the server.
 * @returns {boolean} true for localhost
 */
export function onThisPc()
{
    return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}
