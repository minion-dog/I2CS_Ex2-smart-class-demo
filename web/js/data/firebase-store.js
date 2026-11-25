// =====================================================================
//  firebase-store.js - the real data layer (Firebase Auth + Firestore)
// =====================================================================
// Same methods as fake-store.js. Firestore's persistent local cache keeps
// working offline: a scan, comment or answer made without internet is saved
// on the device and sent automatically when the connection returns
// (decision Q6: "offline = save and send later").
// The security rules (firestore.rules) are what really protect the data;
// this file only calls Firestore the way the rules allow.

import { newSessionId } from '../core/payload.js';
import { claimId, withIds } from '../core/faces.js';
import { splitKey, toMs, newQuizState } from '../core/quiz.js';
import { reactionId, cleanEmojis } from '../core/reactions.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

/** A Store backed by Firebase. */
export class FirebaseStore
{
    /**
     * Connects to Firebase.
     * @param {object} config - the web config from the Firebase console
     */
    constructor(config)
    {
        this.kind = 'firebase';
        this.config = config;
        this.user = null;
        this.ready = this.init();
    }

    /**
     * Loads the SDK modules and starts the offline cache.
     * @returns {Promise<void>}
     */
    async init()
    {
        const appMod = await import(SDK + 'firebase-app.js');
        this.fa = await import(SDK + 'firebase-auth.js');
        this.fs = await import(SDK + 'firebase-firestore.js');
        this.app = appMod.initializeApp(this.config);
        this.auth = this.fa.getAuth(this.app);
        this.db = this.fs.initializeFirestore(this.app, {
            localCache: this.fs.persistentLocalCache({ tabManager: this.fs.persistentMultipleTabManager() })
        });
    }

    // ------------------------------------------------------------ auth
    /**
     * Calls cb now and on every sign-in change, with the role resolved.
     * @param {function(object|null):void} cb - receives {uid,email,name,role} or null
     * @returns {function():void} unsubscribe
     */
    onAuth(cb)
    {
        let unsub = null;
        let stopped = false;
        this.ready.then(() =>
        {
            if (stopped)
            {
                return;
            }
            unsub = this.fa.onAuthStateChanged(this.auth, async (u) =>
            {
                if (!u)
                {
                    this.user = null;
                    cb(null);
                    return;
                }
                this.user = await this.resolveRole(u);
                cb(this.user);
            });
        });
        return () =>
        {
            stopped = true;
            if (unsub)
            {
                unsub();
            }
        };
    }

    /** Signs a student in with Google (popup). */
    async signInGoogle()
    {
        await this.ready;
        const provider = new this.fa.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await this.fa.signInWithPopup(this.auth, provider);
    }

    /**
     * Signs the lecturer in with email and password.
     * @param {string} email - lecturer account
     * @param {string} password - password
     */
    async signInLecturer(email, password)
    {
        await this.ready;
        await this.fa.signInWithEmailAndPassword(this.auth, email, password);
    }

    /** Signs out. */
    async signOut()
    {
        await this.ready;
        await this.fa.signOut(this.auth);
    }

    /**
     * A fresh sign-in token of the current account, for the AI Worker
     * (the Worker asks Firestore with it whether this is the lecturer).
     * @returns {Promise<string>} Firebase ID token
     */
    async idToken()
    {
        await this.ready;
        if (!this.auth.currentUser)
        {
            throw new Error('not signed in');
        }
        return this.auth.currentUser.getIdToken();
    }

    /**
     * Reads the built-in AI key (config/ai.geminiKey). The security rules let only
     * the lecturer read it, so students and visitors never see it.
     * @returns {Promise<string>} the key, or '' when not set or not allowed
     */
    async loadAiKey()
    {
        await this.ready;
        if (!this.user || this.user.role !== 'lecturer')
        {
            return '';
        }
        const f = this.fs;
        try
        {
            const d = await f.getDoc(f.doc(this.db, 'config', 'ai'));
            return d.exists() ? String(d.data().geminiKey || '') : '';
        }
        catch (e)
        {
            return '';
        }
    }

