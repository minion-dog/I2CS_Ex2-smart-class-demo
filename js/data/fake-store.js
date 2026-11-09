// =====================================================================
//  fake-store.js - an in-browser stand-in for Firebase
// =====================================================================
// WHY: (1) the automated browser tests run without Firebase;
// (2) "demo mode" lets anyone try the whole flow on one computer with two
// tabs (lecturer tab + student tab) before the Firebase project exists.
// It has EXACTLY the same methods as firebase-store.js; the pages never
// know which one they got (Strategy pattern).
// State lives in localStorage and every change is broadcast to the other
// tabs, so a scan in the student tab shows up live in the lecturer tab.

const KEY = 'smartclass-demo-v1';
const STATUS_PRESENT = 'present';       // scanned the flicker QR
const CHANNEL = 'smartclass-demo';
const LECTURER = Object.freeze({ uid: 'demo-lecturer', email: 'lecturer@demo', name: 'המרצה (הדגמה)' });

/** A Store backed by localStorage. */
export class FakeStore
{
    /**
     * Creates the store and loads the saved state.
     */
    constructor()
    {
        this.kind = 'demo';
        this.state = load();
        this.listeners = new Set();
        this.user = null;
        this.authListeners = new Set();
        this.channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null;
        if (this.channel)
        {
            this.channel.onmessage = () => this.reloadAndNotify();
        }
        const saved = sessionStorage.getItem(KEY + '-user');
        if (saved)
        {
            this.user = JSON.parse(saved);
        }
    }

    // ------------------------------------------------------------ auth
    /**
     * Calls cb now and on every sign-in change.
     * @param {function(object|null):void} cb - receives {uid,email,name,role} or null
     * @returns {function():void} unsubscribe
     */
    onAuth(cb)
    {
        this.authListeners.add(cb);
        cb(this.user);
        return () => this.authListeners.delete(cb);
    }

    /**
     * Demo sign-in: 'lecturer' or a roster email.
     * @param {string} who - who to be
     * @returns {Promise<void>}
     */
    async signInAs(who)
    {
        if (who === 'lecturer')
        {
            this.user = Object.assign({ role: 'lecturer' }, LECTURER);
        }
        else
        {
            const email = who.trim().toLowerCase();
            const r = this.state.roster[email];
            if (!r)
            {
                throw new Error('not-on-list');
            }
            this.user = { uid: 'demo-' + email, email: email, name: r.first + ' ' + r.last, role: 'student' };
        }
        sessionStorage.setItem(KEY + '-user', JSON.stringify(this.user));
        this.fireAuth();
    }

    /** Google sign-in is not available in demo mode. */
    async signInGoogle()
    {
        throw new Error('demo-mode');
    }

    /** Email/password sign-in in demo mode = become the lecturer. */
    async signInLecturer()
    {
        await this.signInAs('lecturer');
    }

    /** Signs out. */
    async signOut()
    {
        this.user = null;
        sessionStorage.removeItem(KEY + '-user');
        this.fireAuth();
    }

    // ---------------------------------------------------------- roster
    /**
     * Replaces the class list.
     * @param {object[]} entries - from rosterFromRows
     */
    async saveRoster(entries)
    {
        this.state.roster = {};
        for (const e of entries)
        {
            this.state.roster[e.email] = e;
        }
        this.commit();
    }

    /**
     * Returns the class list.
     * @returns {Promise<object[]>} entries sorted by last name
     */
    async listRoster()
    {
        return Object.values(this.state.roster).sort(byLastName);
    }

    // -------------------------------------------------------- sessions
    /**
     * Opens a lecture.
     * @param {string} title - shown in lists and in the sheet
     * @param {{lat:number,lng:number,cosLat:number}} where - lecturer location
     * @returns {Promise<string>} session id
     */
    async createSession(title, where)
    {
        const id = 's' + Date.now().toString(36);
        this.state.sessions[id] = {
            id: id, title: title, startedAt: Date.now(), endedAt: null,
            lat: where.lat, lng: where.lng, cosLat: where.cosLat, radiusM: where.radiusM,
            summary: null, headcount: null
        };
        this.state.sub[id] = { codes: {}, attendance: {}, comments: [], polls: {}, transcript: {} };
        this.commit();
        return id;
    }

    /**
     * Updates session fields (end time, summary, head count).
     * @param {string} id - session
     * @param {object} fields - fields to set
     */
    async updateSession(id, fields)
    {
        Object.assign(this.state.sessions[id], fields);
        this.commit();
    }

