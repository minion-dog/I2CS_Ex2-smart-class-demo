# Software Requirements Specification (SRS): SmartClass

Version 2.0 · 15 November 2026 · Maor Kron, Noam Yaakov Ohayon

This SRS grows from the team's first SRS (sections 1–8, Google Doc "Softwere Requirements
Specipication Oop Ass2") and section 9 (lecture transcription). Version 2 records the decisions the
team made while testing real phones; §6 lists every change from version 1 and the reason.

## 1. Introduction

### 1.1 Purpose
SmartClass is a teaching tool for a classroom lecture: automatic attendance with a live
spreadsheet, real-time comments, quick polls, an AI lecture summary and an AI homework review.

### 1.2 Scope
A phone-first website for students (no installation), a website for the lecturer, an optional
native Android app, and a free cloud database (Firebase). See the [SoW](02_SOW.md) for what is
in and out of scope.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Session / lecture | One meeting of the class, opened by the lecturer. |
| Flicker code | Our QR code that cannot be photographed (§3.1). |
| Token | A random 14-character value inside the code; replaced every 30 s. |
| Class list / roster | The Moodle participants export (CSV or XLSX). |
| Sheet | The attendance spreadsheet: one row per student, one column per lecture. |
| KISS | Keep It Simple: one question, 2–6 answers, one tap. |

### 1.4 Actors
| Actor | Description |
|---|---|
| Lecturer | Runs the lecture on a laptop connected to the projector. One lecturer account per course. |
| Student | On the class list; uses a phone (website or Android app). |
| Groq (external) | Free AI service: speech to text (Whisper) and a large language model. |
| GitHub (external) | Public repositories that students submit. |

## 2. Overall description

- **Clients:** website (`web/`) for both roles; Android app (`android/`) for both roles.
- **Data:** Firebase Authentication + Cloud Firestore with security rules; no server code (free plan).
- **Offline:** both clients keep a local copy and send changes when the connection returns.
- **Languages:** Hebrew (right to left) by default, English on a switch.
- **Constraints:** free services only; plain HTML/CSS/JS (no framework); Android in Java;
  no Moodle/Zoom integration (sheet guideline); the demo must run in class on real phones.

## 3. Functional requirements

Priority: **M** = must (in the demo), **S** = should, **C** = could.

