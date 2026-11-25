package il.ac.ariel.smartclass.data;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.gms.tasks.OnCompleteListener;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.EventListener;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.MetadataChanges;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.QueryDocumentSnapshot;
import com.google.firebase.firestore.QuerySnapshot;
import com.google.firebase.firestore.SetOptions;
import com.google.firebase.firestore.WriteBatch;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import il.ac.ariel.smartclass.core.AttendanceSheet;
import il.ac.ariel.smartclass.core.Faces;
import il.ac.ariel.smartclass.core.Payload;
import il.ac.ariel.smartclass.core.Reactions;
import il.ac.ariel.smartclass.core.SessionInfo;
import il.ac.ariel.smartclass.core.Student;

/**
 * The app's only door to Firebase (the same collections and fields as the website's
 * web/js/data/firebase-store.js, so the app and the site share one database).
 *
 * Firestore on Android keeps an offline cache by default: a scan, comment, quiz answer or
 * submission made without internet is saved on the phone and sent automatically when the
 * connection returns (decision Q6). The security rules (firestore.rules) are what really
 * protect the data; this class only makes the calls the rules allow.
 */
public final class Repo
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Role: a staff/{uid} document exists. */
    public static final String LECTURER = "lecturer";

    /** Role: the email is on the class list. */
    public static final String STUDENT = "student";

    /** Role: signed in, but not on the class list. */
    public static final String NOT_ON_LIST = "not-on-list";

    /** Firestore allows 500 writes per batch; we stay below. */
    private static final int BATCH_LIMIT = 400;

    /** The one instance. */
    private static Repo instance;

    /** Database. */
    private final FirebaseFirestore db = FirebaseFirestore.getInstance();

    /** Sign-in. */
    private final FirebaseAuth auth = FirebaseAuth.getInstance();

    /** The resolved role of the signed-in user. */
    private String role = NOT_ON_LIST;

    /**
     * Receives a live value every time it changes.
     * @param <T> Value type.
     */
    public interface Listener<T>
    {
        /**
         * Called with the new value.
         * @param (T) value The value.
         */
        void onChange(T value);
    }

    /**
     * Receives the result of a one-time operation.
     * @param <T> Value type.
     */
    public interface Done<T>
    {
        /**
         * Called once.
         * @param (T) value The result, or null on error.
         * @param (Exception) error The error, or null on success.
         */
        void onDone(@Nullable T value, @Nullable Exception error);
    }

    /** Creates the repository. */
    private Repo()
    {
    }

    /**
     * Returns the one repository.
     * @return (Repo) The instance.
     */
    public static synchronized Repo get()
    {
        if (instance == null)
        {
            instance = new Repo();
        }
        return instance;
    }

    // ==========================================
    //              USER AND ROLE
    // ==========================================

    /**
     * Returns the signed-in user.
     * @return (FirebaseUser) The user, or null.
     */
    public FirebaseUser user()
    {
        return auth.getCurrentUser();
    }

    /**
     * Returns the signed-in user's email in lower case.
     * @return (String) Email, or "".
     */
    public String myEmail()
    {
        FirebaseUser u = user();
        if (u == null || u.getEmail() == null)
        {
            return "";
        }
        return u.getEmail().toLowerCase(Locale.ROOT);
    }

    /**
     * Returns the signed-in user's display name.
     * @return (String) Name, or the email.
     */
    public String myName()
    {
        FirebaseUser u = user();
        if (u != null && u.getDisplayName() != null && !u.getDisplayName().isEmpty())
        {
            return u.getDisplayName();
        }
        return myEmail();
    }

    /**
     * Returns the role found by {@link #resolveRole}.
     * @return (String) LECTURER, STUDENT or NOT_ON_LIST.
     */
    public String role()
    {
        return role;
    }

    /**
     * Tells whether the signed-in user is the lecturer.
     * @return (boolean) True for the lecturer.
     */
    public boolean isLecturer()
    {
        return LECTURER.equals(role);
    }

    /**
     * Finds out who the signed-in account is. Lecturer = staff/{uid} exists. Student = may
     * read sessions (the rules allow that only for emails on the class list).
     * @param (Done&lt;String&gt;) done Receives the role.
     */
    public void resolveRole(final Done<String> done)
    {
        final FirebaseUser u = user();
        if (u == null)
        {
            done.onDone(null, new IllegalStateException("not signed in"));
            return;
        }
        db.collection("staff").document(u.getUid()).get().addOnCompleteListener(new OnCompleteListener<DocumentSnapshot>()
        {
            @Override
            public void onComplete(@NonNull Task<DocumentSnapshot> t)
            {
                if (t.isSuccessful() && t.getResult() != null && t.getResult().exists())
                {
                    role = LECTURER;
                    done.onDone(role, null);
                    return;
                }
                probeStudent(u, done);
            }
        });
    }

    /**
     * Checks the student role by reading one session; on success saves the profile.
     * @param (FirebaseUser) u The user.
     * @param (Done&lt;String&gt;) done Receives the role.
     */
    private void probeStudent(final FirebaseUser u, final Done<String> done)
    {
        db.collection("sessions").limit(1).get().addOnCompleteListener(new OnCompleteListener<QuerySnapshot>()
        {
            @Override
            public void onComplete(@NonNull Task<QuerySnapshot> t)
            {
                if (!t.isSuccessful())
                {
                    role = NOT_ON_LIST;
                    done.onDone(role, null);
                    return;
                }
                role = STUDENT;
                Map<String, Object> profile = new HashMap<String, Object>();
                profile.put("email", myEmail());
                profile.put("name", myName());
                profile.put("lastSeen", FieldValue.serverTimestamp());
                db.collection("users").document(u.getUid()).set(profile, SetOptions.merge());
                done.onDone(role, null);
            }
        });
    }

    /** Signs out. */
    public void signOut()
    {
        role = NOT_ON_LIST;
        auth.signOut();
    }

    // ==========================================
    //               CLASS LIST
    // ==========================================

    /**
     * Replaces the class list (lecturer); students no longer on the list are removed.
     * @param (List&lt;Student&gt;) entries The new list.
     * @param (Done&lt;Integer&gt;) done Receives the number saved.
     */
    public void saveRoster(final List<Student> entries, final Done<Integer> done)
    {
        db.collection("roster").get().addOnCompleteListener(new OnCompleteListener<QuerySnapshot>()
        {
            @Override
            public void onComplete(@NonNull Task<QuerySnapshot> t)
            {
                if (!t.isSuccessful())
                {
                    done.onDone(null, t.getException());
                    return;
                }
                Set<String> keep = new HashSet<String>();
                List<Task<Void>> commits = new ArrayList<Task<Void>>();
                WriteBatch batch = db.batch();
                int n = 0;
                for (Student s : entries)
                {
                    keep.add(s.email());
                    batch.set(db.collection("roster").document(s.email()), studentMap(s));
                    n++;
                    if (n % BATCH_LIMIT == 0)
                    {
                        commits.add(batch.commit());
                        batch = db.batch();
                    }
                }
                for (QueryDocumentSnapshot d : t.getResult())
                {
                    if (!keep.contains(d.getId()))
                    {
                        batch.delete(d.getReference());
                    }
                }
                commits.add(batch.commit());
                Tasks.whenAll(commits).addOnCompleteListener(new OnCompleteListener<Void>()
                {
                    @Override
                    public void onComplete(@NonNull Task<Void> all)
                    {
                        if (all.isSuccessful())
                        {
                            done.onDone(entries.size(), null);
                        }
                        else
                        {
                            done.onDone(null, all.getException());
                        }
                    }
                });
            }
        });
    }

    /**
     * Returns the class list (lecturer), sorted by last name.
     * @param (Done&lt;List&lt;Student&gt;&gt;) done Receives the list.
     */
    public void listRoster(final Done<List<Student>> done)
    {
        db.collection("roster").get().addOnCompleteListener(new OnCompleteListener<QuerySnapshot>()
        {
            @Override
            public void onComplete(@NonNull Task<QuerySnapshot> t)
            {
                if (!t.isSuccessful())
                {
                    done.onDone(null, t.getException());
                    return;
                }
                List<Student> out = new ArrayList<Student>();
                for (QueryDocumentSnapshot d : t.getResult())
                {
                    out.add(new Student(str(d, "first"), str(d, "last"), str(d, "id"), d.getId(), str(d, "group")));
                }
                Collections.sort(out, new Comparator<Student>()
                {
                    @Override
                    public int compare(Student a, Student b)
                    {
                        return (a.last() + " " + a.first()).compareTo(b.last() + " " + b.first());
                    }
                });
                done.onDone(out, null);
            }
        });
    }

    // ==========================================
    //                 SESSIONS
    // ==========================================

    /**
     * Reads the built-in AI key (config/ai.geminiKey). The security rules let only the
     * lecturer read it, so students never can.
     * @param (Done&lt;String&gt;) done Receives the key, or "" when it is not set.
     */
    public void loadAiKey(final Done<String> done)
    {
        db.collection("config").document("ai").get().addOnCompleteListener(new OnCompleteListener<DocumentSnapshot>()
        {
            @Override
            public void onComplete(@NonNull Task<DocumentSnapshot> t)
            {
                if (t.isSuccessful() && t.getResult() != null && t.getResult().exists())
                {
                    String key = t.getResult().getString("geminiKey");
                    done.onDone(key == null ? "" : key, null);
                }
                else
                {
                    done.onDone("", t.getException());
                }
            }
        });
    }

    /**
     * Opens a lecture (lecturer). The id is short capitals/digits so the QR stays small.
     * No location: attendance is the live scan (decision: physical attendance only).
     * @param (String) title Name.
     * @param (Done&lt;String&gt;) done Receives the session id.
     */
    public void createSession(String title, final Done<String> done)
    {
        final DocumentReference ref = db.collection("sessions").document(Payload.newSessionId());
        Map<String, Object> s = new HashMap<String, Object>();
        s.put("title", title);
        s.put("startedAt", System.currentTimeMillis());
        s.put("endedAt", null);
        s.put("summary", null);
        s.put("headcount", null);
        ref.set(s).addOnCompleteListener(new OnCompleteListener<Void>()
        {
            @Override
            public void onComplete(@NonNull Task<Void> t)
            {
                if (t.isSuccessful())
                {
                    done.onDone(ref.getId(), null);
                }
                else
                {
                    done.onDone(null, t.getException());
                }
            }
        });
    }

    /**
     * Updates session fields (lecturer): end time, summary.
     * @param (String) sid Session.
     * @param (Map&lt;String, Object&gt;) fields Fields to set.
     */
    public void updateSession(String sid, Map<String, Object> fields)
    {
        db.collection("sessions").document(sid).update(fields);
    }

    /**
     * Watches all sessions, newest first.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives the list.
     * @return (ListenerRegistration) Call remove() to stop.
     */
    public ListenerRegistration listenSessions(Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("sessions").orderBy("startedAt", Query.Direction.DESCENDING), l);
    }

    // ==========================================
    //                ATTENDANCE
    // ==========================================

    /**
     * Stores the current secret QR token (lecturer).
     * @param (String) sid Session.
     * @param (String) token Token.
     */
    public void publishCode(String sid, String token)
    {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("createdAt", FieldValue.serverTimestamp());     // the rules compare with the server's clock (12 s)
        db.collection("sessions").document(sid).collection("codes").document(token).set(m);
    }

    /**
     * Marks the signed-in student as in class (a live scan of the flicker code). Not waited
     * for: offline it is saved on the phone and sent later; the security rules check the
     * token when it arrives. The screen watches the student's own record ("waiting to send").
     * @param (String) sid Session.
     * @param (String) token Scanned token.
     */
    public void markMe(String sid, String token)
    {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("email", myEmail());
        m.put("uid", user().getUid());
        m.put("name", myName());
        m.put("status", AttendanceSheet.PRESENT);
        m.put("token", token);
        m.put("scannedAt", System.currentTimeMillis());
        db.collection("sessions").document(sid).collection("attendance").document(myEmail()).set(m);
    }

    /**
     * Reads the student's own record once (to tell "already marked").
     * @param (String) sid Session.
     * @param (Done&lt;DocumentSnapshot&gt;) done Receives the document (may not exist).
     */
    public void getMyAttendance(String sid, final Done<DocumentSnapshot> done)
    {
        attendanceDoc(sid, myEmail()).get().addOnCompleteListener(new OnCompleteListener<DocumentSnapshot>()
        {
            @Override
            public void onComplete(@NonNull Task<DocumentSnapshot> t)
            {
                done.onDone(t.getResult(), t.getException());
            }
        });
    }

    // ==========================================
    //               CLASS PHOTO
    // ==========================================

    /**
     * Watches the class photo of a lecture (image as a data URL, boxes, version).
     * @param (String) sid Session.
     * @param (Listener&lt;DocumentSnapshot&gt;) l Receives the document (exists() may be false).
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenPhoto(String sid, Listener<DocumentSnapshot> l)
    {
        return listenDoc(db.collection("sessions").document(sid).collection("photo").document("main"), l);
    }

    /**
     * Watches which boxes of a photo version are taken (ids only, never names).
     * @param (String) sid Session.
     * @param (long) v Photo version.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives the claims; the id is "v_box".
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenTakenFaces(String sid, long v, Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("sessions").document(sid).collection("claims").whereEqualTo("v", v), l);
    }

    /**
     * The student chooses their face, or says "not in the photo" (Faces.NOT_FOUND). The claim
     * and the record are written together; the rules refuse a face that is already taken.
     * @param (String) sid Session.
     * @param (long) v Photo version.
     * @param (long) face Box id or Faces.NOT_FOUND.
     * @param (long) oldFace My current face in this photo (0 = none); freed when I change my choice.
     * @param (Done&lt;Void&gt;) done Receives an error when refused (e.g. taken).
     */
    public void chooseFace(String sid, long v, long face, long oldFace, final Done<Void> done)
    {
        WriteBatch batch = db.batch();
        if (oldFace > 0 && oldFace != face)
        {
            // changing my mind: free my previous face in the same write (one person = one face)
            batch.delete(db.collection("sessions").document(sid).collection("claims").document(Faces.claimId(v, oldFace)));
        }
        if (face > 0)
        {
            Map<String, Object> claim = new HashMap<String, Object>();
            claim.put("uid", user().getUid());
            claim.put("v", v);
            batch.set(db.collection("sessions").document(sid).collection("claims").document(Faces.claimId(v, face)), claim);
        }
        Map<String, Object> mine = new HashMap<String, Object>();
        mine.put("face", face);
        mine.put("photoV", v);
        batch.update(attendanceDoc(sid, myEmail()), mine);
        batch.commit().addOnCompleteListener(new OnCompleteListener<Void>()
        {
            @Override
            public void onComplete(@NonNull Task<Void> t)
            {
                done.onDone(null, t.getException());
            }
        });
    }

    /**
     * "No box on me" (face hidden, or cut off at the edge): asks for a box where the student
     * tapped. The lecturer's page checks it with Gemini, or the lecturer decides.
     * @param (String) sid Session.
     * @param (long) v Photo version.
     * @param (double[]) box {x, y, w, h} as fractions of the photo.
     * @param (Done&lt;Void&gt;) done Receives an error when refused.
     */
    public void requestBox(String sid, long v, double[] box, final Done<Void> done)
    {
        Map<String, Object> b = new HashMap<String, Object>();
        b.put("x", box[0]);
        b.put("y", box[1]);
        b.put("w", box[2]);
        b.put("h", box[3]);
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("email", myEmail());
        m.put("uid", user().getUid());
        m.put("name", myName());
        m.put("v", v);
        m.put("box", b);
        m.put("status", "pending");
        m.put("reason", "");
        m.put("faceId", 0L);
        m.put("at", System.currentTimeMillis());
        db.collection("sessions").document(sid).collection("requests").document(myEmail()).set(m)
                .addOnCompleteListener(new OnCompleteListener<Void>()
                {
                    @Override
                    public void onComplete(@NonNull Task<Void> t)
                    {
                        done.onDone(null, t.getException());
                    }
                });
    }

    /**
     * Watches my own box request.
     * @param (String) sid Session.
     * @param (Listener&lt;DocumentSnapshot&gt;) l Receives it (exists() may be false).
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenMyBoxRequest(String sid, Listener<DocumentSnapshot> l)
    {
        return listenDoc(db.collection("sessions").document(sid).collection("requests").document(myEmail()), l);
    }

    // ==========================================
    //          LIVE QUIZ (KAHOOT STYLE)
    // ==========================================

    /**
     * Watches the quizzes of a lecture, newest first (the answer key is not in them).
     * @param (String) sid Session.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives quizzes.
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenQuizzes(String sid, Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("sessions").document(sid).collection("quizzes")
                .orderBy("createdAt", Query.Direction.DESCENDING), l);
    }

    /**
     * Answers the current question; once, timed by the server (the rules check it).
     * @param (String) sid Session.
     * @param (String) qid Quiz.
     * @param (long) index Question.
     * @param (long) option Chosen button.
     * @param (Done&lt;Void&gt;) done Receives an error when too late.
     */
    public void answerQuiz(String sid, String qid, long index, long option, final Done<Void> done)
    {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("uid", user().getUid());
        m.put("name", myName());
        m.put("index", index);
        m.put("option", option);
        m.put("at", FieldValue.serverTimestamp());
        db.collection("sessions").document(sid).collection("quizzes").document(qid).collection("answers")
                .document(user().getUid() + "_" + index).set(m)
                .addOnCompleteListener(new OnCompleteListener<Void>()
                {
                    @Override
                    public void onComplete(@NonNull Task<Void> t)
                    {
                        done.onDone(null, t.getException());
                    }
                });
    }

    /**
     * Watches my own quiz answers.
     * @param (String) sid Session.
     * @param (String) qid Quiz.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives answers.
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenMyQuizAnswers(String sid, String qid, Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("sessions").document(sid).collection("quizzes").document(qid).collection("answers")
                .whereEqualTo("uid", user().getUid()), l);
    }

    /**
     * Sets or clears a student's attendance by hand (lecturer).
     * @param (String) sid Session.
     * @param (String) email Student.
     * @param (String) status New status, or null to remove.
     */
    public void setAttendance(String sid, String email, @Nullable String status)
    {
        if (status == null)
        {
            attendanceDoc(sid, email).delete();
            return;
        }
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("email", email);
        m.put("status", status);
        m.put("scannedAt", System.currentTimeMillis());
        attendanceDoc(sid, email).set(m, SetOptions.merge());
    }

    /**
     * Watches a session's attendance (lecturer: everyone).
     * @param (String) sid Session.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives records.
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenAttendance(String sid, Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("sessions").document(sid).collection("attendance"), l);
    }

    /**
     * Watches the student's own record in one session.
     * @param (String) sid Session.
     * @param (Listener&lt;DocumentSnapshot&gt;) l Receives the document (exists() may be false).
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenMyAttendance(String sid, Listener<DocumentSnapshot> l)
    {
        return listenDoc(attendanceDoc(sid, myEmail()), l);
    }

    /**
     * Loads attendance of many sessions for the spreadsheet (lecturer).
     * @param (List&lt;SessionInfo&gt;) sessions The lectures.
     * @param (Done&lt;Map&lt;String, Map&lt;String, String&gt;&gt;&gt;) done Session id, then email, to status.
     */
    public void loadAttendance(final List<SessionInfo> sessions, final Done<Map<String, Map<String, String>>> done)
    {
        final List<Task<QuerySnapshot>> reads = new ArrayList<Task<QuerySnapshot>>();
        for (SessionInfo s : sessions)
        {
            reads.add(db.collection("sessions").document(s.id()).collection("attendance").get());
        }
        Tasks.whenAll(reads).addOnCompleteListener(new OnCompleteListener<Void>()
        {
            @Override
            public void onComplete(@NonNull Task<Void> all)
            {
                if (!all.isSuccessful())
                {
                    done.onDone(null, all.getException());
                    return;
                }
                Map<String, Map<String, String>> out = new HashMap<String, Map<String, String>>();
                for (int i = 0; i < sessions.size(); i++)
                {
                    Map<String, String> bySession = new HashMap<String, String>();
                    for (QueryDocumentSnapshot d : reads.get(i).getResult())
                    {
                        bySession.put(d.getId(), str(d, "status"));
                    }
                    out.put(sessions.get(i).id(), bySession);
                }
                done.onDone(out, null);
            }
        });
    }

    // ==========================================
    //                 COMMENTS
    // ==========================================

    /**
     * Adds a comment (works offline). An anonymous comment stores no name at all.
     * @param (String) sid Session.
     * @param (String) text Text (max 2000 characters).
     * @param (boolean) isPublic True = everyone sees it; false = only the lecturer.
     * @param (boolean) anonymous True = no name.
     */
    public void addComment(String sid, String text, boolean isPublic, boolean anonymous)
    {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("text", text);
        if (isPublic)
        {
            m.put("visibility", "public");
        }
        else
        {
            m.put("visibility", "private");
        }
        m.put("authorUid", user().getUid());
        if (anonymous)
        {
            m.put("authorName", null);
        }
        else
        {
            m.put("authorName", myName());
        }
        m.put("fromLecturer", isLecturer());
        m.put("createdAt", System.currentTimeMillis());
        db.collection("sessions").document(sid).collection("comments").add(m);
    }

    /**
     * Sets my emojis on a public comment (an empty list removes my reaction). One document
     * per comment and user, so each emoji counts once per person (works offline).
     * @param (String) sid Session.
     * @param (String) cid Comment id.
     * @param (List&lt;String&gt;) emojis Emoji keys (core/Reactions).
     */
    public void react(String sid, String cid, List<String> emojis)
    {
        DocumentReference ref = db.collection("sessions").document(sid).collection("reactions")
            .document(Reactions.id(cid, user().getUid()));
        List<String> clean = Reactions.clean(emojis);
        if (clean.isEmpty())
        {
            ref.delete();
            return;
        }
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("cid", cid);
        m.put("uid", user().getUid());
        m.put("emojis", clean);
        ref.set(m);
    }

    /**
     * Watches the emoji reactions of a lecture (only public comments have them).
     * @param (String) sid Session.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives {cid, uid, emojis} records.
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenReactions(String sid, Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("sessions").document(sid).collection("reactions"), l);
    }

    /**
     * Watches the comments the user may see, oldest first. Students need two queries
     * (public + my own), because Firestore only runs queries the rules allow.
     * @param (String) sid Session.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives comments.
     * @return (ListenerRegistration[]) Stop handles.
     */
    public ListenerRegistration[] listenComments(String sid, final Listener<List<DocumentSnapshot>> l)
    {
        Query col = db.collection("sessions").document(sid).collection("comments");
        if (isLecturer())
        {
            return new ListenerRegistration[] {listen(col.orderBy("createdAt"), l)};
        }
        final Map<String, DocumentSnapshot> pub = new LinkedHashMap<String, DocumentSnapshot>();
        final Map<String, DocumentSnapshot> mine = new LinkedHashMap<String, DocumentSnapshot>();
        ListenerRegistration a = listen(col.whereEqualTo("visibility", "public"), new Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                pub.clear();
                for (DocumentSnapshot d : list)
                {
                    pub.put(d.getId(), d);
                }
                l.onChange(merged(pub, mine));
            }
        });
        ListenerRegistration b = listen(col.whereEqualTo("authorUid", user().getUid()), new Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                mine.clear();
                for (DocumentSnapshot d : list)
                {
                    mine.put(d.getId(), d);
                }
                l.onChange(merged(pub, mine));
            }
        });
        return new ListenerRegistration[] {a, b};
    }

    // ==========================================
    //                   POLLS
    // ==========================================

    // ==========================================
    //                TRANSCRIPT
    // ==========================================

    /**
     * Stores one transcript piece (lecturer).
     * @param (String) sid Session.
     * @param (long) index Piece number (in order).
     * @param (String) text Text.
     */
    public void addTranscript(String sid, long index, String text)
    {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("index", index);
        m.put("text", text);
        db.collection("sessions").document(sid).collection("transcript").document(String.valueOf(index)).set(m);
    }

    /**
     * Watches the transcript in order.
     * @param (String) sid Session.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives pieces.
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenTranscript(String sid, Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("sessions").document(sid).collection("transcript").orderBy("index"), l);
    }

    // ==========================================
    //                ASSIGNMENTS
    // ==========================================

    /**
     * Creates an assignment (lecturer).
     * @param (String) title Title.
     * @param (String) requirements Requirements text.
     * @param (String) due Due date as text.
     */
    public void createAssignment(String title, String requirements, String due)
    {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("title", title);
        m.put("requirements", requirements);
        m.put("due", due);
        m.put("createdAt", System.currentTimeMillis());
        db.collection("assignments").add(m);
    }

    /**
     * Watches assignments, newest first.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives the list.
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenAssignments(Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("assignments").orderBy("createdAt", Query.Direction.DESCENDING), l);
    }

    /**
     * Submits or re-submits (student). Review, grade and feedback stay as they are.
     * @param (String) aid Assignment.
     * @param (String) repoUrl GitHub link (may be empty).
     * @param (List&lt;Map&lt;String, Object&gt;&gt;) files Files as {name, text}.
     * @param (Done&lt;Void&gt;) done Called when saved (offline: when sent).
     */
    public void submit(String aid, String repoUrl, List<Map<String, Object>> files, final Done<Void> done)
    {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("email", myEmail());
        m.put("name", myName());
        m.put("repoUrl", repoUrl);
        m.put("files", files);
        m.put("submittedAt", System.currentTimeMillis());
        submissionDoc(aid, myEmail()).set(m, SetOptions.merge()).addOnCompleteListener(new OnCompleteListener<Void>()
        {
            @Override
            public void onComplete(@NonNull Task<Void> t)
            {
                done.onDone(null, t.getException());
            }
        });
    }

    /**
     * Watches all submissions of an assignment (lecturer).
     * @param (String) aid Assignment.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives submissions.
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenSubmissions(String aid, Listener<List<DocumentSnapshot>> l)
    {
        return listen(db.collection("assignments").document(aid).collection("submissions"), l);
    }

    /**
     * Watches the student's own submission.
     * @param (String) aid Assignment.
     * @param (Listener&lt;DocumentSnapshot&gt;) l Receives the document.
     * @return (ListenerRegistration) Stop handle.
     */
    public ListenerRegistration listenMySubmission(String aid, Listener<DocumentSnapshot> l)
    {
        return listenDoc(submissionDoc(aid, myEmail()), l);
    }

    /**
     * Sets review, grade or feedback (lecturer).
     * @param (String) aid Assignment.
     * @param (String) email Student.
     * @param (Map&lt;String, Object&gt;) fields Fields to set.
     */
    public void updateSubmission(String aid, String email, Map<String, Object> fields)
    {
        submissionDoc(aid, email).update(fields);
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Runs a live query (including "waiting to send" changes).
     * @param (Query) q The query.
     * @param (Listener&lt;List&lt;DocumentSnapshot&gt;&gt;) l Receives the documents.
     * @return (ListenerRegistration) Stop handle.
     */
    private ListenerRegistration listen(Query q, final Listener<List<DocumentSnapshot>> l)
    {
        return q.addSnapshotListener(MetadataChanges.INCLUDE, new EventListener<QuerySnapshot>()
        {
            @Override
            public void onEvent(@Nullable QuerySnapshot snap, @Nullable FirebaseFirestoreException e)
            {
                if (snap == null)
                {
                    return;
                }
                l.onChange(new ArrayList<DocumentSnapshot>(snap.getDocuments()));
            }
        });
    }

    /**
     * Runs a live document read.
     * @param (DocumentReference) ref The document.
     * @param (Listener&lt;DocumentSnapshot&gt;) l Receives it.
     * @return (ListenerRegistration) Stop handle.
     */
    private ListenerRegistration listenDoc(DocumentReference ref, final Listener<DocumentSnapshot> l)
    {
        return ref.addSnapshotListener(MetadataChanges.INCLUDE, new EventListener<DocumentSnapshot>()
        {
            @Override
            public void onEvent(@Nullable DocumentSnapshot snap, @Nullable FirebaseFirestoreException e)
            {
                if (snap != null)
                {
                    l.onChange(snap);
                }
            }
        });
    }

    /**
     * Joins public and own comments, sorted by time.
     * @param (Map&lt;String, DocumentSnapshot&gt;) a Public comments.
     * @param (Map&lt;String, DocumentSnapshot&gt;) b Own comments.
     * @return (List&lt;DocumentSnapshot&gt;) Merged list.
     */
    private static List<DocumentSnapshot> merged(Map<String, DocumentSnapshot> a, Map<String, DocumentSnapshot> b)
    {
        Map<String, DocumentSnapshot> all = new LinkedHashMap<String, DocumentSnapshot>(a);
        all.putAll(b);
        List<DocumentSnapshot> out = new ArrayList<DocumentSnapshot>(all.values());
        Collections.sort(out, new Comparator<DocumentSnapshot>()
        {
            @Override
            public int compare(DocumentSnapshot x, DocumentSnapshot y)
            {
                return Long.compare(num(x, "createdAt"), num(y, "createdAt"));
            }
        });
        return out;
    }

    /**
     * Returns the attendance document of a student.
     * @param (String) sid Session.
     * @param (String) email Student.
     * @return (DocumentReference) Reference.
     */
    private DocumentReference attendanceDoc(String sid, String email)
    {
        return db.collection("sessions").document(sid).collection("attendance").document(email);
    }

    /**
     * Returns a submission document.
     * @param (String) aid Assignment.
     * @param (String) email Student.
     * @return (DocumentReference) Reference.
     */
    private DocumentReference submissionDoc(String aid, String email)
    {
        return db.collection("assignments").document(aid).collection("submissions").document(email);
    }

    /**
     * Converts a class-list entry to a Firestore map (same fields as the website).
     * @param (Student) s Entry.
     * @return (Map&lt;String, Object&gt;) Fields.
     */
    private static Map<String, Object> studentMap(Student s)
    {
        Map<String, Object> m = new HashMap<String, Object>();
        m.put("first", s.first());
        m.put("last", s.last());
        m.put("id", s.id());
        m.put("email", s.email());
        m.put("group", s.group());
        m.put("staff", s.staff());
        return m;
    }

    /**
     * Reads a text field safely.
     * @param (DocumentSnapshot) d Document.
     * @param (String) field Field.
     * @return (String) Value, or "".
     */
    public static String str(DocumentSnapshot d, String field)
    {
        String v = d.getString(field);
        if (v == null)
        {
            return "";
        }
        return v;
    }

    /**
     * Reads a number field safely as a long.
     * @param (DocumentSnapshot) d Document.
     * @param (String) field Field.
     * @return (long) Value, or 0.
     */
    public static long num(DocumentSnapshot d, String field)
    {
        Object v = d.get(field);
        if (v instanceof Number)
        {
            return ((Number) v).longValue();
        }
        return 0;
    }

    /**
     * Reads a number field safely as a double.
     * @param (DocumentSnapshot) d Document.
     * @param (String) field Field.
     * @return (double) Value, or 0.
     */
    public static double dbl(DocumentSnapshot d, String field)
    {
        Object v = d.get(field);
        if (v instanceof Number)
        {
            return ((Number) v).doubleValue();
        }
        return 0;
    }

    /**
     * Tells whether a session is still open.
     * @param (DocumentSnapshot) d Session document.
     * @return (boolean) True while endedAt is null.
     */
    public static boolean isOpen(DocumentSnapshot d)
    {
        return d.get("endedAt") == null;
    }

    /**
     * Converts session documents to the info the attendance sheet needs.
     * @param (List&lt;DocumentSnapshot&gt;) docs Sessions.
     * @return (List&lt;SessionInfo&gt;) Infos.
     */
    public static List<SessionInfo> infos(List<DocumentSnapshot> docs)
    {
        List<SessionInfo> out = new ArrayList<SessionInfo>();
        for (DocumentSnapshot d : docs)
        {
            out.add(new SessionInfo(d.getId(), str(d, "title"), num(d, "startedAt")));
        }
        return out;
    }
}
