"""Tests for the local server's rules and privacy (the same checks as firestore.rules).

Run:  python -m unittest server/test_server.py
"""

import json
import os
import threading
import unittest
import urllib.error
import urllib.request

os.environ.setdefault("SMARTCLASS_PASSWORD", "test-password")  # do not write lecturer-password.txt

import server as srv  # noqa: E402

LECTURER = {"uid": "lecturer", "email": "lecturer@local", "name": "L", "role": "lecturer"}


def student(email):
    return {"uid": "u-" + email, "email": email, "name": email, "role": "student"}


class RulesTest(unittest.TestCase):
    """apply_action / view_for / sign_in, without HTTP."""

    def setUp(self):
        self.s = srv.empty_state()
        srv.apply_action(self.s, LECTURER, {"type": "saveRoster", "entries": [
            {"first": "D", "last": "L", "id": "1", "email": "Dana@demo", "group": "3", "staff": False},
            {"first": "Y", "last": "C", "id": "2", "email": "yossi@demo", "group": "3", "staff": False},
            {"first": "T", "last": "A", "id": "3", "email": "ta@demo", "group": "", "staff": True}]})
        self.sid = srv.apply_action(self.s, LECTURER, {"type": "createSession", "title": "L1"})
        srv.apply_action(self.s, LECTURER, {"type": "publishCode", "sid": self.sid, "token": "tok"})
        self.dana = student("dana@demo")
        self.yossi = student("yossi@demo")

    def scan(self, who, token="tok"):
        return srv.apply_action(self.s, who, {"type": "markMe", "sid": self.sid, "token": token})

    def test_tc_srv_1_a_real_scan_is_in_class(self):
        """TC-SRV-1: a real code of this lecture = in class (no location); Zoom marks do not exist."""
        self.assertEqual(self.scan(self.dana), "present")
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.yossi, {"type": "markZoom", "sid": self.sid, "digits": "1234"})

    def test_tc_srv_2_fake_code_and_second_scan_are_rejected(self):
        """TC-SRV-2: only a real code of this lecture, and only once."""
        with self.assertRaises(srv.Denied):
            self.scan(self.dana, token="made-up")
        self.scan(self.dana)
        with self.assertRaises(srv.Denied):
            self.scan(self.dana)

    def test_tc_srv_3_student_cannot_do_lecturer_things(self):
        """TC-SRV-3: deny by default for lecturer actions."""
        for a in ({"type": "publishCode", "sid": self.sid, "token": "x"},
                  {"type": "setAttendance", "sid": self.sid, "email": "dana@demo", "status": "manual"},
                  {"type": "saveRoster", "entries": []},
                  {"type": "resetDemo"}):
            with self.assertRaises(srv.Denied):
                srv.apply_action(self.s, self.dana, a)

    def test_tc_srv_4_student_view_hides_secrets(self):
        """TC-SRV-4: no codes, no class list, no other students' records or private comments."""
        self.scan(self.dana)
        self.scan(self.yossi)
        srv.apply_action(self.s, self.yossi, {"type": "addComment", "sid": self.sid, "text": "secret", "visibility": "private"})
        srv.apply_action(self.s, self.yossi, {"type": "addComment", "sid": self.sid, "text": "hello", "visibility": "public"})
        v = srv.view_for(self.s, self.dana)
        sub = v["sub"][self.sid]
        self.assertEqual(sub["codes"], {})
        self.assertEqual(v["roster"], {})
        self.assertEqual(list(sub["attendance"]), ["dana@demo"])
        self.assertEqual([c["text"] for c in sub["comments"]], ["hello"])
        lect = srv.view_for(self.s, LECTURER)
        self.assertEqual(lect["sub"][self.sid]["codes"], {})
        self.assertEqual(len(lect["sub"][self.sid]["comments"]), 2)

    def test_tc_srv_12_old_code_is_refused(self):
        """TC-SRV-12: a code older than the current + previous one (5 s each, + 2 s) is refused."""
        self.s["sub"][self.sid]["codes"]["tok"]["createdAt"] -= srv.CODE_TTL_MS + 1
        with self.assertRaises(srv.Denied):
            self.scan(self.dana)
        srv.apply_action(self.s, LECTURER, {"type": "publishCode", "sid": self.sid, "token": "tok2"})
        self.assertEqual(self.scan(self.dana, token="tok2"), "present")

    def photo(self, v=1):
        boxes = [{"id": i, "x": 0.1 * i, "y": 0.5, "w": 0.05, "h": 0.06} for i in (1, 2, 3)]
        srv.apply_action(self.s, LECTURER, {"type": "savePhoto", "sid": self.sid, "v": v, "aspect": 1.6,
                                            "image": "data:image/jpeg;base64,AAAA", "boxes": boxes})

    def choose(self, who, face, v=1):
        return srv.apply_action(self.s, who, {"type": "chooseFace", "sid": self.sid, "v": v, "face": face})

    def test_tc_srv_13_one_student_per_face(self):
        """TC-SRV-13: scan first; a face can be taken once; one choice per photo; others see WHICH, not WHO."""
        self.photo()
        with self.assertRaises(srv.Denied):
            self.choose(self.dana, 1)                    # did not scan
        self.scan(self.dana)
        self.scan(self.yossi)
        self.choose(self.dana, 1)
        with self.assertRaises(srv.Denied):
            self.choose(self.yossi, 1)                   # taken
        with self.assertRaises(srv.Denied):
            self.choose(self.dana, 2)                    # already chose in this photo
        with self.assertRaises(srv.Denied):
            self.choose(self.yossi, 9)                   # no such box
        self.choose(self.yossi, 2)
        claims = srv.view_for(self.s, self.yossi)["sub"][self.sid]["claims"]
        self.assertEqual(sorted(claims), ["1_1", "1_2"])
        self.assertNotIn("uid", json.dumps(claims))
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.dana, {"type": "savePhoto", "sid": self.sid, "v": 2, "aspect": 1,
                                                 "image": "data:image/jpeg;base64,A", "boxes": []})

    def test_tc_srv_14_not_in_photo_new_photo_and_freeing(self):
        """TC-SRV-14: "not in the photo" can still choose later; a new photo asks again; the lecturer frees a box."""
        self.photo()
        self.scan(self.dana)
        self.choose(self.dana, srv.NOT_FOUND)
        self.choose(self.dana, 3)                        # found herself after all
        self.photo(v=2)
        self.choose(self.dana, 3, v=2)                   # new photo: choose again
        srv.apply_action(self.s, LECTURER, {"type": "freeFace", "sid": self.sid, "v": 2, "face": 3, "email": "dana@demo"})
        me = self.s["sub"][self.sid]["attendance"]["dana@demo"]
        self.assertIsNone(me["face"])
        self.scan(self.yossi)
        self.choose(self.yossi, 3, v=2)                  # the freed box can be taken

    def test_tc_srv_15_box_request(self):
        """TC-SRV-15: no box on me -> request; one open at a time; accepted = new box + mine; refused can retry."""
        self.photo()
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.dana, {"type": "requestBox", "sid": self.sid, "v": 1,
                                                 "box": {"x": 0.9, "y": 0.5, "w": 0.2, "h": 0.06}})   # did not scan
        self.scan(self.dana)
        req = {"type": "requestBox", "sid": self.sid, "v": 1, "box": {"x": 0.97, "y": 0.5, "w": 0.05, "h": 0.06}}
        srv.apply_action(self.s, self.dana, req)
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.dana, req)                     # one open request
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.dana, {"type": "resolveBoxRequest", "sid": self.sid, "email": "dana@demo", "ok": True})
        srv.apply_action(self.s, LECTURER, {"type": "resolveBoxRequest", "sid": self.sid, "email": "dana@demo",
                                            "ok": False, "reason": "AI: no person seen"})
        srv.apply_action(self.s, self.dana, req)                         # refused: may try again
        new_id = srv.apply_action(self.s, LECTURER, {"type": "resolveBoxRequest", "sid": self.sid, "email": "dana@demo",
                                                     "ok": True, "reason": "AI: a person is there"})
        sub = self.s["sub"][self.sid]
        self.assertEqual(new_id, 4)
        self.assertEqual(sub["attendance"]["dana@demo"]["face"], 4)
        self.assertIn("1_4", sub["claims"])
        self.assertEqual(len(sub["photo"]["boxes"]), 4)
        view = srv.view_for(self.s, self.yossi)["sub"][self.sid]
        self.assertEqual(view["requests"], {})                           # others' requests are hidden

    def test_tc_srv_16_quiz(self):
        """TC-SRV-16: quiz key hidden from students; answers only while the question is open, once, in time."""
        qid = srv.apply_action(self.s, LECTURER, {"type": "createQuiz", "sid": self.sid, "quiz": {"title": "Q", "questions": [
            {"q": "2+2?", "options": ["3", "4"], "correct": 1, "seconds": 20}]}})
        view = srv.view_for(self.s, self.dana)["sub"][self.sid]
        self.assertNotIn("quizKeys", view)
        self.assertNotIn("correct", json.dumps(view["quizzes"][qid]["questions"]))
        answer = {"type": "answerQuiz", "sid": self.sid, "qid": qid, "index": 0, "option": 1}
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.dana, answer)                  # still in the lobby
        st = {"phase": "question", "index": 0, "startedAt": "now", "correct": -1, "starts": [], "top": [], "scores": {}}
        srv.apply_action(self.s, LECTURER, {"type": "setQuizState", "sid": self.sid, "qid": qid, "state": st})
        srv.apply_action(self.s, self.dana, answer)
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.dana, answer)                  # once
        self.s["sub"][self.sid]["quizzes"][qid]["state"]["startedAt"] -= 23_000
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.yossi, answer)                 # too late
        self.assertEqual(srv.apply_action(self.s, LECTURER, {"type": "quizKey", "sid": self.sid, "qid": qid}), [1])
        self.assertEqual(len(srv.view_for(self.s, self.yossi)["sub"][self.sid]["quizzes"][qid]["answers"]), 0)

    def test_tc_srv_5_vote_once_while_open(self):
        """TC-SRV-5: one vote per student; none after closing."""
        pid = srv.apply_action(self.s, LECTURER, {"type": "createPoll", "sid": self.sid, "question": "q", "options": ["a", "b"]})
        srv.apply_action(self.s, self.dana, {"type": "vote", "sid": self.sid, "pid": pid, "option": 1})
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.dana, {"type": "vote", "sid": self.sid, "pid": pid, "option": 0})
        srv.apply_action(self.s, LECTURER, {"type": "setPollOpen", "sid": self.sid, "pid": pid, "open": False})
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.yossi, {"type": "vote", "sid": self.sid, "pid": pid, "option": 0})
        v = srv.view_for(self.s, self.yossi)
        self.assertEqual(v["sub"][self.sid]["polls"][pid]["votes"], {})

    def test_tc_srv_6_submission_links_must_be_http(self):
        """TC-SRV-6: no javascript: links in submissions."""
        aid = srv.apply_action(self.s, LECTURER, {"type": "createAssignment", "assignment": {"title": "Ex2"}})
        with self.assertRaises(srv.Denied):
            srv.apply_action(self.s, self.dana, {"type": "submit", "aid": aid, "repoUrl": "javascript:alert(1)", "files": []})
        srv.apply_action(self.s, self.dana, {"type": "submit", "aid": aid, "repoUrl": "https://github.com/a/b", "files": []})
        self.assertEqual(srv.view_for(self.s, self.yossi)["assignments"][aid]["submissions"], {})

    def test_tc_srv_7_sign_in(self):
        """TC-SRV-7: students only from the list (case-insensitive), staff rows and strangers refused."""
        self.assertEqual(srv.sign_in(self.s, {"email": "DANA@demo"})["role"], "student")
        with self.assertRaises(srv.Denied):
            srv.sign_in(self.s, {"email": "ta@demo"})
        with self.assertRaises(srv.Denied):
            srv.sign_in(self.s, {"email": "stranger@x.com"})
        with self.assertRaises(srv.Denied):
            srv.sign_in(self.s, {"role": "lecturer", "password": "wrong"})


