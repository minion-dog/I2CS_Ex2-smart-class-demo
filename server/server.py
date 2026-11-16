"""SmartClass local server: run the whole system on your own Wi-Fi, no Firebase needed.

Start it on the lecturer's PC:   py server/server.py        (or: python server/server.py)
Then open the address it prints, on the PC (lecturer) and on phones (students).

What it does:
  * serves the website (the web/ folder) over HTTPS - phones only allow the camera
    on secure sites, so plain http would not work for scanning;
  * keeps the shared data (class list, lectures, attendance, comments, polls,
    transcript, assignments) in memory and in server/data.json;
  * checks everything itself, like the Firestore rules do on the real system:
    a scan needs a real code of that lecture and counts once per student
    (decision: a valid live scan = in class; no location, no Zoom attendance);
  * sends each user only what they may see (a student never gets the secret
    codes, other students' records or private comments).

Only the Python standard library is used. The HTTPS certificate is a self-signed
demo certificate (server/demo-cert.pem): the browser warns once, you tap
"Advanced -> Proceed", and then everything works. It is for a local demo only.
"""

from __future__ import annotations

import json
import os
import secrets
import socket
import ssl
import sys
import threading
import time
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
#  CONSTANTS & STATE
# ---------------------------------------------------------------------------

HERE = Path(__file__).resolve().parent
WEB = HERE.parent / "web"
DATA_FILE = HERE / "data.json"
CERT = HERE / "demo-cert.pem"
KEY = HERE / "demo-key.pem"
TOKENS_FILE = HERE / "tokens.json"             # sign-ins survive a restart of the server
PASSWORD_FILE = HERE / "lecturer-password.txt"
PORT = 8443
PORT_TRIES = 20                                 # 8443, 8444, ... if the port is taken

MAX_COMMENT = 2000
MAX_FILES = 20
MAX_BODY = 2 * 1024 * 1024      # 2 MB per request (submissions are text files)

LOCK = threading.Lock()
STATE: dict[str, Any] = {}
TOKENS: dict[str, dict[str, Any]] = {}      # login token -> user


def lecturer_password() -> str:
    """The lecturer password: from SMARTCLASS_PASSWORD, else made once and kept in lecturer-password.txt."""
    if os.environ.get("SMARTCLASS_PASSWORD"):
        return os.environ["SMARTCLASS_PASSWORD"]
    try:
        saved = PASSWORD_FILE.read_text(encoding="utf-8").strip()
        if saved:
            return saved
    except OSError:
        pass
    made = f"{secrets.randbelow(10**6):06d}"
    try:
        PASSWORD_FILE.write_text(made, encoding="utf-8")
    except OSError:
        pass
    return made


LECTURER_PASSWORD = lecturer_password()


def empty_state() -> dict[str, Any]:
    """Returns a new, empty database (same shape as the website's demo store)."""
    return {"version": 0, "roster": {}, "sessions": {}, "sub": {}, "assignments": {}}


def load() -> None:
    """Loads server/data.json, or starts empty."""
    global STATE
    try:
        STATE = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        STATE = empty_state()