    /**
     * Saves the weekly lecture times (lecturer).
     * @param {object[]} slots - clean slots
     */
    async saveSchedule(slots)
    {
        await this.ready;
        await this.fs.setDoc(this.fs.doc(this.db, 'config', 'schedule'), { slots: slots });
    }

    /**
     * Reads the weekly lecture times (lecturer).
     * @returns {Promise<object[]>} slots
     */
    async loadSchedule()
    {
        await this.ready;
        try
        {
            const d = await this.fs.getDoc(this.fs.doc(this.db, 'config', 'schedule'));
            return d.exists() ? d.data().slots || [] : [];
        }
        catch (e)
        {
            return [];
        }
    }

    /**
     * Finds out who a signed-in account is.
     * Lecturer = a staff/{uid} document exists. Student = may read sessions
     * (the rules allow that only for emails on the class list).
     * @param {object} u - Firebase user
     * @returns {Promise<object>} {uid,email,name,role}
     */
    async resolveRole(u)
    {
        const f = this.fs;
        const email = (u.email || '').toLowerCase();
        const base = { uid: u.uid, email: email, name: u.displayName || email, role: 'unknown' };
        try
        {
            const staff = await f.getDoc(f.doc(this.db, 'staff', u.uid));
            if (staff.exists())
            {
                base.role = 'lecturer';
                return base;
            }
        }
        catch (e)
        {
            console.warn('staff check:', e.code || e.message);
        }
        try
        {
            await f.getDocs(f.query(f.collection(this.db, 'sessions'), f.limit(1)));
            base.role = 'student';
            await f.setDoc(f.doc(this.db, 'users', u.uid),
                { email: email, name: base.name, lastSeen: f.serverTimestamp() }, { merge: true });
        }
        catch (e)
        {
            base.role = 'not-on-list';
        }
        return base;
    }

    // ---------------------------------------------------------- roster
    /**
     * Replaces the class list (lecturer). Students no longer on the list are removed.
     * @param {object[]} entries - from rosterFromRows
     */
    async saveRoster(entries)
    {
        await this.ready;
        const f = this.fs;
        const old = await f.getDocs(f.collection(this.db, 'roster'));
        const keep = new Set();
        let batch = f.writeBatch(this.db);
        let n = 0;
        for (const e of entries)
        {
            keep.add(e.email);
            batch.set(f.doc(this.db, 'roster', e.email), e);
            n++;
            if (n % 400 === 0)
            {
                await batch.commit();
                batch = f.writeBatch(this.db);
            }
        }
        old.forEach((d) =>
        {
            if (!keep.has(d.id))
            {
                batch.delete(d.ref);
            }
        });
        await batch.commit();
    }

    /**
     * Returns the class list (lecturer).
     * @returns {Promise<object[]>} entries sorted by last name
     */
    async listRoster()
    {
        await this.ready;
        const f = this.fs;
        const snap = await f.getDocs(f.collection(this.db, 'roster'));
        const out = [];
        snap.forEach((d) => out.push(d.data()));
        return out.sort((a, b) => (a.last + ' ' + a.first).localeCompare(b.last + ' ' + b.first, 'he'));
    }

    // -------------------------------------------------------- sessions
    /**
     * Opens a lecture (lecturer).
     * @param {string} title - name
     * @returns {Promise<string>} session id
     */
    async createSession(title)
    {
        await this.ready;
        const f = this.fs;
        const ref = f.doc(this.db, 'sessions', newSessionId());   // short id = short QR
        await f.setDoc(ref, {
            title: title, startedAt: Date.now(), endedAt: null,
            summary: null, headcount: null
        });
        return ref.id;
    }

    /**
     * Updates session fields (lecturer).
     * @param {string} id - session
     * @param {object} fields - fields to set
     */
    async updateSession(id, fields)
    {
        await this.ready;
        await this.fs.updateDoc(this.fs.doc(this.db, 'sessions', id), fields);
    }

    /**
     * Watches all sessions, newest first.
     * @param {function(object[]):void} cb - receives the list
     * @returns {function():void} unsubscribe
     */
    watchSessions(cb)
    {
        return this.live((f) => f.query(f.collection(this.db, 'sessions'), f.orderBy('startedAt', 'desc')), cb);
    }

