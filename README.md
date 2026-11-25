# SmartClass: a teaching tool for the classroom (Intro2SE Ex2)

**Team:** Maor Kron (214790719), Noam Yaakov Ohayon (214793739) · Ariel University · Introduction to Software Engineering (OOP, OOD) · Ex2 "Vibe Coding & Deep Designing"

**Live site (demo mode):** https://minion-dog.github.io/I2CS_Ex2-smart-class-demo/ · **Repository:** https://github.com/minion-dog/I2CS_Ex2-smart-class-demo

> The live site runs in **demo mode** for now: no accounts, *Load a sample class*, then enter as lecturer or student. Data stays in each browser, so the lecturer and the students are tabs of the same browser (or the local server for real phones). The Firebase version is ready in the code (`web/js/firebase-config.js` + `firestore.rules`); setup steps in [docs/SETUP_HE.md](docs/SETUP_HE.md).

## The problem

Today's tools for teaching in class are scattered and easy to cheat: attendance by a QR code is
photographed and forwarded to friends at home, questions are lost in WhatsApp, polls need another
site, and lecture recordings and homework get no quick feedback. We want **one simple,
LLM-ready tool** that a lecturer and a class of students can use on their phones in the lecture.

## Scope

| In scope | Out of scope (sheet guidelines) |
|---|---|
| Phone-first website for students and the lecturer (no install), optional Android app | Integration with Moodle, Zoom or personal-information systems |
| Automatic, photo-proof **physical attendance** + live/offline **attendance spreadsheet** (main feature) | Attendance for students on Zoom (team decision, see SRS §6) |
| Head count from a class photo, compared with the scans | Push notifications when the app is closed (paid plan) |
| Real-time / offline comments (public or private, anonymous or named) | Paid services of any kind |
| On-the-spot KISS polls with live results | |
| AI lecture summary (Hebrew transcription) | |
| AI homework review that compares each student with the class | |

## Features

| Feature (Ex2 sheet) | Lecturer | Student | Where in the code |
|---|---|---|---|
| ⭐ Automatic attendance (flicker QR, physical only) + the attendance **spreadsheet** (live + XLSX) | show code, live list, sheet | scan | `web/js/core/noisyqr.js`, `payload.js`, `sheet.js`, `xlsx.js` · Android `core/` |
| Attendance check by a class photo (automatic head count) | ✓ | — | `web/js/ai/headcount.js` |
| Comments in real time / offline | ✓ | ✓ | `web/js/ui/comments.js` |
| KISS polls with live results | create, close | vote once | `web/js/ui/polls.js` |
| ML summary of the lecture recording | record / upload, summarise | read | `web/js/ui/recorder.js`, `web/js/ai/ai.js`, `gemini.js` |
| Deep LLM review of homework, compared with the other students | review, grade | submit, see result | `web/js/ai/prompts.js`, `github.js` |
| Class list import (Moodle CSV/XLSX), Hebrew UI with English switch | ✓ | ✓ | `web/js/core/classlist.js`, `web/js/ui/i18n.js` |

## The idea: a QR code you can't photograph

Every square of our code shows a random colour, 30 times a second. A **dark** square of the QR
keeps its colour for 8 phases; a **light** square changes every phase. So **every frame is random
dots and every average is plain grey**: a photo (even an HDR/night-mode merge) shows nothing. Our
scanner films ~0.8 s and measures **how much each pixel changes**: that "change map" is the QR.
It finds the code in the picture, zooms in on it, and lines up the frames against hand shake.
Because only someone **in the room** can film it live, a valid scan means *in class*; no location
is needed.

| Measured | Result |
|---|---|
| A single photo; a merged photo of 3–90 frames; a burst of 3 | never readable |
| Standard QR readers (ZXing, OpenCV) on 150 live frames | 0 / 150 |
| Our scanner, steady or shaking | reads in under 2 s |
| Far away (simulated 720p camera, auto-zoom) | readable at 10% of the picture height |
| Through a Zoom stream (real test) | not readable |

## Documents (the Ex2 to-do list)

