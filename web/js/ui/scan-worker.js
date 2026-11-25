// =====================================================================
//  scan-worker.js - runs the ScanEngine on a second thread
// =====================================================================
// The page sends camera frames; this thread builds the change map and runs
// jsQR, so the camera preview on the page never waits (see core/scan-engine.js).

import { ScanEngine } from '../core/scan-engine.js';
import '../../vendor/jsQR.js';                     // sets self.jsQR

const SIDE = 400;                                  // same as scanner.js

const engine = new ScanEngine(SIDE, (rgba, w, h) =>
{
    const r = self.jsQR(rgba, w, h, { inversionAttempts: 'dontInvert' });
    return r && r.data ? r.data : null;
});

self.onmessage = (e) =>
{
    const out = engine.handle(e.data);
    if (out !== null)
    {
        self.postMessage(out, out.view ? [out.view.buffer] : []);
    }
};
