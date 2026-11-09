// =====================================================================
//  lan-store.js - the data layer for the local server (server/server.py)
// =====================================================================
// WHY: to test with real phones before Firebase exists. The lecturer's PC
// runs server.py; the PC and the phones open the site from it (?lan=1).
// The SERVER checks the rules (real code, one scan, distance) and sends each
// user only what they may see. This class keeps the same methods as the
// other two stores (Strategy pattern), so the pages do not change.
//
// It reuses the demo store's "views" (who sees which comments, vote counts,
// ...) on the state the server sends, and replaces how changes are saved:
// every change is an action POSTed to the server. Offline (phone lost
// Wi-Fi), scans, comments, votes and submissions wait in a queue on the
// phone, show as "waiting to send", and are sent when the server is back.

import { FakeStore } from './fake-store.js';

const POLL_MS = 1000;                       // how often to ask the server for news
const TOKEN_KEY = 'smartclass-lan-token';
const QUEUE_KEY = 'smartclass-lan-queue';
const OFFLINE_OK = new Set(['markMe', 'addComment', 'vote', 'submit']);

/** A Store backed by the local server. */
export class LanStore extends FakeStore
{
    /** Creates the store; resumes the sign-in of this tab if there is one. */
    constructor()
    {
        super();
        this.kind = 'lan';
        if (this.channel)
        {
            this.channel.close();
            this.channel = null;
        }
        this.state = { version: -1, roster: {}, sessions: {}, sub: {}, assignments: {} };
        this.user = null;
        this.token = sessionStorage.getItem(TOKEN_KEY);
        this.online = true;
        this.started = false;
        this.ready = this.token ? this.refresh() : Promise.resolve();
    }

    // ------------------------------------------------------------ auth
    /**
     * Calls cb once the first answer from the server is in, and on every change.
     * @param {function(object|null):void} cb - receives {uid,email,name,role} or null
     * @returns {function():void} unsubscribe
     */
    onAuth(cb)
    {
        this.authListeners.add(cb);
        this.ready.then(() => cb(this.user));
        return () => this.authListeners.delete(cb);
    }

    /**
     * Signs the lecturer in with the password the server printed.
     * @param {string} _email - not used (one lecturer per server)
     * @param {string} password - the password from the server window
     */
    async signInLecturer(_email, password)
    {
        await this.signIn({ role: 'lecturer', password: password });
    }

    /**
     * Signs a student in with an email that is on the class list.
     * @param {string} email - student email
     */
    async signInStudent(email)
    {
        await this.signIn({ email: email });
    }

    /** Signs out of this tab. */
    async signOut()
    {
        sessionStorage.removeItem(TOKEN_KEY);
        this.token = null;
        this.user = null;
        this.fireAuth();
    }

    // ---------------------------------------------------------- writes
    /** @override */
    async saveRoster(entries)
    {
        await this.act({ type: 'saveRoster', entries: entries });
    }

    /** @override */
    async createSession(title, where)
    {
        return this.act({ type: 'createSession', title: title, where: where });
    }

    /** @override */
    async updateSession(id, fields)
    {
        await this.act({ type: 'updateSession', sid: id, fields: fields });
    }

    /** @override */
    async publishCode(sid, token)
    {
        await this.act({ type: 'publishCode', sid: sid, token: token });
    }

    /**
     * Marks the signed-in student. The server checks the code and decides
     * "in class" or "Zoom" from the distance; offline it waits in the queue.
     * @param {string} sid - session
     * @param {{token:string, lat:number, lng:number, status:string}} rec - scan
     * @returns {Promise<string>} 'present' | 'zoom' (the server's decision) | 'pending' (offline, queued)
     */
    async markMe(sid, rec)
    {
        const mine = ((this.state.sub[sid] || {}).attendance || {})[this.user.email];
        if (mine && !mine.pending)
        {
            throw new Error('already');
        }
        const answer = await this.act({ type: 'markMe', sid: sid, token: rec.token, lat: rec.lat, lng: rec.lng, at: Date.now() });
        return answer === null ? 'pending' : answer;
    }

    /** @override */
    async setAttendance(sid, email, status)
    {
        await this.act({ type: 'setAttendance', sid: sid, email: email, status: status });
    }

    /** @override */
    async addComment(sid, c)
    {
        await this.act({ type: 'addComment', sid: sid, text: c.text, visibility: c.visibility, anonymous: c.anonymous });
    }

    /** @override */
    async createPoll(sid, question, options)
    {
        return this.act({ type: 'createPoll', sid: sid, question: question, options: options });
    }

    /** @override */
    async setPollOpen(sid, pid, open)
    {
        await this.act({ type: 'setPollOpen', sid: sid, pid: pid, open: open });
    }

    /** @override */
    async vote(sid, pid, option)
    {
        await this.act({ type: 'vote', sid: sid, pid: pid, option: option });
    }

    /** @override */
    async addTranscript(sid, index, text)
    {
        await this.act({ type: 'addTranscript', sid: sid, index: index, text: text });
    }

    /** @override */
    async createAssignment(a)
    {
        return this.act({ type: 'createAssignment', assignment: a });
    }

