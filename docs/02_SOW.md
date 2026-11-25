# Statement of Work (SoW): SmartClass

**Course:** Introduction to Software Engineering (OOP, OOD), Ariel University · **Assignment:** Ex2, "Vibe Coding & Deep Designing: Web-based Teaching Tool"
**Team:** Maor Kron (214790719), Noam Yaakov Ohayon (214793739) · **Deadline:** 25 November 2026 (demo in class)

## 1. Background

Lecturers at Ariel University use several separate tools to run a lecture: Moodle for the class list,
paper or Google Forms for attendance, Zoom for recordings, WhatsApp for questions and separate
forms for polls. None of them gives the lecturer one view of the class, and attendance is easy to
fake (a photographed QR code is forwarded to friends at home).

## 2. Objectives

1. Make attendance automatic for students in the room and impossible to forward by photo.
2. Give the lecturer a live and downloadable **attendance spreadsheet** (the main feature).
3. Let students comment and ask questions in real time, also offline.
4. Let the lecturer run quick (KISS) polls.
5. Produce an AI summary of a recorded lecture (Hebrew).
6. Give an AI review of homework that compares each submission with the other students' work.
7. Let the lecturer check attendance against a photo of the class (automatic head count).

## 3. Scope

### In scope
| Item | Description |
|---|---|
| Student web app | Phone-first website (no install): scan, comments, polls, homework, own attendance. |
| Lecturer web app | Website: class list import, live lecture (flicker QR, live attendance, comments, polls, recording and summary, head count), spreadsheet, homework review. |
| Android app | Native Java app with the same features for students and lecturers (an extra, not required by the sheet). |
| Data | Firebase Auth + Firestore (free plan) with security rules; a local Python server and an in-browser demo store for testing without Firebase. |
| AI | Google Gemini (free tier): Hebrew transcription, summaries and reviews, with a built-in key the lecturer never types; TensorFlow.js COCO-SSD for the head count. |
| Documents | README, tools report, SoW, SRS, use cases, components, class and sequence diagrams, testing strategy, conclusion, AI usage log. |
| Demo | A 10-minute live demo in class on real phones. |

### Out of scope (per the sheet's guidelines)
- Integration with Moodle, Zoom, or the university's personal-information systems (the class list is imported from the Moodle export file).
- Attendance for students on Zoom (decision in §7).
- Push notifications when the app is closed (needs a paid server plan).
- Paid services of any kind.

## 4. Deliverables

| # | Deliverable | Where |
|---|---|---|
| D1 | Repository with problem definition and scope | `README.md` |
| D2 | Technical tools report, tested in real life | [`docs/01_TOOLS_REPORT.md`](01_TOOLS_REPORT.md) |
| D3 | Statement of Work | this file |
| D4 | Software Requirements Specification | [`docs/03_SRS.md`](03_SRS.md) |
| D5 | Main use cases (client stories) | [`docs/04_USE_CASES.md`](04_USE_CASES.md) |
| D6 | Main software components | [`docs/05_COMPONENTS.md`](05_COMPONENTS.md) |
| D7 | Class and sequence diagrams | [`docs/06_CLASS_DIAGRAMS.md`](06_CLASS_DIAGRAMS.md), [`docs/07_SEQUENCE_DIAGRAMS.md`](07_SEQUENCE_DIAGRAMS.md) |
| D8 | Testing strategy | [`docs/08_TESTING_STRATEGY.md`](08_TESTING_STRATEGY.md) |
| D9 | Demo web application (KISS) | `web/` (live on GitHub Pages), `android/`, `server/` |
| D10 | Demo in class | [`docs/10_DEMO_SCRIPT.md`](10_DEMO_SCRIPT.md) |
| D11 | Conclusion | [`docs/09_CONCLUSION.md`](09_CONCLUSION.md) |

## 5. Milestones

| Date | Milestone | Status |
|---|---|---|
| 8 Nov 2026 | SRS draft (sections 1–9) by the team; design decisions settled | Done |
| 8 Nov 2026 | First working website (demo store) + Android project | Done |
| 9 Nov 2026 | Real-phone test; QR redesigned (flicker code); local test server | Done |
| 9 Nov 2026 | Website on GitHub Pages; physical-only attendance decided | Done |
| 15 Nov 2026 | Far reading (bigger squares, zoom, shake); location removed; all documents | Done |
| 15–20 Nov 2026 | Firebase project connected; real cross-device test with the team | In progress |
| 20–24 Nov 2026 | Rehearse the demo in a classroom; final fixes | Planned |
| 25 Nov 2026 | Submission (form + repository) and demo in class | Planned |

## 6. Roles

| Person | Responsibilities |
|---|---|
| Maor Kron | Design decisions, QR attendance design and real-phone testing, GitHub and Firebase setup, demo. |
| Noam Yaakov Ohayon | SRS sections 1–8, requirements review, submission form, demo. |
| Claude (AI assistant) | Implementation and documents under the team's decisions; every AI step is logged in [`docs/AI_USAGE.md`](AI_USAGE.md). |

## 7. Key decisions (made by the team)

| Decision | Reason |
|---|---|
| A QR code that cannot be photographed (flicker code) | A normal QR is photographed and forwarded; ours is readable only by filming it live. |
| Code changes every 30 s; current + previous accepted | 15 s was too short last year when the phone asked to sign in again. |
| **Attendance is physical only; no location** | Only someone in the room can film the live code; Zoom's video loses the flicker, and any on-screen number can be forwarded by WhatsApp. Location added nothing and asked for a permission. |
| Plain HTML/CSS/JS, no framework; Android in Java | What we learned; KISS. |
| Hebrew UI with an English switch | Our class is Hebrew speaking. |
| Free Firebase (Spark), no server code | No cost; the security rules do the checks. |
| Gemini free tier for AI; the key is built in (Firestore, lecturer-only), never typed by the lecturer, never on GitHub | No cost; works "as you get it" for lecturers who know nothing about API keys; students can never read the key. |

## 8. Acceptance criteria

1. A student in the room marks attendance with one scan in under 5 seconds; a photo of the code never marks anyone.
2. The lecturer sees attendance live and downloads it as an XLSX spreadsheet.
3. Comments, polls, summary and homework review work in the demo.
4. The website runs on any phone browser without installation.
5. Every document in §4 exists in the repository.

## 9. Assumptions and risks

| Risk | Mitigation |
|---|---|
| Real cameras differ from the simulation | Tested on real phones; zoom buttons, auto-zoom, and a "what the scanner sees" preview. |
| Classroom projector too small from the back row | Bigger squares (25×25 code), full-screen code, camera zoom. |
| A student films the code and replays it live for a friend | Possible within 60 s; the head count against a class photo catches extra marks. |
| Free-plan limits (Firestore, Gemini) | A 40-student class is far below the limits. |
| The Android app could not be built in our cloud environment | It is built in Android Studio on our PC; the website is the main client. |
