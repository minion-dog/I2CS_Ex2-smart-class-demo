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
| Token | A random 14-character value inside the code; replaced every 5 s. |
| Face box | A rectangle on one face in the class photo, with a number that never changes. |
| Class list / roster | The Moodle participants export (CSV or XLSX). |
| Sheet | The attendance spreadsheet: one row per student, one column per lecture. |
| KISS | Keep It Simple: one question, 2–6 answers, one tap. |

### 1.4 Actors
| Actor | Description |
|---|---|
| Lecturer | Runs the lecture on a laptop connected to the projector. One lecturer account per course. |
| Student | On the class list; uses a phone (website or Android app). |
| Gemini (external) | Google's free AI service: speech to text and a large language model. |
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
| FR-ATT-2 | The code holds `SC2/<lecture id>/<token>` in capitals and digits (25×25 squares). A new token every **5 s**; the current and the previous token are accepted (about 10 s, checked with the server's clock). | M |
| FR-ATT-3 | **Flicker code:** every square shows a random colour that changes 30 times a second. Dark squares of the QR keep their colour for 8 phases; light squares and the border change every phase. Every single frame is random and every average is grey, so a photo (also HDR/night mode) shows nothing. | M |
| FR-ATT-4 | The student's scanner films ~0.8 s and builds a **change map** (how much each pixel changes); light squares change, dark squares do not; the map is read as a QR. | M |
| FR-ATT-5 | The scanner finds where the code is in the picture and zooms in on it automatically; the student can zoom with + / − buttons or by pinching (the camera's own zoom when available). | M |
| FR-ATT-6 | A frozen picture held in front of the scanner (a forwarded photo) never marks attendance. | M |
| FR-ATT-7 | **A valid scan marks the student "in class".** Attendance is physical only: no location, no Zoom attendance. | M |
| FR-ATT-8 | One mark per student per lecture; a second scan answers "already marked". | M |
| FR-ATT-9 | The lecturer sees the list and the counter update live and can add or remove a student by hand ("manual"). | M |
| FR-ATT-10 | **Sheet:** the lecturer sees one row per student and one column per lecture (V = in class, M = manual) and downloads it as **XLSX** (works offline). | M |
| FR-ATT-11 | **Class photo:** the lecturer takes one photo; the system puts a box on every face (MediaPipe in the browser + Gemini) and shows the count above the photo. | M |
| FR-ATT-12 | The lecturer fixes the boxes: tap a box = remove, tap a face without a box = add (sized like its neighbours), undo, retake; zoom with + / − or two fingers. | M |
| FR-ATT-13 | After scanning (or being marked by hand), the student sees the photo, taps their own face, sees it enlarged ("is this you?") and confirms. One student per face: faces chosen by others have a **green** frame and cannot be chosen; mine is green and says "me". A student may **change** his choice: he is warned that the old one will be removed, then the old face is freed (shown dashed for a few seconds) and the new one is his. | M |
| FR-ATT-14 | "I can't find myself" tells the lecturer at once (a list on the lecturer's screen); the student may still choose later. | M |
| FR-ATT-16 | **No box on me** (face hidden, or cut off at the photo's edge): the student taps where he sits; the lecturer's page sends that part of the photo to **Gemini**, which says whether a person is there. Yes → the box is added and given to the student; no (or no AI) → the lecturer approves or rejects with one tap. | S |
| FR-ATT-17 | **Scanning guide** (like Google Lens): as soon as the camera sees the code flicker, a box lights up around it with a hint: "point at the flickering code" → "found it, move closer" (orange, code too small) → "found it, hold still" (yellow) → "reading…" (green) → "✓ read". Helps students who do not know what to point at. | S |
| FR-ATT-15 | The lecturer sees confirmed / waiting / not-in-photo counters and names on the faces, can free a face chosen by mistake, and is warned when there are more scans than faces. A new photo asks everyone again. | S |

### 3.2 Sign-in and class list
| ID | Requirement | Pri |
|---|---|---|
| FR-AUTH-1 | The lecturer signs in with a dedicated account (email + password); a `staff/{uid}` document marks the account as lecturer. | M |
| FR-AUTH-2 | Students sign in with Google, using the email that appears on the class list; anyone else is refused. | M |
| FR-AUTH-3 | The lecturer imports the Moodle participants file (CSV or XLSX, Hebrew headers); staff rows (no group) are not students. | M |
| FR-AUTH-4 | The lecturer can add or remove students by importing an updated list, **or one by one by hand** (from our first SRS). | S |
| FR-SES-1 | **Lectures open by themselves** at the weekly times the lecturer types once (up to 5 minutes early), while the lecturer's page is open on the classroom computer (from our first SRS). | S |
| FR-SES-2 | Students' phones show **"the lecture started"** when a lecture opens. | S |

### 3.3 Comments
| ID | Requirement | Pri |
|---|---|---|
| FR-COM-1 | Students write comments during a lecture; the lecturer sees them live. | M |
| FR-COM-2 | Each comment is **public** (everyone) or **private** (lecturer only). | M |
| FR-COM-3 | Each comment is **anonymous** or shows the student's name. | M |
| FR-COM-4 | Comments can be written on past lectures too. | S |
| FR-COM-5 | The lecturer can write comments. | S |
| FR-COM-6 | Offline comments are saved on the phone and sent later. | M |
| FR-COM-7 | **Emoji reactions** on public comments (👍 "me too", ❤️, 😂, 😮, 🤔): a student may pick several on a comment, each once, and tap again to take it back. Everyone, the lecturer too, sees how many of each, never who. Private comments have no reactions. | C |

### 3.4 Polls & quizzes (one feature)
Decision (ours, 25 Nov 2026): the sheet asks for *on-the-spot (KISS) polls*; the lecturer also talked
about something interactive like Kahoot. One feature with two switches covers both: a **correct answer
is optional** (none = a poll) and the **time is optional**.

| ID | Requirement | Pri |
|---|---|---|
| FR-POLL-1 | **KISS poll:** the lecturer types a question and 2–6 answers and presses *Ask now*; it opens straight on every phone and on the projector. No correct answer, no time limit by default. | M |
| FR-POLL-2 | Students answer once per question, while it is open; a question without a time limit stays open until the lecturer closes it. | M |
| FR-POLL-3 | The lecturer sees the bars (count and %) live and closes it; phones then show the results with *mine* marked. | M |
| FR-QZ-1 | Optional per question: mark a **correct answer**, and a **time**: none, ⚡ 10/20/30/60 s (speed), or a deadline of 2/5/10 minutes. Several questions in a row; *save for later* or *ask now*. **Gemini can write the questions** from the lecture transcript or a topic. | S |
| FR-QZ-2 | The projector shows a lobby (when there is more than one question or a correct answer), each question with the timer if any and the answer count; a timed question ends by itself when time is up or everyone answered. | S |
| FR-QZ-3 | Phones open it by themselves with big coloured buttons (shapes for colour-blind students); the student can close it and reopen it from the Lecture tab. | S |
| FR-QZ-4 | With correct answers: 500–1000 points (faster = more when timed, 1000 when not), right / wrong and the points on the phone, the top 5 after each question, a podium at the end. Without: no points, only the bars. | S |
| FR-QZ-5 | The correct answers are kept in a lecturer-only document until each is revealed; answers are timed with the server's clock. | M |

### 3.5 Lecture recording and AI summary
| ID | Requirement | Pri |
|---|---|---|
| FR-SUM-1 | The lecturer records the lecture in the browser (sent in pieces) or uploads a recording (Zoom, Meet, Classroom). | S |
| FR-SUM-2 | Each piece is transcribed in Hebrew (Gemini) and stored with the lecture. | S |
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
| FR-GEN-2 | Offline: scans, comments, poll answers and submissions wait on the device and are sent automatically; the page shows "waiting to send". | M |
| FR-GEN-3 | In-app notifications while the app is open (new poll or quiz question, new grade, lecture started, class photo up). | C |
| FR-GEN-4 | **Everything as one ZIP** (our idea in the first SRS): one folder per lecture (attendance, comments, polls, quiz results, transcript, summary, class photo with names) and per assignment (requirements, grades, each student's link, files, AI review, feedback), plus the class list and the attendance XLSX. | S |

## 4. Non-functional requirements

| ID | Requirement | How it is checked |
|---|---|---|
| NFR-1 Security | Students can never read the codes, the class list or other students' records; they can write only their own records, once, with a real token. | `firestore.rules`; server tests TC-SRV-2..4 |
| NFR-2 Anti-forwarding | No photo, merged photo (3–90 frames) or normal QR reader can read the code. | TC-QR-2, -3, -4, -7, -8 |
| NFR-3 Speed | A scan reads within 2 s steady, within 3 s from far or with strong shake. | TC-QR-5, -6, -10, -11 |
| NFR-4 Range | Readable when the code is 10% of the camera picture height (without camera zoom). | far-scan experiment, TC-QR-10 |
| NFR-5 Usability | KISS: a student marks attendance with two taps; works at 360 px width. | browser tests at 390 px |
| NFR-6 Privacy | The AI key is built in but private: stored in Firestore `config/ai`, readable only by the lecturer, never typed, never on GitHub; AI never sees other students' names. | rules; TC-AI-5, TC-AI-7, TC-SRV-11 |
| NFR-7 Cost | Free plans only (Firebase Spark, Gemini free tier, GitHub Pages). | SoW |
| NFR-8 Portability | Any modern phone browser; Android 8+ for the app. | real-phone test |
| NFR-9 Maintainability | Same algorithms and test names in JS and Java; one data interface (Strategy) for three stores. | class diagrams; tests |

## 5. Data model (Cloud Firestore)

```
staff/{uid}                         lecturer accounts
roster/{email}                      class list: first, last, group, staff
users/{uid}                         email, name, role
sessions/{sid}                      title, startedAt, endedAt, summary, headcount
sessions/{sid}/photo/main           v, image (JPEG data URL < 1 MB), boxes[{id,x,y,w,h}], aspect
sessions/{sid}/claims/{v_box}       uid, v          (created once = one student per face)
sessions/{sid}/requests/{email}     v, box, status pending|ok|no, reason, faceId   ("no box on me")
sessions/{sid}/quizzes/{qid}        polls & quizzes: title, questions[{q, options (2-6), seconds (0 = no limit)}], state{phase, index, startedAt, correct, starts, top, scores, counts, scored}
  secret/key                        key[]           (lecturer only; -1 = no correct answer = poll)
  answers/{uid_index}               uid, name, index, option, at (server time)
config/schedule                     slots[{day, start, end, title}]   (lecturer only)
  codes/{token}                     createdAt              (hidden from students)
  attendance/{email}                email, uid, name, status, token, scannedAt
  comments/{cid}                    text, visibility, authorUid, authorName|null, fromLecturer, createdAt
  transcript/{index}                index, text
config/ai                           geminiKey            (lecturer-only read; set by the admin)
assignments/{aid}                   title, requirements, due
  submissions/{email}               repoUrl, files[], review, grade, feedback
```

## 6. Changes from SRS version 1 (and why)

| v1 said | v2 says | Reason (team decision) |
|---|---|---|
| Sessions start automatically by the timetable, with a notification | Back in (FR-SES-1, FR-SES-2): the lecturer types the weekly times once; no Moodle connection needed | First we used one button only; the team brought the v1 idea back. |
| Students log in with university email | Google sign-in with the email on the class list | The Moodle list holds the students' Gmail addresses. |
| Website login only for the lecturer; students use a mobile app | Students use the website too; the Android app is optional | The sheet asks for a web-based smartphone app (KISS). |
| Location within ~500 m = present, otherwise Zoom | **No location; a valid scan = in class; no Zoom attendance** | Real-phone tests: Zoom's video loses the flicker, and any number shown for Zoom can be forwarded by WhatsApp. Only someone in the room can film the live code, so location adds nothing. |
| — | The flicker code (§3.1) | A normal QR was photographed and forwarded in our own test. |
| Push notifications on the phone | In-app notifications while open | Push needs server functions (paid plan). |
| — | Head count from a class photo, attendance sheet, class-list import | Features of the Ex2 sheet that v1 did not cover. |
| Head count (number of people) | Face boxes; each student taps their own face | A number cannot show WHO is missing; a face can. |
| Polls (one question) + a separate Kahoot quiz | One feature: polls & quizzes, correct answer and time optional | The sheet asks for KISS polls; one feature keeps it simple and still interactive. |
| Code every 30 s | Code every 5 s | Sign-in is fast now; the old reason for 30 s is gone. |
| AI key pasted by the lecturer (Groq) | Gemini with a built-in, private key (Firestore, lecturer-only) | The lecturer should get a working system without knowing what an API key is. |

## 7. Traceability to the Ex2 sheet

| Ex2 feature | Requirements |
|---|---|
| Automatic attendance + evaluation (class photo) + online/offline spreadsheet | FR-ATT-1..17, FR-GEN-4 |
| Comments and suggestions, real time / offline | FR-COM-1..7, FR-GEN-2 |
| On-the-spot KISS polls | FR-POLL-1..3 (*Ask now*), extended by FR-QZ-1..5 (correct answers, time, Kahoot-style) |
| ML summary of the class video | FR-SUM-1..3 |
| Deep LLM review of homework with comparison to other students | FR-HW-1..4 |
| Works in this class, real demo; simple smartphone web app | NFR-5, NFR-8; [demo script](10_DEMO_SCRIPT.md) |