    // ------------------------------------------------------ attendance
    /**
     * Stores the current secret QR token (lecturer).
     * @param {string} sid - session
     * @param {string} token - random token
     */
    async publishCode(sid, token)
    {
        await this.ready;
        const f = this.fs;
        await f.setDoc(f.doc(this.db, 'sessions', sid, 'codes', token), { createdAt: f.serverTimestamp() });   // the rules compare with the server's clock
    }


    /**
     * Marks the signed-in student as in class (scanned the flicker QR). Works
     * offline: the write waits on the device and the rules check it when it arrives.
     * @param {string} sid - session
     * @param {{token:string}} rec - scan
     * @returns {Promise<string>} 'present'
     */
    async markMe(sid, rec)
    {
        await this.writeMark(sid, 'present', rec.token);
        return 'present';
    }

    /**
     * Writes the student's own attendance record (create once; the rules check the code).
     * @param {string} sid - session
     * @param {string} status - 'present'
     * @param {string} token - the scanned QR token
     */
    async writeMark(sid, status, token)
    {
        await this.ready;
        const f = this.fs;
        const ref = f.doc(this.db, 'sessions', sid, 'attendance', this.user.email);
        // Not awaited on purpose: offline, the promise resolves only when the
        // server answers. The watch on our own record shows "waiting to send".
        f.setDoc(ref, {
            email: this.user.email, uid: this.user.uid, name: this.user.name, status: status,
            token: token, scannedAt: Date.now()
        }).catch((e) => console.warn('attendance rejected:', e.code || e.message));
    }

    // ----------------------------------------------------- class photo
    /**
     * Saves the class photo and its face boxes (lecturer). A new photo gets a
     * new version, so students choose again; editing boxes keeps the version.
     * @param {string} sid - session
     * @param {{v:number, image:string, boxes:object[], aspect:number}} photo - photo
     */
    async savePhoto(sid, photo)
    {
        await this.ready;
        const f = this.fs;
        await f.setDoc(f.doc(this.db, 'sessions', sid, 'photo', 'main'), {
            v: photo.v, image: photo.image, boxes: photo.boxes, aspect: photo.aspect, at: Date.now()
        });
    }

    /**
     * Watches the class photo.
     * @param {string} sid - session
     * @param {function(object|null):void} cb - receives the photo or null
     * @returns {function():void} unsubscribe
     */
    watchPhoto(sid, cb)
    {
        return this.liveDoc((f) => f.doc(this.db, 'sessions', sid, 'photo', 'main'), (list) => cb(list[0] || null));
    }

    /**
     * The student chooses their face (or says "not in the photo"). The claim
     * document id is version_box, so a second student cannot take the same box:
     * the rules refuse to create it again.
     * @param {string} sid - session
     * @param {number} v - photo version
     * @param {number} face - box id, or FACES.NOT_FOUND
     */
    async chooseFace(sid, v, face)
    {
        await this.ready;
        const f = this.fs;
        const batch = f.writeBatch(this.db);
        const mineRef = f.doc(this.db, 'sessions', sid, 'attendance', this.user.email);
        const me = (await f.getDoc(mineRef)).data() || {};
        if (me.photoV === v && me.face === face)
        {
            return;                                                   // the same face again
        }
        if (me.photoV === v && me.face > 0)
        {
            // changing my mind: free my previous face in the same write (one person = one face)
            batch.delete(f.doc(this.db, 'sessions', sid, 'claims', claimId(v, me.face)));
        }
        if (face > 0)
        {
            const claim = f.doc(this.db, 'sessions', sid, 'claims', claimId(v, face));
            if ((await f.getDoc(claim)).exists())
            {
                throw new Error('taken');
            }
            batch.set(claim, { uid: this.user.uid, v: v });
        }
        batch.update(mineRef, { face: face, photoV: v });
        try
        {
            await batch.commit();
        }
        catch (e)
        {
            throw new Error(e.code === 'permission-denied' ? 'taken' : e.message);
        }
    }

