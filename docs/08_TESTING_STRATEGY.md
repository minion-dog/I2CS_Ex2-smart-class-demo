# Testing strategy

## 1. Goals

1. Prove the two claims the design stands on: **a photo can never mark attendance** and **a
   student in the room is marked within a few seconds**, also from the back and with a shaking hand.
2. Prove that the **security rules** let each user see and change only what they may.
3. Keep the JavaScript and the Java implementations identical (same algorithms, same test names).
4. Check every screen in a real browser at phone width, and the whole flow on real phones.

## 2. Test levels

| Level | What | Tool | How to run |
|---|---|---|---|
| Unit (JS) | Pure logic in `web/js/core`, `web/js/ai`, `web/js/ui/i18n.js` | `node:test` (Node 18+, no packages) | `cd web && npm test` |
| Unit (Java) | Pure Java in `android/.../core` (same algorithms) | JUnit 4 | `cd android && ./gradlew test` (or `javac` + JUnitCore) |
| Simulation | The flicker code filmed by a simulated hand-held 30 fps camera: sensor noise, exposure blending two phases, hand shake, a small code in a big room | inside the JS unit tests (`noisyqr.test.js`) | `npm test` |
| Attack tests | A single photo, merged photos (HDR/night mode, 3–90 frames), a burst of 3, a frozen picture held to the scanner, standard QR readers | `noisyqr.test.js`; Python `zxing-cpp` + `OpenCV` during design | `npm test` |
| Server / rules | The local server's rules and per-role views (same rules as `firestore.rules`) | Python `unittest` | `python -m unittest server/test_server.py` |
| Integration (browser) | All pages, both roles, phone and desktop width, XSS input, offline queue | Playwright (Chromium) | scripts in the repository history; see §5 |
| End to end with a camera | Chromium with a **fake camera** playing a generated video of the flicker code: live → marked; photo → nothing; second scan → "already"; a small code far away → auto-zoom reads it | Playwright + generated `.y4m` video | §5 |
| Real devices | Lecturer laptop + projector, several Android/iPhone phones, front and back rows | manual (demo checklist §6) | in class |

## 3. Test cases by class (the classes of the class diagrams)

| Class / module | Test cases | What they show |
|---|---|---|
| `FlickerSchedule` (JS + Java) | TC-QR-1, TC-QR-2, TC-QR-4, TC-QR-12 | The QR is valid; a single frame is random; dark and light squares average the same grey; dark squares change ~1/8 as often as light ones. |
| `ChangeMap` (JS + Java) | TC-QR-5, TC-QR-6, TC-QR-8, TC-QR-9, TC-QR-13 | Reads the code within 2 s steady or shaking; a frozen picture gives nothing; finds a small code's box; keeps only the newest frames. |
| `AveragingScanner` / `QrAnalyzer` (zoom logic) | TC-QR-10, TC-QR-11, browser fake-camera test | Auto-zoom reads a code that is 15–30% of the picture; strong shake (8 px per frame) still reads in ~1.7 s. |
| Photo attacks | TC-QR-2, TC-QR-3, TC-QR-7 | No photo, merged photo or burst of 3 ever decodes. |
| `payload.js` / `Payload` | TC-PL-1..4 | Round trip in capitals/digits; foreign and old-format codes rejected; tokens random (70 bits); current + previous token accepted, older not. |
| `classlist.js` / `ClassList` | TC-CL-1..3 | Moodle CSV with BOM, quotes, Hebrew headers; lower-case emails; staff rows; duplicates. |
| `sheet.js` / `AttendanceSheet` | TC-SH-1, TC-SH-2 | One row per student, one column per lecture, ordered by time. |
| `xlsx.js` / `Xlsx` | TC-XL-1, TC-XL-2 | Round trip keeps Hebrew and numbers; numeric XML entities decoded. |
| `prompts.js`, `github.js`, `ai.js`, `gemini.js` | TC-AI-1..7 | Summary prompt in Hebrew; GitHub URLs parsed; README first, build folders skipped; long submissions cut; **peers are anonymous**; summary line extracted; Gemini request shape; the key comes from the store, never typed. |
| `core/faces.js` | TC-FACE-1..9 | Overlap, merging two finders, Gemini box parsing, tiles, tapping, adding a box, ids that never change, claims and steps, size-dependent trust. |
| `worker/src/index.js` | TC-WRK-1..4 | Lecturer only, key added only by the Worker, other sites / students / expired tokens refused, rate limit, page sends a token not a key. |
| `polls.js` (`readPollForm`) | TC-POLL-1 (Java) | 2–6 answers. |
| `i18n.js` | TC-I18N-1 | Hebrew and English have exactly the same keys. |
| `server.py` (rules) | TC-SRV-1..9, 11 | A real scan = in class; fake code / second scan refused; students cannot do lecturer actions; students never see codes, the class list or others' records; one vote while open; only http(s) links; sign-in rules; full HTTP flow; sign-ins survive a restart; the local AI key file is never served to phones. |
| `FirebaseStore` + `firestore.rules` | browser tests against the real project (§5) and the Rules Playground | The same cases as TC-SRV, on Firebase. |