class HttpTest(unittest.TestCase):
    """The real HTTP API (plain HTTP on a free port)."""

    @classmethod
    def setUpClass(cls):
        srv.STATE.clear()
        srv.STATE.update(srv.empty_state())
        srv.DATA_FILE = srv.HERE / "test-data.json"
        srv.TOKENS_FILE = srv.HERE / "test-tokens.json"
        cls.httpd = srv.make_server(0, use_tls=False)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        srv.DATA_FILE.unlink(missing_ok=True)
        srv.TOKENS_FILE.unlink(missing_ok=True)

    def call(self, path, body=None, token=None):
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{path}",
                                     data=None if body is None else json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
        if token:
            req.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_tc_srv_8_full_flow_over_http(self):
        """TC-SRV-8: sign in, import, open, scan, see; unauthenticated calls refused."""
        self.assertEqual(self.call("/api/state")[0], 401)
        code, r = self.call("/api/signin", {"role": "lecturer", "password": srv.LECTURER_PASSWORD})
        self.assertEqual(code, 200)
        lt = r["token"]
        self.call("/api/action", {"type": "saveRoster", "entries": [
            {"first": "D", "last": "L", "id": "1", "email": "dana@demo", "group": "3", "staff": False}]}, lt)
        _, r = self.call("/api/action", {"type": "createSession", "title": "L1"}, lt)
        sid = r["result"]
        self.call("/api/action", {"type": "publishCode", "sid": sid, "token": "t1"}, lt)
        _, r = self.call("/api/signin", {"email": "dana@demo"})
        st = r["token"]
        code, r = self.call("/api/action", {"type": "markMe", "sid": sid, "token": "t1"}, st)
        self.assertEqual((code, r["result"]), (200, "present"))
        code, r = self.call("/api/action", {"type": "markMe", "sid": sid, "token": "t1"}, st)
        self.assertEqual((code, r["error"]), (403, "already"))
        _, r = self.call("/api/state", token=lt)
        self.assertEqual(r["state"]["sub"][sid]["attendance"]["dana@demo"]["status"], "present")

    def test_tc_srv_11_ai_key_file_only_for_this_pc(self):
        """TC-SRV-11: the local AI key file is served to the lecturer's PC only (here: 127.0.0.1)."""
        key_file = srv.WEB / "js" / "ai-key.local.js"
        made = not key_file.exists()
        if made:
            key_file.write_text("export const GEMINI_KEY = 'test';", encoding="utf-8")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{self.port}/js/ai-key.local.js") as r:
                self.assertEqual(r.status, 200)
            handler = srv.Handler.__new__(srv.Handler)
            handler.client_address = ("192.168.1.20", 5555)
            handler.path = "/js/ai-key.local.js"
            sent = {}
            handler.reply = lambda code, body: sent.update(code=code)
            handler.do_GET()
            self.assertEqual(sent["code"], 404)
        finally:
            if made:
                key_file.unlink()

    def test_tc_srv_9_sign_in_survives_a_restart(self):
        """TC-SRV-9: tokens are saved, so phones stay signed in when the PC restarts the server."""
        _, r = self.call("/api/signin", {"role": "lecturer", "password": srv.LECTURER_PASSWORD})
        srv.TOKENS.clear()
        srv.load_tokens()
        self.assertEqual(self.call("/api/state", token=r["token"])[0], 200)


if __name__ == "__main__":
    unittest.main()
