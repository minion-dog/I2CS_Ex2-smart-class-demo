# Technical tools report

Every tool we suggest was tried for real, not only read about. "Result" says what we saw.

## 1. Tools we use

| Area | Tool (version) | Why | How we tested it | Result |
|---|---|---|---|---|
| Hosting | **GitHub Pages** | Free HTTPS hosting; a phone needs HTTPS for the camera | Published the website; opened it on our phones from a QR | Works on Android and iPhone; updates live ~1 min after a push |
| Database + login | **Firebase Auth + Cloud Firestore** (Spark, free) | Live updates, offline cache on the phone, security rules instead of a server | Project `oop-ex2` (setup steps in `docs/SETUP_HE.md`); before that, the same rules on our local server (TC-SRV) | See §3 |
| QR drawing | **qrcode-generator 1.4.4** (MIT) | Small, no dependencies, gives the module matrix we animate | Unit tests TC-QR-1; drew 25×25 codes in alphanumeric mode | Correct codes; level Q, alphanumeric mode works |
| QR reading (web) | **jsQR 1.4.0** (Apache-2.0) | Pure JS, reads a grey image we build ourselves | Simulation (TC-QR-5..11); browser fake camera; real phones | Reads our change map; weaker than ZXing on noisy input, fixed by stretch + blur + Otsu |
| QR reading (Android) | **ZXing core** | Standard Java QR reader | Encoder used in `QrNoiseView`; reader in `QrAnalyzer` | Same pipeline as the web |
| Camera (Android) | **CameraX** (`ImageAnalysis`, `CameraControl.setZoomRatio`) | Steady frame stream; the camera's own zoom | In Android Studio on our PC | First builds failed (AGP 8.9 needs a newer Android Studio); moved to AGP 8.7.3; final build on our PC is on the demo checklist |
| Attack check | **zxing-cpp** and **OpenCV** (Python) | Strong, standard QR readers to attack our code | 150 live frames, single and merged photos | 0 / 150 frames read; no photo read |
| Local test server | **Python 3 standard library** (`http.server`, `ssl`) | Test on real phones over Wi-Fi before Firebase; no packages | `server/test_server.py`; browser over HTTPS | 9 / 9 tests; works with a self-signed demo certificate |
| LLM + speech to text | **Google Gemini `gemini-3.5-flash`** (free tier) | Hebrew, long context, takes audio directly; the team found it easier to set up than Groq | **Live, 25 Nov 2026, with our key, through our own code in a browser:** summary of a Hebrew lecture transcript in 8.6 s (structured, in Hebrew); homework review of a real course repository (25 files read from GitHub, requirements table + comparison) in 24 s; an audio request accepted in 2.3 s | Works. `gemini-2.5-flash` answered 404 "no longer available to new users", so we use 3.5 |
| Head count | **TensorFlow.js 4.22 + COCO-SSD 2.2.3** (jsDelivr) | Runs in the browser, no server, detects "person" | Counting logic unit tested (TC-HC-1..2) | Live run on the course's class photos: demo checklist |
| Tests | **Node `node:test`**, **JUnit 4**, **Python `unittest`**, **Playwright + Chromium fake camera** | No extra packages; real browser with a scripted camera | See the testing strategy | All green |
| Diagrams | **Mermaid** | Text diagrams that GitHub draws | Every diagram rendered with `mmdc` | All render |

## 2. Tools we tried and did not choose

| Option | What we tried | Why not |
|---|---|---|
| A normal QR that changes every few seconds | Our first idea; tested with a phone | A photo or a screenshot forwarded within seconds still works. |
| "Noise" QR v1 (each square wrong 3 of 10 times, average = QR) | Built and tested on a real phone | Phones merge several frames (HDR / night mode), so a photo **was** readable, and scanning was slow. Replaced by the flicker code (every average is grey). |
| Location (GPS) to decide "in class" vs. "Zoom" | Built (1 km radius) and tested | Not needed once only a live scan works; adds a permission and can be faked. |
| A code for Zoom students (4 digits under the QR) | Built and tested | Can be forwarded by WhatsApp; Zoom's video loses the flicker. Decision: physical attendance only. |
| Zoom participants report | Designed | Out of scope (no Zoom integration, per the sheet). |
| Firebase Storage for homework files | Checked the plans | Needs a paid plan; text files are stored in Firestore (≤ 500 KB). |
| **Groq** (Whisper + `gpt-oss-120b`) | Built and unit tested first | Replaced by Gemini: one free provider for both jobs, easier to set up, and the key can be stored in Firestore for the lecturer only. |
| A key field in Settings | Built first | The lecturer should not need to know what an API key is ("works as you get it"); the key is now built in (Firestore, lecturer-only). |
| Cloud Functions / push notifications | Checked the plans | Paid plan; in-app notifications instead. |
| A framework (React, Kotlin) | Considered | We did not learn them; plain JS and Java keep it KISS. |
| PowerShell web server for the demo | Built (`Start Demo.bat`) | Works on the PC only; phones need HTTPS on the network → the Python server or GitHub Pages. |

## 3. Notes from the live tests

- **Real phones (9 Nov):** the flicker code is unreadable by the phone's camera app (only blur),
  and our scanner reads it. From far away the code was too small → we added auto-zoom, zoom
  buttons, pinch, and made the squares 1.6× bigger (25×25 code). At high zoom the hand shake made
  the map smear → the alignment now searches ±12 px (coarse to fine).
- **Through Zoom (9 Nov):** a phone at home could not read the code from the Zoom stream at all
  (expected: Zoom drops frames and smooths detail). This confirmed the physical-only decision.
- **GitHub Pages on phones:** opens from a printed/displayed QR, camera permission works over HTTPS.
- **Firebase:** project `oop-ex2` created on 15 Nov; the end-to-end check with two phones is in the demo checklist.