## 4. Results (15 November 2026)

| Suite | Result |
|---|---|
| JS unit + simulation (`npm test`) | **43 / 43 pass** |
| Java core (JUnit) | **19 / 19 pass** (compiled with `-Xlint:all -Werror`) |
| Server rules (`unittest`) | **13 / 13 pass** (TC-SRV-12 old code refused, 13 one student per face, 14 not-in-photo / new photo / free a face) |
| Browser, local server over HTTPS, fake camera | scan without location → in class; second scan → "already"; offline comment sent after the server restarts |
| Browser, demo mode, fake camera, code 15% of the picture, 2× zoom | read in 1.8 s |
| Far reading (simulated 720p camera, auto-zoom) | smallest readable code: **10%** of the picture height (was 15% before the 25×25 code) |
| Strong shake, 8 camera px per frame | 4 / 4 read in ~1.7 s (was 0 / 4 before the wider alignment) |
| Real phones (9 Nov) | reads when close; far away needed zoom → added auto-zoom, zoom buttons, bigger squares |

## 5. How the browser and camera tests work

1. A script draws the flicker code with the real `FlickerSchedule` and writes 5 s of video
   (`.y4m`) at 30 fps: the code in the middle of a dark room, at a chosen size.
2. Chromium starts with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<video>`,
   so the page's camera *is* that video.
3. Playwright signs in a lecturer and students (separate browsers), starts a lecture, reads the
   current token from the server's data, generates the matching video and presses *Start camera*.
4. Checks: the result text, the "physical attendance" box, the server's record, the lecturer's live counter.
5. A "photo" video (one frozen frame) and a "merged photo" video (an average of 30 frames) must never mark.

## 6. Manual checklist for the demo (real devices)

| # | Check | Expected |
|---|---|---|
| 1 | Open the site from the QR on 3 different phones | loads, Hebrew, sign-in works |
| 2 | Lecturer: start lecture → Full screen | code fills the screen, digits of the timer change |
| 3 | Front row scan | marked within 2 s |
| 4 | Back row scan (zoom + if needed) | marked within 5 s |
| 5 | Photograph the screen with the camera app, send it, scan the photo | never marked |
| 6 | Scan twice | "already marked" |
| 7 | Airplane mode → comment → back online | comment arrives |
| 8 | Poll with 3 answers, 5 students vote | live counts, one vote each |
| 9 | Download XLSX | opens in Excel with V marks |
| 10 | Class photo | faces boxed; tap removes / adds; students tap their face; counters update |

## 7. Not covered automatically (and why)

- **Firebase security rules in the emulator:** the emulator downloads from Google servers that our
  build environment blocks; the same rules are covered by TC-SRV on the local server and checked
  in the Firebase console.
- **Android UI classes:** built and run in Android Studio on our PC; the pure-Java core is unit tested.
- **Live Gemini calls:** tested by hand on 25 Nov 2026 through our own modules in a real browser
  (summary 8.6 s, homework review of a real course repository 24 s, audio request accepted); not in the
  automatic suite because they need the private key.
- **Face finding on the lecturer's real class photos** (p1, p11, p31; kept private, not in the repo):
  run through our own `facefind.js` in Chromium with the real MediaPipe model. Results: 30, 42 and 39
  correct boxes with almost no false ones; faces looking down are missed (Gemini + the lecturer's tap).
- **Live on the published site (25 Nov 2026, the team's PC):** the real MediaPipe model from the CDN
  found 43 / 43 faces of `web/test/assets/class-sample.jpg` in 2.7 s; Gemini (`gemini-3.5-flash`) found
  43 / 43 in 12 s and `parseGeminiBoxes` read its answer.
- **Lecturer photo editor (Playwright):** tap adds, tap on a box removes, undo, save, re-edit (both
  the demo photo and a real class photo).
