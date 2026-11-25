# Sequence diagrams

## SD-1 Open a lecture and show the flicker code (UC-2)

```mermaid
sequenceDiagram
    actor L as Lecturer
    participant P as lecturer.js
    participant S as Store (FirebaseStore)
    participant F as Firestore + rules
    participant D as NoisyQrDisplay
    L->>P: Start lecture
    P->>S: createSession(title)
    S->>F: set sessions/{newSessionId()}
    F-->>S: ok
    S-->>P: sid
    loop every 5 s
        P->>P: token = newToken()
        P->>S: publishCode(sid, token)
        S->>F: set sessions/{sid}/codes/{token} {createdAt: server time} (lecturer only)
        P->>D: setText(encodePayload(sid, token))
    end
    loop 30 times a second
        D->>D: draw(phase): FlickerSchedule.frame(phase)
    end
```

## SD-2 A student marks attendance by scanning (UC-3, the main flow)

```mermaid
sequenceDiagram
    actor St as Student
    participant U as student.js
    participant Sc as AveragingScanner
    participant M as ChangeMap
    participant J as jsQR
    participant S as Store (FirebaseStore)
    participant F as Firestore + rules
    participant LP as lecturer.js (live)
    St->>U: Start camera
    U->>Sc: start()
    loop every camera frame (~30/s)
        Sc->>Sc: draw the crop (whole picture, or zoomed box) to 400×400 grey
        Sc->>M: push(grey)
        M->>M: bestShift (align with the previous frame), add |difference|
        alt every 3rd frame, 25 frames in the map, signal present
            Sc->>M: image(400)
            M->>M: activeBox, stretch, blur, Otsu inside the box
            M-->>Sc: black-and-white picture
            Sc->>J: decode
            alt read
                J-->>Sc: "SC2/<sid>/<token>"
                Sc-->>U: onText(text)
            else not yet, and the code is small
                Sc->>M: activeBox()
                Sc->>Sc: zoomIfSmall(): crop = the box ×1.35, map.reset()
            end
        end
    end
    U->>U: decodePayload(text)
    U->>S: markMe(sid, {token})
    S->>F: create attendance/{myEmail} {status: present, token}
    F->>F: rules: own email, once, codes/{token} exists
    alt allowed
        F-->>S: ok
        S-->>U: present
        U-->>St: 🏫 Physical attendance, in class
        F-->>LP: live update (watchAttendance)
    else already marked
        F-->>S: denied
        U-->>St: You are already marked
    end
```

## SD-3 Why a photo fails (NFR-2)

```mermaid
sequenceDiagram
    actor A as Friend at home
    participant Ph as Phone camera app
    participant Sc as Our scanner
    A->>Ph: photo of the screen (1 frame, or HDR merge of 3–90 frames)
    Ph-->>A: random dots / plain grey (every frame random, every average grey)
    A->>Sc: hold the photo in front of the scanner
    Sc->>Sc: ChangeMap: nothing changes between frames
    Sc-->>A: hasSignal() = false → nothing is read
```

## SD-4 Attendance sheet (UC-4)

```mermaid
sequenceDiagram
    actor L as Lecturer
    participant P as lecturer.js
    participant S as Store
    participant Sh as sheet.js
    participant X as xlsx.js
    L->>P: Sheet tab
    P->>S: listRoster(), sessions, loadAttendance(ids)
    S-->>P: roster, sessions, records (from the server or the local cache)
    P->>Sh: buildAttendanceSheet(roster, sessions, attendance)
    Sh-->>P: rows (V / M per lecture)
    L->>P: Download XLSX
    P->>X: writeXlsx("Attendance", rows)
    X-->>P: bytes
    P-->>L: attendance.xlsx
```

## SD-5 An offline comment (UC-6, FR-GEN-2)

```mermaid
sequenceDiagram
    actor St as Student
    participant C as comments.js
    participant S as FirebaseStore
    participant Cache as Firestore local cache
    participant F as Firestore server
    participant LP as Lecturer page
    St->>C: write, private, anonymous → Send
    C->>S: addComment(sid, {text, visibility, anonymous})
    S->>Cache: write (pending)
    Cache-->>C: shown with "waiting to send"
    Note over Cache,F: no connection
    Cache->>F: sent when the connection returns
    F->>F: rules: author = me, valid visibility
    F-->>LP: live update
```

## SD-6 Quick poll, KISS (UC-7)

```mermaid
sequenceDiagram
    actor L as Lecturer
    participant H as quiz-host.js
    participant S as Store / Firestore + rules
    participant P as quiz-play.js (phones)
    actor St as Students
    L->>H: question + 2–6 answers → Ask now
    H->>S: createQuiz(1 question, key [-1], no time)
    H->>S: setQuizState {phase: question, startedAt: server time}
    S-->>P: open question → full screen, 🔔
    St->>P: tap an answer
    P->>S: create answers/{uid_0}
    Note over S: rules: open, once, no time limit
    S-->>H: live bars (count, %)
    L->>H: Close and show results
    H->>S: setQuizState {phase: reveal, counts}
    S-->>P: result bars, "mine" marked
```