### 3.1 Attendance (main feature)
| ID | Requirement | Pri |
|---|---|---|
| FR-ATT-1 | The lecturer opens a lecture with one button; the screen shows the flicker code full screen on the projector. | M |
| FR-ATT-2 | The code holds `SC2/<lecture id>/<token>` in capitals and digits (25×25 squares). A new token every **30 s**; the current and the previous token are accepted (up to 60 s). | M |
| FR-ATT-3 | **Flicker code:** every square shows a random colour that changes 30 times a second. Dark squares of the QR keep their colour for 8 phases; light squares and the border change every phase. Every single frame is random and every average is grey, so a photo (also HDR/night mode) shows nothing. | M |
| FR-ATT-4 | The student's scanner films ~0.8 s and builds a **change map** (how much each pixel changes); light squares change, dark squares do not; the map is read as a QR. | M |
| FR-ATT-5 | The scanner finds where the code is in the picture and zooms in on it automatically; the student can zoom with + / − buttons or by pinching (the camera's own zoom when available). | M |
| FR-ATT-6 | A frozen picture held in front of the scanner (a forwarded photo) never marks attendance. | M |
| FR-ATT-7 | **A valid scan marks the student "in class".** Attendance is physical only: no location, no Zoom attendance. | M |
| FR-ATT-8 | One mark per student per lecture; a second scan answers "already marked". | M |
| FR-ATT-9 | The lecturer sees the list and the counter update live and can add or remove a student by hand ("manual"). | M |
| FR-ATT-10 | **Sheet:** the lecturer sees one row per student and one column per lecture (V = in class, M = manual) and downloads it as **XLSX** (works offline). | M |
| FR-ATT-11 | **Head count:** the lecturer uploads a photo of the class; the system counts people (COCO-SSD) and compares with the in-class scans; more scans than people raises a warning; the lecturer can correct the count. | S |

### 3.2 Sign-in and class list
| ID | Requirement | Pri |
|---|---|---|
| FR-AUTH-1 | The lecturer signs in with a dedicated account (email + password); a `staff/{uid}` document marks the account as lecturer. | M |
| FR-AUTH-2 | Students sign in with Google, using the email that appears on the class list; anyone else is refused. | M |
| FR-AUTH-3 | The lecturer imports the Moodle participants file (CSV or XLSX, Hebrew headers); staff rows (no group) are not students. | M |
| FR-AUTH-4 | The lecturer can add or remove students by importing an updated list. | S |

### 3.3 Comments
| ID | Requirement | Pri |
|---|---|---|
| FR-COM-1 | Students write comments during a lecture; the lecturer sees them live. | M |
| FR-COM-2 | Each comment is **public** (everyone) or **private** (lecturer only). | M |
| FR-COM-3 | Each comment is **anonymous** or shows the student's name. | M |
| FR-COM-4 | Comments can be written on past lectures too. | S |
| FR-COM-5 | The lecturer can write comments. | S |
| FR-COM-6 | Offline comments are saved on the phone and sent later. | M |

### 3.4 Polls
| ID | Requirement | Pri |
|---|---|---|
| FR-POLL-1 | The lecturer creates a poll on the spot: one question, 2–6 answers. | M |
| FR-POLL-2 | Students vote once per poll, while it is open. | M |
| FR-POLL-3 | The lecturer sees results live and closes the poll. | M |

### 3.5 Lecture recording and AI summary
| ID | Requirement | Pri |
|---|---|---|
| FR-SUM-1 | The lecturer records the lecture in the browser (sent in pieces) or uploads a recording (Zoom, Meet, Classroom). | S |
| FR-SUM-2 | Each piece is transcribed in Hebrew (Whisper, Groq) and stored with the lecture. | S |
| FR-SUM-3 | One click produces a structured summary (topics, key points, questions to review) in the UI language; students can read it. | S |

### 3.6 Homework and AI review
| ID | Requirement | Pri |
|---|---|---|
| FR-HW-1 | The lecturer creates an assignment: title, requirements, due date. | S |
| FR-HW-2 | Students submit a GitHub link and/or text files (≤ 500 KB in total). Only http(s) links are accepted. | S |
| FR-HW-3 | The AI review checks the requirements, lists what is missing and **compares the submission with the other submissions** (anonymous summaries only). | S |
| FR-HW-4 | The lecturer edits the review, gives a grade and feedback; the student sees them. | S |

### 3.7 General
| ID | Requirement | Pri |
|---|---|---|
| FR-GEN-1 | Hebrew UI (right to left) with an English switch on every page. | M |
| FR-GEN-2 | Offline: scans, comments, votes and submissions wait on the device and are sent automatically; the page shows "waiting to send". | M |
| FR-GEN-3 | In-app notifications while the app is open (new poll, new grade). | C |

## 4. Non-functional requirements

| ID | Requirement | How it is checked |
|---|---|---|
| NFR-1 Security | Students can never read the codes, the class list or other students' records; they can write only their own records, once, with a real token. | `firestore.rules`; server tests TC-SRV-2..4 |
| NFR-2 Anti-forwarding | No photo, merged photo (3–90 frames) or normal QR reader can read the code. | TC-QR-2, -3, -4, -7, -8 |
| NFR-3 Speed | A scan reads within 2 s steady, within 3 s from far or with strong shake. | TC-QR-5, -6, -10, -11 |
| NFR-4 Range | Readable when the code is 10% of the camera picture height (without camera zoom). | far-scan experiment, TC-QR-10 |
| NFR-5 Usability | KISS: a student marks attendance with two taps; works at 360 px width. | browser tests at 390 px |
| NFR-6 Privacy | The Groq key stays on the lecturer's device; AI never sees other students' names. | code review; TC-AI-5 |
| NFR-7 Cost | Free plans only (Firebase Spark, Groq free tier, GitHub Pages). | SoW |
| NFR-8 Portability | Any modern phone browser; Android 8+ for the app. | real-phone test |
| NFR-9 Maintainability | Same algorithms and test names in JS and Java; one data interface (Strategy) for three stores. | class diagrams; tests |

## 5. Data model (Cloud Firestore)

```
staff/{uid}                         lecturer accounts
roster/{email}                      class list: first, last, group, staff
users/{uid}                         email, name, role
sessions/{sid}                      title, startedAt, endedAt, summary, headcount
  codes/{token}                     createdAt              (hidden from students)
  attendance/{email}                email, uid, name, status, token, scannedAt
  comments/{cid}                    text, visibility, authorUid, authorName|null, fromLecturer, createdAt
  polls/{pid}                       question, options[], open, createdAt
    votes/{uid}                     option
  transcript/{index}                index, text
assignments/{aid}                   title, requirements, due
  submissions/{email}               repoUrl, files[], review, grade, feedback
```

## 6. Changes from SRS version 1 (and why)

| v1 said | v2 says | Reason (team decision) |
|---|---|---|
| Sessions start automatically by the timetable, with a notification | The lecturer opens the lecture with one button | No timetable integration is allowed (no Moodle); one tap is simpler and always right. |
| Students log in with university email | Google sign-in with the email on the class list | The Moodle list holds the students' Gmail addresses. |
| Website login only for the lecturer; students use a mobile app | Students use the website too; the Android app is optional | The sheet asks for a web-based smartphone app (KISS). |
| Location within ~500 m = present, otherwise Zoom | **No location; a valid scan = in class; no Zoom attendance** | Real-phone tests: Zoom's video loses the flicker, and any number shown for Zoom can be forwarded by WhatsApp. Only someone in the room can film the live code, so location adds nothing. |
| — | The flicker code (§3.1) | A normal QR was photographed and forwarded in our own test. |
| Push notifications on the phone | In-app notifications while open | Push needs server functions (paid plan). |
| — | Head count from a class photo, attendance sheet, class-list import | Features of the Ex2 sheet that v1 did not cover. |

## 7. Traceability to the Ex2 sheet

| Ex2 feature | Requirements |
|---|---|
| Automatic attendance + evaluation (photo count) + online/offline spreadsheet | FR-ATT-1..11 |
| Comments and suggestions, real time / offline | FR-COM-1..6, FR-GEN-2 |
| On-the-spot KISS polls | FR-POLL-1..3 |
| ML summary of the class video | FR-SUM-1..3 |
| Deep LLM review of homework with comparison to other students | FR-HW-1..4 |
| Works in this class, real demo; simple smartphone web app | NFR-5, NFR-8; [demo script](10_DEMO_SCRIPT.md) |