    /**
     * Watches all sessions, newest first.
     * @param {function(object[]):void} cb - receives the list
     * @returns {function():void} unsubscribe
     */
    watchSessions(cb)
    {
        return this.watch(() => Object.values(this.state.sessions).sort(newestFirst), cb);
    }

    // ------------------------------------------------------ attendance
    /**
     * Stores the current QR token (lecturer).
     * @param {string} sid - session
     * @param {string} token - random token
     */
    async publishCode(sid, token)
    {
        this.state.sub[sid].codes[token] = { createdAt: Date.now() };
        this.commit();
    }


    /**
     * Marks the signed-in student (the same checks the security rules make).
     * @param {string} sid - session
     * @param {{token:string}} rec - scan of the flicker QR (= in class)
     * @returns {Promise<string>} 'present'
     */
    async markMe(sid, rec)
    {
        const sub = this.state.sub[sid];
        if (!sub || !sub.codes[rec.token])
        {
            throw new Error('bad-code');
        }
        this.markWith(sub, STATUS_PRESENT, rec.token);
        return STATUS_PRESENT;
    }

    /**
     * Writes the signed-in student's record, once per lecture.
     * @param {object} sub - the session's data
     * @param {string} status - 'present' | 'zoom'
     * @param {string} token - the QR token or the Zoom digits
     */
    markWith(sub, status, token)
    {
        const email = this.user.email;
        if (sub.attendance[email])
        {
            throw new Error('already');
        }
        sub.attendance[email] = {
            email: email, uid: this.user.uid, name: this.user.name, status: status, token: token, scannedAt: Date.now()
        };
        this.commit();
    }

    /**
     * Sets or clears a student's attendance by hand (lecturer).
     * @param {string} sid - session
     * @param {string} email - student
     * @param {string|null} status - 'present' | 'zoom' | 'manual' | null to remove
     */
    async setAttendance(sid, email, status)
    {
        const att = this.state.sub[sid].attendance;
        if (status === null)
        {
            delete att[email];
        }
        else
        {
            const old = att[email] || { email: email, name: email };
            att[email] = Object.assign({}, old, { status: status, scannedAt: Date.now() });
        }
        this.commit();
    }

    /**
     * Watches attendance of a session (lecturer: everyone; student: only themselves).
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives records
     * @returns {function():void} unsubscribe
     */
    watchAttendance(sid, cb)
    {
        return this.watch(() => this.visibleAttendance(sid), cb);
    }

    /**
     * Loads attendance of many sessions for the spreadsheet.
     * @param {string[]} ids - session ids
     * @returns {Promise<Object<string, Object<string, object>>>} by session, then email
     */
    async loadAttendance(ids)
    {
        const out = {};
        for (const id of ids)
        {
            out[id] = Object.assign({}, (this.state.sub[id] || {}).attendance || {});
        }
        return out;
    }

    // -------------------------------------------------------- comments
    /**
     * Adds a comment.
     * @param {string} sid - session
     * @param {{text:string, visibility:string, anonymous:boolean}} c - comment
     */
    async addComment(sid, c)
    {
        this.state.sub[sid].comments.push({
            id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            text: c.text, visibility: c.visibility, authorUid: this.user.uid,
            authorName: c.anonymous ? null : this.user.name,
            fromLecturer: this.user.role === 'lecturer', createdAt: Date.now()
        });
        this.commit();
    }

    /**
     * Watches the comments the signed-in user may see.
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives comments, oldest first
     * @returns {function():void} unsubscribe
     */
    watchComments(sid, cb)
    {
        return this.watch(() => this.visibleComments(sid), cb);
    }

    // ----------------------------------------------------------- polls
    /**
     * Creates and opens a poll (lecturer).
     * @param {string} sid - session
     * @param {string} question - the question
     * @param {string[]} options - 2..6 answers
     * @returns {Promise<string>} poll id
     */
    async createPoll(sid, question, options)
    {
        const id = 'p' + Date.now().toString(36);
        this.state.sub[sid].polls[id] = { id: id, question: question, options: options, open: true, createdAt: Date.now(), votes: {} };
        this.commit();
        return id;
    }

    /**
     * Opens or closes a poll (lecturer).
     * @param {string} sid - session
     * @param {string} pid - poll
     * @param {boolean} open - new state
     */
    async setPollOpen(sid, pid, open)
    {
        this.state.sub[sid].polls[pid].open = open;
        this.commit();
    }

    /**
     * Watches the polls of a session (without the votes).
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives polls, newest first
     * @returns {function():void} unsubscribe
     */
    watchPolls(sid, cb)
    {
        return this.watch(() => this.pollList(sid), cb);
    }

