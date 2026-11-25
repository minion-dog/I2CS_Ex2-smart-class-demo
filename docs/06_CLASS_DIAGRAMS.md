# Low-level class diagrams

The diagrams show the real classes and functions in the code (names as in the source). JavaScript
modules that export plain functions are drawn as `<<module>>` classes.

## 1. The flicker QR (attendance core)

Screen side (`FlickerSchedule`, `NoisyQrDisplay`) and scanner side (`ChangeMap`, `AveragingScanner`).
The Java app has the same classes (`FlickerSchedule.java`, `ChangeMap.java`, `QrNoiseView.java`, `QrAnalyzer.java`).

```mermaid
classDiagram
    direction LR
    class NOISE {
        <<constants>>
        PHASE_MS = 33
        HOLD = 8
        FRAMES = 25
        BLUR_SIGMA = 1.5
        ERROR_CORRECTION = "Q"
        QUIET_ZONE = 2
    }
    class Payload {
        <<module payload.js>>
        CODE: PREFIX "SC2", ROTATE_MS 30000, TOKEN_CHARS 14, SESSION_CHARS 10
        +encodePayload(sessionId, token) string
        +decodePayload(text) object
        +newToken() string
        +newSessionId() string
        +isCurrentCode(createdMs, nowMs) boolean
    }
    class FlickerSchedule {
        +size: int
        +total: int
        +seed: int
        -slow: Uint8Array
        -offset: Uint8Array
        +FlickerSchedule(matrix, seed)
        +frame(phase) Uint8Array
    }
    class NoisyQrDisplay {
        -canvas: HTMLCanvasElement
        -plan: FlickerSchedule
        -lastPhase: int
        -running: boolean
        +setText(text)
        +start()
        +stop()
        -draw(phase)
    }
    class ChangeMap {
        -length: int
        -capacity: int
        -side: int
        -last: Uint8ClampedArray
        -diffs: Uint8ClampedArray[]
        -sum: Float64Array
        -cx: int
        -cy: int
        +push(grey)
        +count() int
        +hasSignal() boolean
        +activeBox() Box
        +image(side) Uint8ClampedArray
        +reset()
        -boxMask(side) Uint8Array
    }
    class AveragingScanner {
        -video: HTMLVideoElement
        -onText: function
        -view: HTMLCanvasElement
        -map: ChangeMap
        -crop: Crop
        -zoomedAt: number
        -digitalZoom: number
        +start()
        +stop()
        +setZoom(factor)
        +maxZoom() number
        -processFrame()
        -zoomIfSmall()
        -unzoom()
        -tryDecode()
        -show(rgba)
    }
    class helpers {
        <<module noisyqr.js>>
        +matrixFromText(qrcodeLib, text) Matrix
        +squaresToGrey(squares, total, scale)
        -bestShift(frame, last, n)
        -searchShift(frame, last, n, cx, cy, radius, step)
        -gaussianBlur(img, w, h, sigma)
        -otsu(img) int
        -mix(seed, i, epoch, salt) int
    }
    NoisyQrDisplay --> FlickerSchedule : draws
    NoisyQrDisplay ..> Payload : shows
    FlickerSchedule ..> helpers : matrixFromText, mix
    AveragingScanner *-- ChangeMap : owns
    AveragingScanner ..> Payload : decodePayload (in student.js)
    ChangeMap ..> helpers : bestShift, blur, otsu
    FlickerSchedule ..> NOISE
    ChangeMap ..> NOISE
```

## 2. The data layer (Strategy pattern)