def load_tokens() -> None:
    """Loads the saved sign-ins (so phones stay signed in after a restart)."""
    try:
        TOKENS.update(json.loads(TOKENS_FILE.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass


def save_tokens() -> None:
    """Saves the sign-ins."""
    try:
        TOKENS_FILE.write_text(json.dumps(TOKENS, ensure_ascii=False), encoding="utf-8")
    except OSError:
        pass


def save() -> None:
    """Writes the database to server/data.json (atomically)."""
    tmp = DATA_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(STATE, ensure_ascii=False), encoding="utf-8")
    tmp.replace(DATA_FILE)


# ---------------------------------------------------------------------------
#  RULES (the same checks as firestore.rules)
# ---------------------------------------------------------------------------


class Denied(Exception):
    """An action the rules do not allow."""


def new_id(prefix: str) -> str:
    """Returns a short random id."""
    return prefix + secrets.token_hex(5)


SESSION_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"   # the same as CODE.ALPHABET in payload.js


def new_session_id() -> str:
    """A lecture id of 10 capitals/digits, so the QR text stays short (see payload.js)."""
    return "".join(secrets.choice(SESSION_ALPHABET) for _ in range(10))


def now_ms() -> int:
    """Returns the time in milliseconds."""
    return int(time.time() * 1000)


def require(cond: bool, why: str) -> None:
    """Raises Denied(why) unless cond holds."""
    if not cond:
        raise Denied(why)


def apply_action(state: dict[str, Any], user: dict[str, Any], a: dict[str, Any]) -> Any:
    """Applies one action for one user, after checking the rules.

    Returns a small result (an id) or None. Raises Denied for anything not allowed.
    """
    kind = a.get("type")
    lecturer = user["role"] == "lecturer"
    student = user["role"] == "student"

    # ----- class list
    if kind == "saveRoster":
        require(lecturer, "lecturer only")
        state["roster"] = {}
        for e in a["entries"]:
            email = str(e.get("email", "")).strip().lower()
            if email:
                state["roster"][email] = {**e, "email": email}
        return len(state["roster"])

    # ----- lectures
    if kind == "createSession":
        require(lecturer, "lecturer only")
        sid = new_session_id()
        state["sessions"][sid] = {
            "id": sid, "title": str(a["title"])[:200], "startedAt": now_ms(), "endedAt": None,
            "summary": None, "headcount": None,
        }
        state["sub"][sid] = {"codes": {}, "attendance": {}, "comments": [], "polls": {}, "transcript": {}}
        return sid
    if kind == "updateSession":
        require(lecturer, "lecturer only")
        s = state["sessions"][a["sid"]]
        for k in ("endedAt", "summary", "headcount", "title"):
            if k in a["fields"]:
                s[k] = a["fields"][k]
        return None
    if kind == "publishCode":
        require(lecturer, "lecturer only")
        token = str(a["token"])
        state["sub"][a["sid"]]["codes"][token] = {"createdAt": now_ms()}
        return None

    # ----- attendance
    if kind == "markMe":
        # Decision: attendance is physical only. Only someone in the room can film the
        # flicker QR live, so a real code of THIS lecture = in class. No location.
        require(student, "students only")
        sid = a["sid"]
        require(sid in state["sessions"], "bad-code")
        sub = state["sub"][sid]
        token = str(a["token"])
        require(token in sub["codes"], "bad-code")
        require(user["email"] not in sub["attendance"], "already")      # once per lecture
        sub["attendance"][user["email"]] = {
            "email": user["email"], "uid": user["uid"], "name": user["name"], "status": "present",
            "token": token, "scannedAt": int(a.get("at") or now_ms()),
        }
        return "present"
    if kind == "setAttendance":
        require(lecturer, "lecturer only")
        att = state["sub"][a["sid"]]["attendance"]
        email = str(a["email"]).lower()
        if a.get("status") is None:
            att.pop(email, None)
        else:
            require(a["status"] in ("present", "zoom", "manual"), "bad status")
            old = att.get(email, {"email": email, "name": email})
            att[email] = {**old, "status": a["status"], "scannedAt": now_ms()}
        return None

    # ----- comments
    if kind == "addComment":
        require(lecturer or student, "sign in first")
        text = str(a["text"]).strip()
        require(0 < len(text) <= MAX_COMMENT, "comment length")
        require(a["visibility"] in ("public", "private"), "visibility")
        state["sub"][a["sid"]]["comments"].append({
            "id": new_id("c"), "text": text, "visibility": a["visibility"], "authorUid": user["uid"],
            "authorName": None if a.get("anonymous") else user["name"],
            "fromLecturer": lecturer, "createdAt": now_ms(),
        })
        return None

    # ----- polls
    if kind == "createPoll":
        require(lecturer, "lecturer only")
        options = [str(o)[:200] for o in a["options"]][:6]
        require(len(options) >= 2, "two answers at least")
        pid = new_id("p")
        state["sub"][a["sid"]]["polls"][pid] = {
            "id": pid, "question": str(a["question"])[:500], "options": options,
            "open": True, "createdAt": now_ms(), "votes": {},
        }
        return pid
    if kind == "setPollOpen":
        require(lecturer, "lecturer only")
        state["sub"][a["sid"]]["polls"][a["pid"]]["open"] = bool(a["open"])
        return None
    if kind == "vote":
        require(student, "students only")
        poll = state["sub"][a["sid"]]["polls"][a["pid"]]
        require(poll["open"], "closed")
        require(user["uid"] not in poll["votes"], "already")
        option = int(a["option"])
        require(0 <= option < len(poll["options"]), "bad option")
        poll["votes"][user["uid"]] = option
        return None

    # ----- transcript
    if kind == "addTranscript":
        require(lecturer, "lecturer only")
        idx = int(a["index"])
        state["sub"][a["sid"]]["transcript"][str(idx)] = {"index": idx, "text": str(a["text"])}
        return None

    # ----- assignments
    if kind == "createAssignment":
        require(lecturer, "lecturer only")
        aid = new_id("a")
        x = a["assignment"]
        state["assignments"][aid] = {
            "id": aid, "title": str(x["title"])[:200], "requirements": str(x.get("requirements", "")),
            "due": str(x.get("due", "")), "createdAt": now_ms(), "submissions": {},
        }
        return aid
    if kind == "submit":
        require(student, "students only")
        url = str(a.get("repoUrl", "")).strip()
        require(url == "" or url.lower().startswith(("http://", "https://")), "link must be http(s)")
        files = a.get("files", [])
        require(isinstance(files, list) and len(files) <= MAX_FILES, "too many files")
        subs = state["assignments"][a["aid"]]["submissions"]
        old = subs.get(user["email"], {})
        subs[user["email"]] = {
            **old, "email": user["email"], "name": user["name"], "repoUrl": url,
            "files": [{"name": str(f["name"]), "text": str(f["text"])} for f in files],
            "submittedAt": now_ms(),
        }
        return None
    if kind == "updateSubmission":
        require(lecturer, "lecturer only")
        sub = state["assignments"][a["aid"]]["submissions"][a["email"]]
        for k in ("review", "grade", "feedback"):
            if k in a["fields"]:
                sub[k] = a["fields"][k]
        return None

    if kind == "resetDemo":
        require(lecturer, "lecturer only")
        fresh = empty_state()
        fresh["version"] = state["version"]
        state.clear()
        state.update(fresh)
        return None

    raise Denied(f"unknown action {kind!r}")


def view_for(state: dict[str, Any], user: dict[str, Any]) -> dict[str, Any]:
    """Returns the part of the database this user may see.

    Lecturer: everything except the secret codes. Student: no class list, no codes,
    only their own attendance, public + own comments, only their own votes and
    submissions.
    """
    if user["role"] == "lecturer":
        v = json.loads(json.dumps(state))
        for sub in v["sub"].values():
            sub["codes"] = {}
        return v
    me, uid = user["email"], user["uid"]
    out: dict[str, Any] = {"version": state["version"], "roster": {}, "sessions": state["sessions"],
                           "sub": {}, "assignments": {}}
    for sid, sub in state["sub"].items():
        out["sub"][sid] = {
            "codes": {},
            "attendance": {k: r for k, r in sub["attendance"].items() if k == me},
            "comments": [c for c in sub["comments"] if c["visibility"] == "public" or c["authorUid"] == uid],
            "polls": {pid: {**p, "votes": {k: o for k, o in p["votes"].items() if k == uid}}
                      for pid, p in sub["polls"].items()},
            "transcript": sub["transcript"],
        }
    for aid, a in state["assignments"].items():
        out["assignments"][aid] = {**a, "submissions": {k: s for k, s in a["submissions"].items() if k == me}}
    return out


def sign_in(state: dict[str, Any], body: dict[str, Any]) -> dict[str, Any]:
    """Signs in: the lecturer with the password printed at start, a student with an email on the list."""
    if body.get("role") == "lecturer":
        require(secrets.compare_digest(str(body.get("password", "")), LECTURER_PASSWORD), "wrong password")
        return {"uid": "lecturer", "email": "lecturer@local", "name": "המרצה", "role": "lecturer"}
    email = str(body.get("email", "")).strip().lower()
    entry = state["roster"].get(email)
    require(entry is not None and not entry.get("staff"), "not-on-list")
    return {"uid": "u-" + email, "email": email, "name": f"{entry['first']} {entry['last']}", "role": "student"}


# ---------------------------------------------------------------------------
#  HTTP
# ---------------------------------------------------------------------------


class Handler(SimpleHTTPRequestHandler):
    """Static files from web/ + the small JSON API under /api/."""

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(WEB), **kwargs)

    def log_message(self, fmt: str, *args: Any) -> None:  # quiet console
        pass

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def guess_type(self, path: str) -> str:
        if str(path).endswith(".js"):
            return "text/javascript; charset=utf-8"
        if str(path).endswith(".webmanifest"):
            return "application/manifest+json"
        return super().guess_type(path)

    # ----- API
    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        if self.path.startswith("/api/state"):
            user = self.user()
            if user is None:
                return self.reply(HTTPStatus.UNAUTHORIZED, {"error": "sign in"})
            with LOCK:
                return self.reply(HTTPStatus.OK, {"user": user, "state": view_for(STATE, user)})
        if self.path.startswith("/api/info"):
            return self.reply(HTTPStatus.OK, {"server": "smartclass", "urls": urls()})
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.reply(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, {"error": "too large"})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return self.reply(HTTPStatus.BAD_REQUEST, {"error": "bad json"})
        if self.path == "/api/signin":
            with LOCK:
                try:
                    user = sign_in(STATE, body)
                except Denied as e:
                    return self.reply(HTTPStatus.FORBIDDEN, {"error": str(e)})
            token = secrets.token_urlsafe(24)
            with LOCK:
                TOKENS[token] = user
                save_tokens()
            return self.reply(HTTPStatus.OK, {"token": token, "user": user})
        if self.path == "/api/action":
            user = self.user()
            if user is None:
                return self.reply(HTTPStatus.UNAUTHORIZED, {"error": "sign in"})
            with LOCK:
                try:
                    result = apply_action(STATE, user, body)
                except Denied as e:
                    return self.reply(HTTPStatus.FORBIDDEN, {"error": str(e)})
                except (KeyError, TypeError, ValueError) as e:
                    return self.reply(HTTPStatus.BAD_REQUEST, {"error": f"bad request: {e}"})
                STATE["version"] += 1
                save()
                return self.reply(HTTPStatus.OK, {"result": result, "state": view_for(STATE, user)})
        return self.reply(HTTPStatus.NOT_FOUND, {"error": "no such api"})

    def user(self) -> dict[str, Any] | None:
        """Returns the signed-in user of this request (Bearer token), or None."""
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        return TOKENS.get(auth[7:])

    def reply(self, code: int, obj: Any) -> None:
        """Sends a JSON answer."""
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def lan_ip() -> str:
    """Returns this computer's address on the Wi-Fi (no packet is sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def urls() -> dict[str, str]:
    """Addresses for the PC and for phones."""
    return {"pc": f"https://localhost:{PORT}/?lan=1", "phones": f"https://{lan_ip()}:{PORT}/?lan=1"}


def make_server(port: int, use_tls: bool = True) -> ThreadingHTTPServer:
    """Creates the server (HTTPS with the demo certificate, or plain HTTP for tests)."""
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    if use_tls:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=str(CERT), keyfile=str(KEY))
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    return httpd


def main() -> None:
    """Starts the server and prints the addresses and the lecturer password."""
    global PORT
    numbers = [a for a in sys.argv[1:] if a.isdigit()]
    if numbers:
        PORT = int(numbers[0])
    load()
    load_tokens()
    httpd = None
    last_error: OSError | None = None
    first = PORT
    for port in range(first, first + PORT_TRIES):
        try:
            httpd = make_server(port, use_tls="--http" not in sys.argv)
            PORT = port
            break
        except OSError as e:
            last_error = e
    if httpd is None:
        print(f"Could not open a port {first}-{first + PORT_TRIES - 1}: {last_error}")
        return
    u = urls()
    print("SmartClass local server is running. Keep this window open; close it to stop.\n")
    print(f"  Lecturer (this PC):  {u['pc']}")
    print(f"  Students (phones on the same Wi-Fi):  {u['phones']}")
    print(f"  Lecturer password:  {LECTURER_PASSWORD}\n")
    print('The browser will warn "not secure" once (demo certificate): Advanced -> Proceed.')
    print("If Windows asks about the firewall: allow on PRIVATE networks.")
    if "--no-browser" not in sys.argv:
        webbrowser.open(u["pc"])
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