    /**
     * Watches which boxes of a photo version are taken (no names: students only see ids).
     * @param {string} sid - session
     * @param {number} v - photo version
     * @param {function(Set<number>):void} cb - receives taken box ids
     * @returns {function():void} unsubscribe
     */
    watchTakenFaces(sid, v, cb)
    {
        return this.live((f) => f.query(f.collection(this.db, 'sessions', sid, 'claims'), f.where('v', '==', v)),
            (list) => cb(new Set(list.map((c) => Number(String(c.id).split('_')[1])))));
    }

    /**
     * The student has no box (face hidden, or cut off at the edge): asks for a box
     * where he tapped. The lecturer's page checks it (Gemini) or the lecturer decides.
     * @param {string} sid - session
     * @param {number} v - photo version
     * @param {{x:number,y:number,w:number,h:number}} box - the requested box (fractions)
     */
    async requestBox(sid, v, box)
    {
        await this.ready;
        const f = this.fs;
        await f.setDoc(f.doc(this.db, 'sessions', sid, 'requests', this.user.email), {
            email: this.user.email, uid: this.user.uid, name: this.user.name, v: v,
            box: { x: box.x, y: box.y, w: box.w, h: box.h }, status: 'pending', reason: '', faceId: 0, at: Date.now()
        });
    }

    /**
     * Watches box requests (lecturer: all; student: own).
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives requests
     * @returns {function():void} unsubscribe
     */
    watchBoxRequests(sid, cb)
    {
        if (this.user && this.user.role === 'lecturer')
        {
            return this.live((f) => f.collection(this.db, 'sessions', sid, 'requests'), cb);
        }
        return this.liveDoc((f) => f.doc(this.db, 'sessions', sid, 'requests', this.user.email), cb);
    }

    /**
     * Accepts or refuses a requested box (lecturer). Accepting adds the box to the photo
     * (same version, a new id) and gives it to the student, all in one write.
     * @param {string} sid - session
     * @param {object} req - the request {email, uid, v, box}
     * @param {boolean} ok - accept
     * @param {string} reason - why (Gemini's words or "lecturer")
     * @param {object} photo - the current photo {v, boxes}
     */
    async resolveBoxRequest(sid, req, ok, reason, photo)
    {
        await this.ready;
        const f = this.fs;
        const ref = f.doc(this.db, 'sessions', sid, 'requests', req.email);
        if (!ok || req.v !== photo.v)
        {
            await f.updateDoc(ref, { status: 'no', reason: reason });
            return;
        }
        const boxes = withIds(photo.boxes.concat([req.box]));
        const id = boxes[boxes.length - 1].id;
        const batch = f.writeBatch(this.db);
        batch.update(f.doc(this.db, 'sessions', sid, 'photo', 'main'), { boxes: boxes });
        batch.set(f.doc(this.db, 'sessions', sid, 'claims', claimId(photo.v, id)), { uid: req.uid, v: photo.v });
        batch.update(f.doc(this.db, 'sessions', sid, 'attendance', req.email), { face: id, photoV: photo.v });
        batch.update(ref, { status: 'ok', reason: reason, faceId: id });
        await batch.commit();
    }

    /**
     * Frees a box a student chose by mistake (lecturer).
     * @param {string} sid - session
     * @param {number} v - photo version
     * @param {number} face - box id
     * @param {string} email - the student who chose it
     */
    async freeFace(sid, v, face, email)
    {
        await this.ready;
        const f = this.fs;
        const batch = f.writeBatch(this.db);
        batch.delete(f.doc(this.db, 'sessions', sid, 'claims', claimId(v, face)));
        batch.update(f.doc(this.db, 'sessions', sid, 'attendance', email), { face: null, photoV: null });
        await batch.commit();
    }

    /**
     * Sets or clears a student's attendance by hand (lecturer).
     * @param {string} sid - session
     * @param {string} email - student
     * @param {string|null} status - new status, or null to remove
     */
    async setAttendance(sid, email, status)
    {
        await this.ready;
        const f = this.fs;
        const ref = f.doc(this.db, 'sessions', sid, 'attendance', email);
        if (status === null)
        {
            await f.deleteDoc(ref);
            return;
        }
        await f.setDoc(ref, { email: email, status: status, scannedAt: Date.now() }, { merge: true });
    }