    /**
     * Votes once (student).
     * @param {string} sid - session
     * @param {string} pid - poll
     * @param {number} option - index of the answer
     */
    async vote(sid, pid, option)
    {
        const poll = this.state.sub[sid].polls[pid];
        if (!poll.open)
        {
            throw new Error('closed');
        }
        if (poll.votes[this.user.uid] !== undefined)
        {
            throw new Error('already');
        }
        poll.votes[this.user.uid] = option;
        this.commit();
    }

    /**
     * Watches the vote counts (lecturer) or the user's own vote (student).
     * @param {string} sid - session
     * @param {string} pid - poll
     * @param {function({counts:number[], mine:(number|null)}):void} cb - receives results
     * @returns {function():void} unsubscribe
     */
    watchVotes(sid, pid, cb)
    {
        return this.watch(() => this.voteSummary(sid, pid), cb);
    }

    // ------------------------------------------------------ transcript
    /**
     * Stores one transcript piece (lecturer).
     * @param {string} sid - session
     * @param {number} index - piece number, in order
     * @param {string} text - the text
     */
    async addTranscript(sid, index, text)
    {
        this.state.sub[sid].transcript[index] = { index: index, text: text };
        this.commit();
    }

    /**
     * Watches the transcript pieces in order.
     * @param {string} sid - session
     * @param {function(object[]):void} cb - receives pieces
     * @returns {function():void} unsubscribe
     */
    watchTranscript(sid, cb)
    {
        return this.watch(() => Object.values(this.state.sub[sid].transcript).sort(byIndex), cb);
    }

    // ----------------------------------------------------- assignments
    /**
     * Creates an assignment (lecturer).
     * @param {{title:string, requirements:string, due:string}} a - assignment
     * @returns {Promise<string>} id
     */
    async createAssignment(a)
    {
        const id = 'a' + Date.now().toString(36);
        this.state.assignments[id] = Object.assign({ id: id, createdAt: Date.now(), submissions: {} }, a);
        this.commit();
        return id;
    }

    /**
     * Watches assignments, newest first.
     * @param {function(object[]):void} cb - receives the list
     * @returns {function():void} unsubscribe
     */
    watchAssignments(cb)
    {
        return this.watch(() => Object.values(this.state.assignments).map(stripSubmissions).sort(newestCreated), cb);
    }

    /**
     * Submits or re-submits (student). Review, grade and feedback are kept.
     * @param {string} aid - assignment
     * @param {{repoUrl:string, files:{name:string,text:string}[]}} s - submission
     */
    async submit(aid, s)
    {
        const subs = this.state.assignments[aid].submissions;
        const old = subs[this.user.email] || {};
        subs[this.user.email] = Object.assign({}, old, {
            email: this.user.email, name: this.user.name, repoUrl: s.repoUrl, files: s.files, submittedAt: Date.now()
        });
        this.commit();
    }

    /**
     * Watches submissions (lecturer: all; student: own).
     * @param {string} aid - assignment
     * @param {function(object[]):void} cb - receives submissions
     * @returns {function():void} unsubscribe
     */
    watchSubmissions(aid, cb)
    {
        return this.watch(() => this.visibleSubmissions(aid), cb);
    }

    /**
     * Sets review / grade / feedback (lecturer).
     * @param {string} aid - assignment
     * @param {string} email - student
     * @param {object} fields - {review?, grade?, feedback?}
     */
    async updateSubmission(aid, email, fields)
    {
        Object.assign(this.state.assignments[aid].submissions[email], fields);
        this.commit();
    }

    // ---------------------------------------------------- demo helpers
    /** Clears all demo data. */
    async resetDemo()
    {
        this.state = emptyState();
        this.commit();
    }

    // ------------------------------------------------- LOW-LEVEL HELPERS
    /**
     * Registers a live query: compute() runs now and after every change.
     * @param {function():any} compute - builds the result
     * @param {function(any):void} cb - receives it
     * @returns {function():void} unsubscribe
     */
    watch(compute, cb)
    {
        const run = () =>
        {
            try
            {
                cb(clone(compute()));
            }
            catch (e)
            {
                console.warn('demo watch:', e.message);
            }
        };
        this.listeners.add(run);
        run();
        return () => this.listeners.delete(run);
    }

    /** Saves the state, tells the other tabs and the local listeners. */
    commit()
    {
        localStorage.setItem(KEY, JSON.stringify(this.state));
        if (this.channel)
        {
            this.channel.postMessage('changed');
        }
        this.notify();
    }

