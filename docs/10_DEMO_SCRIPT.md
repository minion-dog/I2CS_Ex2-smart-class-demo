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
| 5:30 | **Live quiz**: ✨ AI writes 3 questions from today's transcript → Run → the class answers on phones | "Like Kahoot: faster right answers get more points; the answers stay secret until each reveal." |
| 4:45 | **Class photo**: take it, remove one wrong box, add one missing face, save; on the phone tap your face → *Is this you?* → Yes | "Every face gets a box; each student confirms himself, one student per face; who is not in the photo tells me at once." |
| 5:30 | **Comments**: a private anonymous question, a public one; airplane mode → send → back online | "Real time, and offline it waits on the phone." |
| 6:30 | **Poll**: 3 answers, the class votes, close | "On-the-spot, one tap, live results." |
| 7:30 | **Summary**: upload a short recording → transcript → summary | "Whisper in Hebrew, then a summary for the students." |
| 8:30 | **Homework**: a sample repository from the course list → AI review → grade | "The review also compares with the rest of the class, anonymously." |
| 9:30 | Wrap up: repository, documents, tests (31 + 18 + 9) | "All design documents are in the repository." |

## If something fails
| Problem | Do this |
|---|---|
| No internet in the room | Switch to the local server (`Start LAN Server.bat`) on the laptop's hotspot. |
| A phone can't read from the back | Use **+** zoom, or walk two rows forward; explain the 10% size limit. |
| Gemini is slow | Show the summary made before class. |