    /**
     * Watches attendance (lecturer: everyone; student: own record, with a
     * `pending` flag while it waits to be sent).
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives records
     * @returns {function():void} unsubscribe
     */
    watchAttendance(sid, cb)
    {
        if (this.user && this.user.role === 'lecturer')
        {
            return this.live((f) => f.collection(this.db, 'sessions', sid, 'attendance'), cb);
        }
        return this.liveDoc((f) => f.doc(this.db, 'sessions', sid, 'attendance', this.user.email), cb);
    }

    /**
     * Loads attendance of many sessions for the spreadsheet (lecturer).
     * @param {string[]} ids - session ids
     * @returns {Promise<Object<string, Object<string, object>>>} by session, then email
     */
    async loadAttendance(ids)
    {
        await this.ready;
        const f = this.fs;
        const out = {};
        for (const id of ids)
        {
            const snap = await f.getDocs(f.collection(this.db, 'sessions', id, 'attendance'));
            out[id] = {};
            snap.forEach((d) =>
            {
                out[id][d.id] = d.data();
            });
        }
        return out;
    }

    // -------------------------------------------------------- comments
    /**
     * Adds a comment (works offline).
     * @param {string} sid - session
     * @param {{text:string, visibility:string, anonymous:boolean}} c - comment
     */
    async addComment(sid, c)
    {
        await this.ready;
        const f = this.fs;
        f.addDoc(f.collection(this.db, 'sessions', sid, 'comments'), {
            text: c.text, visibility: c.visibility, authorUid: this.user.uid,
            authorName: c.anonymous ? null : this.user.name,
            fromLecturer: this.user.role === 'lecturer', createdAt: Date.now()
        }).catch((e) => console.warn('comment rejected:', e.code || e.message));
    }