    /** @override */
    async submit(aid, s)
    {
        await this.act({ type: 'submit', aid: aid, repoUrl: s.repoUrl, files: s.files });
    }

    /** @override */
    async updateSubmission(aid, email, fields)
    {
        await this.act({ type: 'updateSubmission', aid: aid, email: email, fields: fields });
    }

    /** @override */
    async resetDemo()
    {
        await this.act({ type: 'resetDemo' });
    }

    /** Nothing to save locally: the server is the database. */
    commit()
    {
        this.notify();
    }

    // ------------------------------------------------- LOW-LEVEL HELPERS
    /**
     * Signs in and starts polling.
     * @param {object} body - sign-in request
     */
    async signIn(body)
    {
        const res = await fetch('/api/signin', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok)
        {
            throw new Error(data.error || 'sign-in failed');
        }
        this.token = data.token;
        sessionStorage.setItem(TOKEN_KEY, data.token);
        this.user = data.user;
        await this.refresh();
        this.fireAuth();
    }

    /**
     * Sends one action. Offline-capable actions are queued when the server
     * cannot be reached; other actions fail with a clear error.
     * @param {object} action - the action
     * @returns {Promise<any>} the server's result
     */
    async act(action)
    {
        let res;
        try
        {
            res = await this.post(action);
        }
        catch (e)
        {
            if (OFFLINE_OK.has(action.type))
            {
                this.enqueue(action);
                return null;
            }
            throw new Error('offline');
        }
        const data = await res.json();
        if (!res.ok)
        {
            throw new Error(data.error || 'error');
        }
        this.accept(data.state);
        return data.result;
    }

    /**
     * POSTs an action with the sign-in token.
     * @param {object} action - the action
     * @returns {Promise<Response>} the response (throws when the server is unreachable)
     */
    post(action)
    {
        return fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.token },
            body: JSON.stringify(action)
        });
    }

    /** Asks the server for the latest state; signs out when the token is no longer valid. */
    async refresh()
    {
        try
        {
            const res = await fetch('/api/state', { headers: { Authorization: 'Bearer ' + this.token } });
            if (res.status === 401)
            {
                await this.signOut();
                return;
            }
            const data = await res.json();
            this.user = data.user;
            this.setOnline(true);
            this.accept(data.state);
            await this.flush();
        }
        catch (e)
        {
            this.setOnline(false);
        }
        if (!this.started)
        {
            this.started = true;
            setInterval(() =>
            {
                if (this.token)
                {
                    this.refresh();
                }
            }, POLL_MS);
        }
    }

    /**
     * Tells the page (offline banner) whether the server answers.
     * @param {boolean} ok - true when the server answered
     */
    setOnline(ok)
    {
        if (ok !== this.online)
        {
            this.online = ok;
            window.dispatchEvent(new CustomEvent('smartclass-server', { detail: ok }));
        }
    }

    /**
     * Takes a new state from the server and shows the queued changes on top of it.
     * @param {object} state - the user's view from the server
     */
    accept(state)
    {
        const queue = readQueue();
        if (state.version === this.state.version && queue.length === 0 && !this.dirty)
        {
            return;                              // nothing new: do not redraw the page every second
        }
        this.dirty = queue.length > 0;
        this.state = state;
        for (const a of queue)
        {
            this.showPending(a);
        }
        this.notify();
    }

    /**
     * Remembers an action to send later and shows it as "waiting to send".
     * @param {object} action - the action
     */
    enqueue(action)
    {
        const q = readQueue();
        q.push(action);
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
        this.showPending(action);
        this.dirty = true;
        this.notify();
    }

    /** Sends the queued actions, in order, when the server answers again. */
    async flush()
    {
        const q = readQueue();
        if (q.length === 0)
        {
            return;
        }
        const left = [];
        for (const a of q)
        {
            try
            {
                const res = await this.post(a);
                const data = await res.json();
                if (res.ok)
                {
                    this.state = data.state;
                }
                // a refused action (e.g. "already") is dropped: the server's answer is final
            }
            catch (e)
            {
                left.push(a);
            }
        }
        localStorage.setItem(QUEUE_KEY, JSON.stringify(left));
        this.accept(this.state);
    }

    /**
     * Shows a queued action in the local state with pending: true.
     * @param {object} a - the action
     */
    showPending(a)
    {
        const sub = this.state.sub[a.sid];
        if (a.type === 'markMe' && sub && !sub.attendance[this.user.email])
        {
            sub.attendance[this.user.email] = {
                email: this.user.email, name: this.user.name, status: 'present', scannedAt: a.at, pending: true
            };
        }
        else if (a.type === 'addComment' && sub)
        {
            sub.comments.push({
                id: 'pending-' + sub.comments.length, text: a.text, visibility: a.visibility, authorUid: this.user.uid,
                authorName: a.anonymous ? null : this.user.name, fromLecturer: false, createdAt: Date.now(), pending: true
            });
        }
        else if (a.type === 'vote' && sub && sub.polls[a.pid])
        {
            sub.polls[a.pid].votes[this.user.uid] = a.option;
        }
    }
}

/**
 * Reads the queue of unsent actions.
 * @returns {object[]} actions
 */
function readQueue()
{
    try
    {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    }
    catch (e)
    {
        return [];
    }
}