    /** Reloads after another tab changed something. */
    reloadAndNotify()
    {
        this.state = load();
        this.notify();
    }

    /** Runs every live query. */
    notify()
    {
        for (const run of Array.from(this.listeners))
        {
            run();
        }
    }

    /** Tells the auth listeners. */
    fireAuth()
    {
        for (const cb of Array.from(this.authListeners))
        {
            cb(this.user);
        }
    }

    /**
     * Attendance the signed-in user may see.
     * @param {string} sid - session
     * @returns {object[]} records
     */
    visibleAttendance(sid)
    {
        const all = Object.values(((this.state.sub[sid] || {}).attendance) || {});
        if (this.user && this.user.role === 'lecturer')
        {
            return all;
        }
        return all.filter((r) => this.user && r.email === this.user.email);
    }

    /**
     * Comments the signed-in user may see (same rule as Firestore).
     * @param {string} sid - session
     * @returns {object[]} comments
     */
    visibleComments(sid)
    {
        const all = ((this.state.sub[sid] || {}).comments) || [];
        if (this.user && this.user.role === 'lecturer')
        {
            return all;
        }
        return all.filter((c) => c.visibility === 'public' || (this.user && c.authorUid === this.user.uid));
    }

    /**
     * Polls without their votes, newest first.
     * @param {string} sid - session
     * @returns {object[]} polls
     */
    pollList(sid)
    {
        const polls = Object.values(((this.state.sub[sid] || {}).polls) || {});
        return polls.map(stripVotes).sort(newestCreated);
    }

    /**
     * Vote counts (lecturer) or the user's own vote.
     * @param {string} sid - session
     * @param {string} pid - poll
     * @returns {{counts:(number[]|null), mine:(number|null)}} summary
     */
    voteSummary(sid, pid)
    {
        const poll = this.state.sub[sid].polls[pid];
        const mine = this.user && poll.votes[this.user.uid] !== undefined ? poll.votes[this.user.uid] : null;
        if (!this.user || this.user.role !== 'lecturer')
        {
            return { counts: null, mine: mine };
        }
        const counts = new Array(poll.options.length).fill(0);
        for (const v of Object.values(poll.votes))
        {
            counts[v]++;
        }
        return { counts: counts, mine: mine };
    }

    /**
     * Submissions the signed-in user may see.
     * @param {string} aid - assignment
     * @returns {object[]} submissions
     */
    visibleSubmissions(aid)
    {
        const all = Object.values(this.state.assignments[aid].submissions);
        if (this.user && this.user.role === 'lecturer')
        {
            return all;
        }
        return all.filter((s) => this.user && s.email === this.user.email);
    }
}

/**
 * Loads the saved state or an empty one.
 * @returns {object} state
 */
function load()
{
    try
    {
        const raw = localStorage.getItem(KEY);
        if (raw)
        {
            return JSON.parse(raw);
        }
    }
    catch (e)
    {
        console.warn('demo state unreadable, starting empty');
    }
    return emptyState();
}

/**
 * Returns a fresh, empty state.
 * @returns {object} state
 */
function emptyState()
{
    return { roster: {}, sessions: {}, sub: {}, assignments: {} };
}

/**
 * Deep-copies plain data so callers cannot change the store by accident.
 * @param {any} v - data
 * @returns {any} copy
 */
function clone(v)
{
    return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

/**
 * Copies a poll without its votes.
 * @param {object} p - poll
 * @returns {object} copy
 */
function stripVotes(p)
{
    const c = Object.assign({}, p);
    delete c.votes;
    return c;
}

/**
 * Copies an assignment without its submissions.
 * @param {object} a - assignment
 * @returns {object} copy
 */
function stripSubmissions(a)
{
    const c = Object.assign({}, a);
    delete c.submissions;
    return c;
}

/**
 * Sort helper: by last name, then first name.
 * @returns {number} order
 */
function byLastName(a, b)
{
    return (a.last + ' ' + a.first).localeCompare(b.last + ' ' + b.first, 'he');
}

/**
 * Sort helper: newest session first.
 * @returns {number} order
 */
function newestFirst(a, b)
{
    return b.startedAt - a.startedAt;
}

/**
 * Sort helper: newest created first.
 * @returns {number} order
 */
function newestCreated(a, b)
{
    return b.createdAt - a.createdAt;
}

/**
 * Sort helper: by transcript piece number.
 * @returns {number} order
 */
function byIndex(a, b)
{
    return a.index - b.index;
}