## SD-7 Recording and AI summary (UC-8)

```mermaid
sequenceDiagram
    actor L as Lecturer
    participant P as lecturer.js
    participant R as LectureRecorder
    participant G as ai.js / gemini.js
    participant GM as Gemini API
    participant S as Store
    P->>S: loadAiKey() (Firestore config/ai, lecturer only)
    S-->>P: key (kept in memory)
    L->>P: Record
    P->>R: start()
    loop every 60 s piece
        R->>G: transcribe(piece, "he")
        G->>GM: gemini-3.5-flash, audio inside the request (built-in key)
        GM-->>G: text
        R->>S: addTranscript(sid, index, text)
    end
    L->>P: Make summary
    P->>G: chat(summaryPrompt(title, transcript, lang))
    G->>GM: gemini-3.5-flash
    GM-->>G: summary
    P->>S: updateSession(sid, {summary})
```

## SD-8 Homework review compared with the class (UC-10)

```mermaid
sequenceDiagram
    actor L as Lecturer
    participant P as lecturer.js
    participant Gh as github.js
    participant GitHub
    participant Pr as prompts.js
    participant G as ai.js
    participant S as Store
    L->>P: Review all
    loop each submission
        P->>Gh: fetchRepoFiles(repoUrl)
        Gh->>GitHub: tree + README first + up to 25 code files
        GitHub-->>Gh: files
        P->>Pr: submissionText(files)
        P->>Pr: reviewPrompt(requirements, submission, anonymous peer summaries)
        P->>G: chat(messages)
        G-->>P: review (meets / missing / compared with the class)
        P->>S: updateSubmission(aid, email, {review})
    end
    L->>P: edit, grade, feedback
    P->>S: updateSubmission(aid, email, {grade, feedback})
    S-->>L: the student sees it (🔔 New grade)
```

## SD-9 Class photo: boxes on faces, each student taps their own (UC-5, UC-12)

```mermaid
sequenceDiagram
    actor L as Lecturer
    participant P as lecturer.js
    participant FF as facefind.js
    participant MP as MediaPipe (browser)
    participant W as Worker → Gemini
    participant S as Store / Firestore
    actor St as Student
    participant SP as student.js
    L->>P: Take a class photo
    P->>FF: findFaces(full photo)
    par in the browser
        FF->>MP: detect(whole photo + tiles at 3 sizes)
        MP-->>FF: raw hits
        FF->>FF: trustLocal(raw) (size-dependent confidence)
    and when AI is set up
        FF->>W: photo + "find every face, box_2d"
        W-->>FF: JSON boxes
    end
    FF->>FF: mergeBoxes(all)
    FF-->>P: boxes → count + editor
    L->>P: tap = remove / add, Undo, Save
    P->>S: savePhoto(sid, {v, image, boxes})
    St->>SP: scan the code (SD-2)
    SP->>S: watchPhoto(sid) → photo v
    St->>SP: tap my face → "Is this you?" → Yes
    SP->>S: batch: create claims/{v_box} + update my attendance {face, photoV}
    alt the face is already taken
        S-->>SP: denied → "tell the lecturer"
    end
    S-->>P: names on faces, counters, "not in the photo" list
```

## SD-10 Quiz with correct answers and time, Kahoot style (UC-13)

```mermaid
sequenceDiagram
    actor L as Lecturer (projector)
    participant H as quiz-host.js
    participant S as Store / Firestore + rules
    participant P as quiz-play.js (phones)
    actor St as Students
    L->>H: Run quiz
    H->>S: loadQuizKey (lecturer only)
    H->>S: setQuizState {phase: lobby}
    S-->>P: quiz is live → full screen "get ready"
    L->>H: Start
    loop every question
        H->>S: setQuizState {phase: question, index, startedAt: server time}
        S-->>P: four coloured buttons + timer
        St->>P: tap an answer
        P->>S: create answers/{uid_index} {option, at: server time}
        Note over S: rules: this question, still open, once
        S-->>H: live answer count
        alt time is up or everyone answered
            H->>H: scoreboard(answers, key, starts) — 500..1000, faster = more
            H->>S: setQuizState {phase: reveal, correct, top 5, scores}
            S-->>P: right / wrong, +points, my rank
        end
        L->>H: Leaderboard → Next
    end
    H->>S: setQuizState {phase: end}
    S-->>P: final place
```

## SD-11 "No box on me", checked by Gemini (UC-12)

```mermaid
sequenceDiagram
    actor St as Student
    participant SP as student.js
    participant S as Store / Firestore
    participant LP as lecturer.js
    participant G as Gemini (Worker)
    St->>SP: No box on me → tap where I sit → Send
    SP->>S: set requests/{email} {box, status: pending}
    S-->>LP: new request (dashed box on the photo)
    LP->>G: crop around the box + red rectangle: "is a person there?"
    G-->>LP: {"person": true, "reason": ...}
    alt person
        LP->>S: batch: photo.boxes += box, claims/{v_id}, attendance.face, request ok
        S-->>SP: attendance confirmed
    else no person / no AI
        LP->>S: request no (reason) — the lecturer can still Approve
    end
```