```mermaid
classDiagram
    direction TB
    class Store {
        <<interface>>
        +kind: string
        +onAuth(cb) unsubscribe
        +signInGoogle()
        +signInLecturer(email, password)
        +signOut()
        +saveRoster(entries)
        +listRoster() Student[]
        +createSession(title) string
        +updateSession(id, fields)
        +watchSessions(cb) unsubscribe
        +publishCode(sid, token)
        +markMe(sid, rec) string
        +setAttendance(sid, email, status)
        +watchAttendance(sid, cb) unsubscribe
        +loadAttendance(ids) object
        +addComment(sid, c)
        +watchComments(sid, cb) unsubscribe
        +createPoll(sid, question, options) string
        +setPollOpen(sid, pid, open)
        +vote(sid, pid, option)
        +watchPolls(sid, cb) unsubscribe
        +loadAiKey() string
        +idToken() string
        +savePhoto(sid, photo)
        +watchPhoto(sid, cb)
        +chooseFace(sid, v, face)
        +watchTakenFaces(sid, v, cb)
        +freeFace(sid, v, face, email)
        +addTranscript(sid, index, text)
        +createAssignment(a) string
        +submit(aid, s)
        +updateSubmission(aid, email, fields)
    }
    class FirebaseStore {
        -config: object
        -db: Firestore
        -auth: Auth
        +init()
        -resolveRole(user)
        -writeMark(sid, status, token)
        -live(build, cb)
    }
    class FakeStore {
        -state: object
        -listeners: Set
        -channel: BroadcastChannel
        +signInAs(who)
        +resetDemo()
        -markWith(sub, status, token)
        -visibleAttendance(sid)
        -visibleComments(sid)
        -commit()
        -notify()
    }
    class LanStore {
        -token: string
        -online: boolean
        +signInStudent(email)
        -act(action) result
        -refresh()
        -accept(state)
        -enqueue(action)
        -flush()
        -showPending(action)
    }
    class store_js {
        <<module store.js>>
        +getStore() Store
        +demoMode() boolean
        +lanMode() boolean
        +modeSuffix() string
    }
    Store <|.. FirebaseStore
    Store <|.. FakeStore
    FakeStore <|-- LanStore : reuses the views
    store_js ..> Store : creates one
```

## 3. Core logic and AI helpers

```mermaid
classDiagram
    direction LR
    class classlist {
        <<module classlist.js>>
        +parseCsv(text) string[][]
        +rosterFromRows(rows) Student[]
        +normaliseEmail(email) string
    }
    class sheet {
        <<module sheet.js>>
        STATUS: PRESENT, ZOOM, MANUAL
        +buildAttendanceSheet(roster, sessions, attendance) string[][]
    }
    class xlsx {
        <<module xlsx.js>>
        +writeXlsx(sheetName, rows) Uint8Array
        +readXlsx(bytes) string[][]
    }
    class ai {
        <<module ai.js>>
        +initAi(store) boolean
        +aiReady() boolean
        +transcribe(audio, language) string
        +chat(messages) string
    }
    class gemini {
        <<module gemini.js>>
        GEMINI: MODEL, MAX_INLINE_BYTES
        +toGeminiBody(messages) object
        +textOf(data) string
        +geminiChat(key, messages) string
        +geminiTranscribe(key, audio, language) string
    }
    class prompts {
        <<module prompts.js>>
        LIMITS
        +summaryPrompt(title, transcript, uiLang)
        +githubParts(url)
        +pickRepoFiles(tree)
        +submissionText(files)
        +reviewPrompt(requirements, submission, peers, uiLang)
        +reviewSummaryLine(review)
    }
    class github {
        <<module github.js>>
        +fetchRepoFiles(url) File[]
    }
    class faces {
        <<module core/faces.js>>
        FACES: MERGE_IOU, TRUST, NOT_FOUND
        +mergeBoxes(boxes) Box[]
        +trustLocal(raw) Box[]
        +parseGeminiBoxes(text) Box[]
        +tiles(w, h, side, overlap)
        +hitTest(boxes, x, y) int
        +boxAt(boxes, x, y, aspect) Box
        +withIds(boxes) Box[]
        +claimsOf(attendance, v) Map
        +myStep(record, photo) string
        +photoStats(boxes, attendance, v)
    }
    class facefind {
        <<module ai/facefind.js>>
        +findFaces(canvas, jpeg, status)
        +findLocal(canvas, status)
    }
    class FaceView {
        -mode: edit|pick|watch
        -boxes: Box[]
        +setPhoto(src, boxes, aspect)
        +setTaken(ids, mine)
        +setLabels(map)
        +undo()
        +crop(id, side) Canvas
    }
    facefind ..> faces
    facefind ..> ai : Gemini boxes
    FaceView ..> faces : hitTest, boxAt
    class LectureRecorder {
        -store: Store
        -sid: string
        -recorder: MediaRecorder
        -index: int
        +start()
        +stop()
        -recordPiece()
        -sendPiece(index, blob)
    }
    classlist ..> xlsx : reads .xlsx
    sheet ..> xlsx : the lecturer downloads
    github ..> prompts : githubParts, pickRepoFiles
    LectureRecorder ..> ai : transcribe
    prompts ..> ai : messages for chat
    ai ..> gemini : calls
```

