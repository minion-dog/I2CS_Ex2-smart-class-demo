// =====================================================================
//  store.js - picks the data layer (Strategy pattern)
// =====================================================================
// Three data layers with the same methods:
//   ?lan=1  -> the local server (server/server.py), to test with real phones
//   ?demo=1 -> the in-browser demo store (or when Firebase is not set up yet)
//   else    -> real Firebase

import { FIREBASE_CONFIG } from '../firebase-config.js';
import { FakeStore } from './fake-store.js';
import { FirebaseStore } from './firebase-store.js';
import { LanStore } from './lan-store.js';

let instance = null;

/**
 * Tells whether the Firebase config was filled in.
 * @returns {boolean} true when real Firebase can be used
 */
export function firebaseConfigured()
{
    return Boolean(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith('PASTE'));
}

/**
 * Tells whether demo mode was asked for (?demo=1) or is forced.
 * @returns {boolean} true for the demo store
 */
export function demoMode()
{
    if (lanMode())
    {
        return false;
    }
    const asked = new URLSearchParams(location.search).get('demo') === '1';
    return asked || !firebaseConfigured();
}

/**
 * Tells whether the site was opened from the local server (?lan=1).
 * @returns {boolean} true for the local-server store
 */
export function lanMode()
{
    return new URLSearchParams(location.search).get('lan') === '1';
}

/**
 * The part of the address that keeps the mode when moving between pages.
 * @returns {string} '?lan=1', '?demo=1' or ''
 */
export function modeSuffix()
{
    if (lanMode())
    {
        return '?lan=1';
    }
    return demoMode() ? '?demo=1' : '';
}

/**
 * Returns the one store of this page.
 * @returns {FakeStore|LanStore|FirebaseStore} the store
 */
export function getStore()
{
    if (instance === null)
    {
        if (lanMode())
        {
            instance = new LanStore();
        }
        else
        {
            instance = demoMode() ? new FakeStore() : new FirebaseStore(FIREBASE_CONFIG);
        }
    }
    return instance;
}