    /**
     * Watches the comments the user may see. Students need two queries
     * (public + my own), because Firestore only runs queries the rules allow.
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives comments, oldest first
     * @returns {function():void} unsubscribe
     */
    watchComments(sid, cb)
    {
        const col = (f) => f.collection(this.db, 'sessions', sid, 'comments');
        if (this.user.role === 'lecturer')
        {
            return this.live((f) => f.query(col(f), f.orderBy('createdAt')), cb);
        }
        let pub = [];
        let mine = [];
        const emit = () =>
        {
            const byId = new Map();
            for (const c of pub.concat(mine))
            {
                byId.set(c.id, c);
            }
            cb(Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt));
        };
        const u1 = this.live((f) => f.query(col(f), f.where('visibility', '==', 'public')), (l) =>
        {
            pub = l;
            emit();
        });
        const u2 = this.live((f) => f.query(col(f), f.where('authorUid', '==', this.user.uid)), (l) =>
        {
            mine = l;
            emit();
        });
        return () =>
        {
            u1();
            u2();
        };
    }

    /**
     * Sets my emojis on a public comment (an empty list removes my reaction).
     * One document per comment and user, so each emoji counts once per person.
     * @param {string} sid - session
     * @param {string} cid - comment id
     * @param {string[]} emojis - emoji keys (core/reactions.js)
     */
    async react(sid, cid, emojis)
    {
        await this.ready;
        const f = this.fs;
        const ref = f.doc(this.db, 'sessions', sid, 'reactions', reactionId(cid, this.user.uid));
        const clean = cleanEmojis(emojis);
        const write = clean.length === 0 ? f.deleteDoc(ref) : f.setDoc(ref, { cid: cid, uid: this.user.uid, emojis: clean });
        write.catch((e) => console.warn('reaction rejected:', e.code || e.message));
    }

    /**
     * Watches the emoji reactions of a lecture (only public comments have them).
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives {cid, uid, emojis} records
     * @returns {function():void} unsubscribe
     */
    watchReactions(sid, cb)
    {
        return this.live((f) => f.collection(this.db, 'sessions', sid, 'reactions'), cb);
    }

    // -------------------------------------------------- live quiz (Kahoot style)
    /**
     * Creates a quiz (lecturer). The answer key goes to a lecturer-only document.
     * @param {string} sid - session
     * @param {{title:string, questions:object[]}} quiz - a valid quiz (with correct answers)
     * @returns {Promise<string>} quiz id
     */
    async createQuiz(sid, quiz)
    {
        await this.ready;
        const f = this.fs;
        const parts = splitKey(quiz);
        const ref = f.doc(f.collection(this.db, 'sessions', sid, 'quizzes'));
        const batch = f.writeBatch(this.db);
        batch.set(ref, Object.assign(parts.public, { state: newQuizState(), createdAt: Date.now() }));
        batch.set(f.doc(this.db, 'sessions', sid, 'quizzes', ref.id, 'secret', 'key'), { key: parts.key });
        await batch.commit();
        return ref.id;
    }

    /**
     * Watches the quizzes of a session, newest first.
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives quizzes
     * @returns {function():void} unsubscribe
     */
    watchQuizzes(sid, cb)
    {
        return this.live((f) => f.query(f.collection(this.db, 'sessions', sid, 'quizzes'), f.orderBy('createdAt', 'desc')), cb);
    }

    /**
     * Reads the answer key (lecturer).
     * @param {string} sid - session
     * @param {string} qid - quiz
     * @returns {Promise<number[]>} correct option per question
     */
    async loadQuizKey(sid, qid)
    {
        await this.ready;
        const d = await this.fs.getDoc(this.fs.doc(this.db, 'sessions', sid, 'quizzes', qid, 'secret', 'key'));
        return d.exists() ? d.data().key : [];
    }

    /**
     * Moves the quiz on (lecturer): lobby -> question -> reveal -> board -> ... -> end.
     * startedAt 'now' = the server's clock (the rules time the answers with it).
     * @param {string} sid - session
     * @param {string} qid - quiz
     * @param {object} state - the new state
     */
    async setQuizState(sid, qid, state)
    {
        await this.ready;
        const f = this.fs;
        const st = Object.assign({}, state);
        if (st.startedAt === 'now')
        {
            st.startedAt = f.serverTimestamp();
        }
        await f.updateDoc(f.doc(this.db, 'sessions', sid, 'quizzes', qid), { state: st });
    }

    /**
     * Answers the current question (student); once per question, timed by the server.
     * @param {string} sid - session
     * @param {string} qid - quiz
     * @param {number} index - question
     * @param {number} option - chosen answer
     */
    async answerQuiz(sid, qid, index, option)
    {
        await this.ready;
        const f = this.fs;
        await f.setDoc(f.doc(this.db, 'sessions', sid, 'quizzes', qid, 'answers', this.user.uid + '_' + index), {
            uid: this.user.uid, name: this.user.name, index: index, option: option, at: f.serverTimestamp()
        });
    }

    /**
     * Watches answers (lecturer: everyone's; student: own), with `at` in ms.
     * @param {string} sid - session
     * @param {string} qid - quiz
     * @param {function(object[]):void} cb - receives answers
     * @returns {function():void} unsubscribe
     */
    watchQuizAnswers(sid, qid, cb)
    {
        const col = (f) => f.collection(this.db, 'sessions', sid, 'quizzes', qid, 'answers');
        const fix = (list) => cb(list.map((a) => Object.assign({}, a, { at: toMs(a.at, Date.now()) })));
        if (this.user.role === 'lecturer')
        {
            return this.live(col, fix);
        }
        return this.live((f) => f.query(col(f), f.where('uid', '==', this.user.uid)), fix);
    }

    // ------------------------------------------------------ transcript
    /**
     * Stores one transcript piece (lecturer).
     * @param {string} sid - session
     * @param {number} index - piece number
     * @param {string} text - text
     */
    async addTranscript(sid, index, text)
    {
        await this.ready;
        const f = this.fs;
        await f.setDoc(f.doc(this.db, 'sessions', sid, 'transcript', String(index).padStart(5, '0')),
            { index: index, text: text });
    }

    /**
     * Watches the transcript in order.
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives pieces
     * @returns {function():void} unsubscribe
     */
    watchTranscript(sid, cb)
    {
        return this.live((f) => f.query(f.collection(this.db, 'sessions', sid, 'transcript'), f.orderBy('index')), cb);
    }

    // ----------------------------------------------------- assignments
    /**
     * Creates an assignment (lecturer).
     * @param {{title:string, requirements:string, due:string}} a - assignment
     * @returns {Promise<string>} id
     */
    async createAssignment(a)
    {
        await this.ready;
        const f = this.fs;
        const ref = await f.addDoc(f.collection(this.db, 'assignments'), Object.assign({ createdAt: Date.now() }, a));
        return ref.id;
    }

    /**
     * Watches assignments, newest first.
     * @param {function(object[]):void} cb - receives the list
     * @returns {function():void} unsubscribe
     */
    watchAssignments(cb)
    {
        return this.live((f) => f.query(f.collection(this.db, 'assignments'), f.orderBy('createdAt', 'desc')), cb);
    }

    /**
     * Submits or re-submits (student).
     * @param {string} aid - assignment
     * @param {{repoUrl:string, files:{name:string,text:string}[]}} s - submission
     */
    async submit(aid, s)
    {
        await this.ready;
        const f = this.fs;
        await f.setDoc(f.doc(this.db, 'assignments', aid, 'submissions', this.user.email), {
            email: this.user.email, name: this.user.name, repoUrl: s.repoUrl, files: s.files, submittedAt: Date.now()
        }, { merge: true });
    }

    /**
     * Watches submissions (lecturer: all; student: own).
     * @param {string} aid - assignment
     * @param {function(object[]):void} cb - receives submissions
     * @returns {function():void} unsubscribe
     */
    watchSubmissions(aid, cb)
    {
        if (this.user.role === 'lecturer')
        {
            return this.live((f) => f.collection(this.db, 'assignments', aid, 'submissions'), cb);
        }
        return this.liveDoc((f) => f.doc(this.db, 'assignments', aid, 'submissions', this.user.email), cb);
    }

    /**
     * Sets review / grade / feedback (lecturer).
     * @param {string} aid - assignment
     * @param {string} email - student
     * @param {object} fields - fields to set
     */
    async updateSubmission(aid, email, fields)
    {
        await this.ready;
        await this.fs.updateDoc(this.fs.doc(this.db, 'assignments', aid, 'submissions', email), fields);
    }

    // ------------------------------------------------- LOW-LEVEL HELPERS
    /**
     * Runs a live query and calls cb with plain objects (plus id and pending).
     * @param {function(object):object} build - receives the firestore module, returns a query
     * @param {function(object[]):void} cb - receives rows
     * @returns {function():void} unsubscribe
     */
    live(build, cb)
    {
        let unsub = null;
        let stopped = false;
        this.ready.then(() =>
        {
            if (stopped)
            {
                return;
            }
            unsub = this.fs.onSnapshot(build(this.fs), { includeMetadataChanges: true }, (snap) =>
            {
                const rows = [];
                snap.forEach((d) => rows.push(Object.assign({ id: d.id, pending: d.metadata.hasPendingWrites }, d.data())));
                cb(rows);
            }, (e) => console.warn('live query:', e.code || e.message));
        });
        return () =>
        {
            stopped = true;
            if (unsub)
            {
                unsub();
            }
        };
    }

    /**
     * Like live(), for one document: cb gets [] or [row].
     * @param {function(object):object} build - returns a document reference
     * @param {function(object[]):void} cb - receives rows
     * @returns {function():void} unsubscribe
     */
    liveDoc(build, cb)
    {
        let unsub = null;
        let stopped = false;
        this.ready.then(() =>
        {
            if (stopped)
            {
                return;
            }
            unsub = this.fs.onSnapshot(build(this.fs), { includeMetadataChanges: true }, (d) =>
            {
                if (!d.exists())
                {
                    cb([]);
                    return;
                }
                cb([Object.assign({ id: d.id, pending: d.metadata.hasPendingWrites }, d.data())]);
            }, (e) => console.warn('live doc:', e.code || e.message));
        });
        return () =>
        {
            stopped = true;
            if (unsub)
            {
                unsub();
            }
        };
    }
}