## 4. Pages (web UI)

```mermaid
classDiagram
    direction LR
    class page_js { <<module page.js>> +startPage(role) }
    class login_js { <<page index.html>> }
    class lecturer_js { <<page lecturer.html>> -openLive(session) -renderAttendance(list) -showJoin() }
    class student_js { <<page student.html>> -onScanned(text) -mark(send) -showWhere() -applyZoom(f) }
    class comments_js { <<module comments.js>> +bindComments(store, user, sid, ui) }
    class polls_js { <<module polls.js>> +bindPolls(store, user, sid, box) +readPollForm(q, opts) +notify(text) }
    class i18n_js { <<module i18n.js>> +t(key) +lang() +applyLanguage(root) +toggleLanguage() }
    class dom_js { <<module dom.js>> +el(tag, attrs, children) +fill(parent, ...) +toast(text) +watchConnection(text) }
    lecturer_js ..> page_js
    student_js ..> page_js
    lecturer_js ..> NoisyQrDisplay
    student_js ..> AveragingScanner
    lecturer_js ..> comments_js
    student_js ..> comments_js
    lecturer_js ..> polls_js
    student_js ..> polls_js
    page_js ..> i18n_js
    page_js ..> dom_js
```

## 5. Android app (Java)

```mermaid
classDiagram
    direction LR
    class BaseActivity { <<abstract>> #keep(registration) }
    class MainActivity
    class LoginActivity
    class StudentHomeActivity
    class ScanActivity { -camera: Camera -zoomBy(step) -setZoom(ratio) -pinchToZoom() -markIfNew(payload) }
    class QrAnalyzer { -map: ChangeMap -crop: int[] +analyze(image) -zoomIfSmall(w, h) -tryDecode() }
    class LecturerHomeActivity { -create() -importRoster(uri) -exportSheet() }
    class LiveSessionActivity
    class QrNoiseView { -plan: FlickerSchedule +setText(text) }
    class LectureActivity
    class AssignmentsActivity
    class Repo { <<singleton>> +get() Repo +createSession(title, done) +publishCode(sid, token) +markMe(sid, token) +loadAiKey(done) }
    class Ai { <<Gemini>> +ready(c) +setKey(c, key) +chat(c, system, user) +transcribe(c, file) }
    class Faces { <<core>> +hitTest(boxes, x, y) +myStep(scanned, face, photoV, v) +claimId(v, id) }
    class FacePickActivity
    class FacePickView
    BaseActivity <|-- FacePickActivity
    FacePickActivity *-- FacePickView
    FacePickView ..> Faces
    ScanActivity ..> FacePickActivity : after a scan
    LecturerHomeActivity ..> Ai : setKey from Repo
    class ChangeMap
    class FlickerSchedule
    class Payload
    BaseActivity <|-- StudentHomeActivity
    BaseActivity <|-- ScanActivity
    BaseActivity <|-- LecturerHomeActivity
    BaseActivity <|-- LiveSessionActivity
    BaseActivity <|-- LectureActivity
    BaseActivity <|-- AssignmentsActivity
    MainActivity ..> LoginActivity
    ScanActivity *-- QrAnalyzer
    QrAnalyzer *-- ChangeMap
    LiveSessionActivity *-- QrNoiseView
    QrNoiseView *-- FlickerSchedule
    ScanActivity ..> Repo
    LecturerHomeActivity ..> Repo
    LiveSessionActivity ..> Repo
    ScanActivity ..> Payload
    LiveSessionActivity ..> Payload
```