| # | Task | Document |
|---|---|---|
| 1 | Repository, problem and scope | this README |
| 3 | Technical tools report (tested in real life) | [docs/01_TOOLS_REPORT.md](docs/01_TOOLS_REPORT.md) |
| 4 | Statement of Work | [docs/02_SOW.md](docs/02_SOW.md) |
| 5 | Software Requirements Specification | [docs/03_SRS.md](docs/03_SRS.md) |
| 6 | Main use cases (client stories) | [docs/04_USE_CASES.md](docs/04_USE_CASES.md) |
| 7 | Main software components | [docs/05_COMPONENTS.md](docs/05_COMPONENTS.md) |
| 8 | Class diagrams and sequence diagrams | [docs/06_CLASS_DIAGRAMS.md](docs/06_CLASS_DIAGRAMS.md), [docs/07_SEQUENCE_DIAGRAMS.md](docs/07_SEQUENCE_DIAGRAMS.md) |
| 9 | Testing strategy | [docs/08_TESTING_STRATEGY.md](docs/08_TESTING_STRATEGY.md) |
| 10 | Demo web application | `web/` (live link above), `android/`, `server/` |
| 11 | Demo in class | [docs/10_DEMO_SCRIPT.md](docs/10_DEMO_SCRIPT.md) |
| 12 | Conclusion | [docs/09_CONCLUSION.md](docs/09_CONCLUSION.md) |
| — | AI usage log | [docs/AI_USAGE.md](docs/AI_USAGE.md) |
| — | Setup guide (Hebrew) | [docs/SETUP_HE.md](docs/SETUP_HE.md) |

## How it works

```
 lecturer website ──┐                          ┌── student website (phone)
 lecturer app ──────┼──►  Firebase Auth   ◄────┼── student Android app
                    └──►  Firestore + rules ◄──┘
                              ▲
   Gemini (speech + LLM) ◄────┴── called only from the lecturer's device; the built-in key is
                                  read from Firestore (lecturer only), never typed, never on GitHub
```

- **Free Firebase plan, no server code.** [`firestore.rules`](firestore.rules) is the server: a
  student marks only themselves, only once, only with a real code of that lecture; codes, the class
  list and other students' records are hidden.
- **Offline:** scans, comments, votes and submissions are saved on the phone and sent later.
- **One data interface, three implementations (Strategy):** Firebase; a local Python server for
  testing on real phones (`?lan=1`); an in-browser demo (`?demo=1`).
- **Same algorithms in JS and Java,** with the same test names.

## Run it

1. **Online demo:** open the live site → *Load a sample class* → enter as lecturer or student
   (two tabs). Data stays in that browser.
2. **With Firebase** (after the setup in `docs/SETUP_HE.md`): students sign in with Google (the
   email on the class list) and the lecturer with the lecturer account.
3. **On your own Wi-Fi (real phones, no Firebase):** Windows: double-click `Start LAN Server.bat`
   (needs Python 3); phones scan the "join" QR on the PC. Others: `python3 server/server.py`.
4. **Android:** open `android/` in Android Studio, add `google-services.json`, Run.

Details: [docs/SETUP_HE.md](docs/SETUP_HE.md).

## Tests

| Suite | Command | Result |
|---|---|---|
| Web logic + camera simulation + photo attacks | `cd web && npm test` | 31 / 31 |
| Android pure-Java core | `cd android && ./gradlew test` | 18 / 18 |
| Rules of the local server | `python -m unittest server/test_server.py` | 9 / 9 |
| Browser, fake camera, both roles | Playwright | see [testing strategy](docs/08_TESTING_STRATEGY.md) |

## Repository map

```
web/          the website (plain HTML/CSS/JS): js/core (logic), js/data (stores), js/ui (pages), js/ai, vendor, test
android/      native Java app (Android Studio): core, data, ai, ui
server/       local test server (Python standard library) + tests
docs/         all Ex2 documents, setup guide, AI usage log
firestore.rules, firebase.json
```

## Honest limitations

- A student in the room could film the code and replay it live for a friend within 60 s; the head
  count from a class photo catches extra marks.
- The Android app is built in Android Studio; our cloud build environment could not reach Google's
  servers, so only its pure-Java core is tested automatically.
- AI uses Google Gemini (free tier). The key is built in but private: it lives in Firestore
  (`config/ai`, readable only by the lecturer) or, on our own PC, in an untracked local file. A
  key written into public website code could be read by anyone, so the public demo site has no AI.
- No push notifications on the free plan (in-app only, while open). Homework files: text only, ≤ 500 KB.
