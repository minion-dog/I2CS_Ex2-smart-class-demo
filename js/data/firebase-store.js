// =====================================================================
//  firebase-store.js - the real data layer (Firebase Auth + Firestore)
// =====================================================================
// Same methods as fake-store.js. Firestore's persistent local cache keeps
// working offline: a scan, comment or vote made without internet is saved
// on the device and sent automatically when the connection returns
// (decision Q6: "offline = save and send later").
// The security rules (firestore.rules) are what really protect the data;
// this file only calls Firestore the way the rules allow.

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
     * @param {{lat:number,lng:number,cosLat:number,radiusM:number}} where - lecturer location
     * @returns {Promise<string>} session id
     */
    async createSession(title, where)
    {
        await this.ready;
        const f = this.fs;
        const ref = f.doc(f.collection(this.db, 'sessions'));
        await f.setDoc(ref, {
            title: title, startedAt: Date.now(), endedAt: null,
            lat: where.lat, lng: where.lng, cosLat: where.cosLat, radiusM: where.radiusM,
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
        await f.setDoc(f.doc(this.db, 'sessions', sid, 'codes', token), { createdAt: Date.now() });
    }

    /**
     * Marks the signed-in student. Works offline: the write waits on the
     * device and the rules check it when it arrives.
     * @param {string} sid - session
     * @param {{token:string, lat:number, lng:number, status:string}} rec - scan
     */
    async markMe(sid, rec)
    {
        await this.ready;
        const f = this.fs;
        const ref = f.doc(this.db, 'sessions', sid, 'attendance', this.user.email);
        // Not awaited on purpose: offline, the promise resolves only when the
        // server answers. The watch on our own record shows "waiting to send".
        f.setDoc(ref, {
            email: this.user.email, uid: this.user.uid, name: this.user.name, status: rec.status,
            token: rec.token, lat: rec.lat, lng: rec.lng, scannedAt: Date.now()
        }).catch((e) => console.warn('attendance rejected:', e.code || e.message));
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

    // ----------------------------------------------------------- polls
    /**
     * Creates and opens a poll (lecturer).
     * @param {string} sid - session
     * @param {string} question - the question
     * @param {string[]} options - answers
     * @returns {Promise<string>} poll id
     */
    async createPoll(sid, question, options)
    {
        await this.ready;
        const f = this.fs;
        const ref = await f.addDoc(f.collection(this.db, 'sessions', sid, 'polls'),
            { question: question, options: options, open: true, createdAt: Date.now() });
        return ref.id;
    }

    /**
     * Opens or closes a poll (lecturer).
     * @param {string} sid - session
     * @param {string} pid - poll
     * @param {boolean} open - new state
     */
    async setPollOpen(sid, pid, open)
    {
        await this.ready;
        await this.fs.updateDoc(this.fs.doc(this.db, 'sessions', sid, 'polls', pid), { open: open });
    }

    /**
     * Watches the polls of a session, newest first.
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives polls
     * @returns {function():void} unsubscribe
     */
    watchPolls(sid, cb)
    {
        return this.live((f) => f.query(f.collection(this.db, 'sessions', sid, 'polls'), f.orderBy('createdAt', 'desc')), cb);
    }

    /**
     * Votes once (student; works offline).
     * @param {string} sid - session
     * @param {string} pid - poll
     * @param {number} option - answer index
     */
    async vote(sid, pid, option)
    {
        await this.ready;
        const f = this.fs;
        f.setDoc(f.doc(this.db, 'sessions', sid, 'polls', pid, 'votes', this.user.uid),
            { option: option, votedAt: Date.now() })
            .catch((e) => console.warn('vote rejected:', e.code || e.message));
    }

    /**
     * Watches vote counts (lecturer) or the user's own vote (student).
     * @param {string} sid - session
     * @param {string} pid - poll
     * @param {function({counts:(number[]|null), mine:(number|null)}):void} cb - receives results
     * @returns {function():void} unsubscribe
     */
    watchVotes(sid, pid, cb)
    {
        const votes = (f) => f.collection(this.db, 'sessions', sid, 'polls', pid, 'votes');
        if (this.user.role === 'lecturer')
        {
            return this.live(votes, (list) =>
            {
                const counts = [];
                for (const v of list)
                {
                    counts[v.option] = (counts[v.option] || 0) + 1;
                }
                cb({ counts: counts, mine: null });
            });
        }
        return this.liveDoc((f) => f.doc(this.db, 'sessions', sid, 'polls', pid, 'votes', this.user.uid), (list) =>
        {
            cb({ counts: null, mine: list.length > 0 ? list[0].option : null });
        });
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
