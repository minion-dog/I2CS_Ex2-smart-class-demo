# Demo script (10 minutes, in class)

**Roles:** Maor = lecturer (laptop on the projector). Noam = student phone + talks the class through it.
Volunteers: 3–5 classmates with phones.

## Before class (15 minutes before)
- [ ] Laptop: open the site → sign in as lecturer → class list is loaded.
- [ ] AI key: in Firestore `config/ai` (Firebase), or the local file `web/js/ai-key.local.js` on the laptop (never on GitHub).
- [ ] A test lecture was run once on the classroom projector: scan from the last row works (zoom +).
- [ ] Phones of the team: signed in as students, camera permission allowed.
- [ ] A photo of the class from the course folder is on the laptop (for the face boxes).
- [ ] Backup: the local server (`Start LAN Server.bat`) and the demo mode (`?demo=1`) both work offline.

## The 10 minutes

| Time | What we show | What we say (one line) |
|---|---|---|
| 0:00 | The problem slide: a normal QR photographed and sent on WhatsApp | "Attendance by QR is easy to fake. We fixed that." |
| 0:45 | Lecturer: **Start lecture** → **Full screen** | "This code changes 30 times a second. Every frame is random." |
| 1:30 | A volunteer takes a **photo** with the normal camera app and tries to scan it with our app | "The photo is just dots; our app reads nothing." |
| 2:30 | Volunteers **scan live** from the front and the back row (zoom +) | "Our scanner measures *how fast* each square changes. That is the QR." |
| 3:30 | The lecturer's live list and counter; a second scan → "already marked" | "One mark per student, only from the room. No location needed." |
| 4:00 | **Sheet** → **Download XLSX** | "The main feature: the attendance spreadsheet, online or offline." |
| 5:30 | **Quiz mode** (same feature): ✨ AI writes 3 questions from today's transcript, with correct answers and 20 s → Run | "Mark a correct answer and a time and the poll becomes a Kahoot-style quiz: faster right answers get more points." |
| 4:45 | **Class photo**: take it, remove one wrong box, add one missing face, save; on the phone tap your face → *Is this you?* → Yes | "Every face gets a box; each student confirms himself, one student per face; who is not in the photo tells me at once. Came, scanned and left? The photo can be taken at any moment of the lesson — whoever left is not in it. No GPS, no tracking." |
| 5:30 | **Comments**: a private anonymous question, a public one; airplane mode → send → back online | "Real time, and offline it waits on the phone." |
| 6:30 | **Quick poll**: question + 3 answers → *Ask now*, the class answers, *Close* | "KISS: one tap, it opens on every phone, live results." |
| 7:30 | **Summary**: upload a short recording → transcript → summary | "Whisper in Hebrew, then a summary for the students." |
| 8:30 | **Homework**: a sample repository from the course list → AI review → grade | "The review also compares with the rest of the class, anonymously." |
| 9:30 | Wrap up: repository, documents, tests (31 + 18 + 9) | "All design documents are in the repository." |

## Questions we expect
| Question | Answer |
|---|---|
| "What if a student scans and leaves?" | The scan proves the start; the class photo proves he was still there. The lecturer takes it whenever he wants (middle, end, random), and whoever left has no face to confirm: "scanned, not in the photo". Scanning 3 times or GPS all lesson would be annoying, invasive and still not accurate indoors. |

| "A friend in class streams the code by video call to a student at home?" | Video calls (Zoom, WhatsApp) compress and drop frames, so the 30-per-second flicker is mostly lost (our Zoom test: not readable). Even if it works, it must be live within ~10 s, and the student at home has no face in the class photo: the friend's own face is already his. Someone out of frame is added by the lecturer by hand, and the lecturer sees the photo and the room; a box asked for an empty seat is checked by Gemini and still decided by the lecturer. If the lecturer is fooled face to face, that is outside what software can secure. |
| "What about students on Zoom?" | At first the plan was that Zoom students scan the code from their screen too. When we tested it, Zoom's video compression erased the flicker, so the code could not be read through Zoom. We dropped it: attendance is physical only, and a student on Zoom counts as absent (the lecturer can still mark someone by hand). The same compression is what protects the code from being streamed to someone at home. |
| "GPS?" | Not needed and not used: indoors it can't tell the room from the hallway, a VPN or fake location app defeats it, and it is personal data. |

## If something fails
| Problem | Do this |
|---|---|
| No internet in the room | Switch to the local server (`Start LAN Server.bat`) on the laptop's hotspot. |
| A phone can't read from the back | Use **+** zoom, or walk two rows forward; explain the 10% size limit. |
| Gemini is slow | Show the summary made before class. |
