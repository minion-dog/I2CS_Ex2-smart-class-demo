package il.ac.ariel.smartclass.ui;

import android.Manifest;
import android.content.pm.PackageManager;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;

import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.core.content.ContextCompat;

import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FirebaseFirestore;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.ai.Ai;
import il.ac.ariel.smartclass.ai.LectureRecorder;
import il.ac.ariel.smartclass.core.Prompts;
import il.ac.ariel.smartclass.core.Quiz;
import il.ac.ariel.smartclass.core.Reactions;
import il.ac.ariel.smartclass.data.Repo;

/**
 * One lecture, for both roles: comments (public/private, anonymous or with a name), polls & quizzes,
 * summary and transcript. The lecturer also records the lecture (Whisper
 * transcription in Hebrew) and makes the AI summary.
 */
public class LectureActivity extends BaseActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Intent extra: session id. */
    public static final String EXTRA_SESSION = "session";

    /** Intent extra: session title. */
    public static final String EXTRA_TITLE = "title";

    /** Max comment length (the security rules allow 2000). */
    private static final int MAX_COMMENT = 2000;

    /** The lecture. */
    private String sid;

    /** The lecture title. */
    private String title;

    /** Live containers. */
    private LinearLayout commentBox;

    /** The latest comments and emoji reactions (both redraw the list). */
    private List<DocumentSnapshot> comments = new ArrayList<DocumentSnapshot>();

    /** Reaction records {cid, uid, emojis}. */
    private List<DocumentSnapshot> reactions = new ArrayList<DocumentSnapshot>();
    private LinearLayout pollBox;
    private TextView summaryView;
    private TextView transcriptView;
    private TextView recStatus;

    /** Lecturer: the recorder while recording. */
    private LectureRecorder recorder;

    /** Lecturer: asks for the microphone. */
    private ActivityResultLauncher<String> micPermission;

    /** Background thread for the AI. */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    /** Main-thread handler. */
    private final Handler main = new Handler(Looper.getMainLooper());

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the screen.
     * @param (Bundle) saved Saved state (unused).
     */
    @Override
    protected void onCreate(@Nullable Bundle saved)
    {
        super.onCreate(saved);
        sid = getIntent().getStringExtra(EXTRA_SESSION);
        title = getIntent().getStringExtra(EXTRA_TITLE);
        LinearLayout col = Ui.screen(this);
        Ui.title(col, title);
        buildComments(col);
        buildPolls(col);
        buildSummary(col);
    }

    /** Stops recording and the listeners. */
    @Override
    protected void onDestroy()
    {
        if (recorder != null)
        {
            recorder.stop();
        }
        worker.shutdown();
        super.onDestroy();
    }

    // ==========================================
    //              BUILD PIPELINE
    // ==========================================

    /**
     * Adds the comment feed and the form.
     * @param (LinearLayout) col Screen column.
     */
    private void buildComments(LinearLayout col)
    {
        Ui.title(col, getString(R.string.comments));
        commentBox = Ui.box(col);
        final EditText text = Ui.area(col, getString(R.string.write_comment), 2);
        final RadioGroup visibility = new RadioGroup(this);
        final RadioButton pub = new RadioButton(this);
        pub.setText(getString(R.string.public_comment));
        pub.setId(View.generateViewId());
        RadioButton priv = new RadioButton(this);
        priv.setText(getString(R.string.private_comment));
        priv.setId(View.generateViewId());
        visibility.addView(pub);
        visibility.addView(priv);
        visibility.check(pub.getId());
        final CheckBox anonymous = new CheckBox(this);
        anonymous.setText(getString(R.string.anonymous));
        if (!Repo.get().isLecturer())
        {
            col.addView(visibility);
            col.addView(anonymous);
        }
        Ui.button(col, getString(R.string.send), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                String s = text.getText().toString().trim();
                if (s.isEmpty())
                {
                    return;
                }
                if (s.length() > MAX_COMMENT)
                {
                    s = s.substring(0, MAX_COMMENT);
                }
                Repo.get().addComment(sid, s, visibility.getCheckedRadioButtonId() == pub.getId(), anonymous.isChecked());
                text.setText("");
            }
        });
        keep(Repo.get().listenComments(sid, new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                comments = list;
                showComments();
            }
        }));
        keep(Repo.get().listenReactions(sid, new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                reactions = list;
                showComments();
            }
        }));
    }

    /**
     * Polls & quizzes of this lecture (one feature; the lecturer runs them from the website on
     * the projector). A student taps an open one to answer it; it also opens by itself.
     * @param (LinearLayout) col Screen column.
     */
    private void buildPolls(LinearLayout col)
    {
        Ui.title(col, getString(R.string.polls));
        if (Repo.get().isLecturer())
        {
            Ui.text(col, getString(R.string.polls_on_site));
        }
        pollBox = Ui.box(col);
        keep(Repo.get().listenQuizzes(sid, new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                showPolls(list);
            }
        }));
    }

    /**
     * Adds the summary and transcript (lecturer: record and summarise).
     * @param (LinearLayout) col Screen column.
     */
    private void buildSummary(LinearLayout col)
    {
        Ui.title(col, getString(R.string.summary));
        summaryView = Ui.text(col, getString(R.string.no_summary));
        if (Repo.get().isLecturer())
        {
            recStatus = Ui.text(col, "");
            micPermission = registerForActivityResult(new ActivityResultContracts.RequestPermission(),
                new ActivityResultCallback<Boolean>()
                {
                    @Override
                    public void onActivityResult(Boolean granted)
                    {
                        if (Boolean.TRUE.equals(granted))
                        {
                            startRecording();
                        }
                    }
                });
            final Button rec = Ui.button(col, getString(R.string.record_start), null);
            rec.setOnClickListener(new View.OnClickListener()
            {
                @Override
                public void onClick(View v)
                {
                    toggleRecording(rec);
                }
            });
            Ui.button(col, getString(R.string.make_summary), new View.OnClickListener()
            {
                @Override
                public void onClick(View v)
                {
                    makeSummary();
                }
            });
        }
        Ui.title(col, getString(R.string.transcript));
        transcriptView = Ui.text(col, "");
        keep(FirebaseFirestore.getInstance().collection("sessions").document(sid).addSnapshotListener(
            new com.google.firebase.firestore.EventListener<DocumentSnapshot>()
            {
                @Override
                public void onEvent(@Nullable DocumentSnapshot d, @Nullable com.google.firebase.firestore.FirebaseFirestoreException e)
                {
                    if (d != null && d.getString("summary") != null)
                    {
                        summaryView.setText(d.getString("summary"));
                    }
                }
            }));
        keep(Repo.get().listenTranscript(sid, new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                StringBuilder s = new StringBuilder();
                for (DocumentSnapshot d : list)
                {
                    s.append(Repo.str(d, "text")).append("\n\n");
                }
                transcriptView.setText(s.toString().trim());
            }
        }));
    }

    // ==========================================
    //              LIVE RENDERING
    // ==========================================

    /** Draws the comments (oldest first); public ones get emoji buttons with counts. */
    private void showComments()
    {
        commentBox.removeAllViews();
        for (DocumentSnapshot c : comments)
        {
            String who = c.getString("authorName");
            if (who == null)
            {
                who = getString(R.string.anonymous_name);
            }
            if (Boolean.TRUE.equals(c.getBoolean("fromLecturer")))
            {
                who = getString(R.string.lecturer_name);
            }
            String meta = who + " · " + Ui.when(Repo.num(c, "createdAt"));
            if ("private".equals(c.getString("visibility")))
            {
                meta = meta + " · 🔒";
            }
            if (c.getMetadata().hasPendingWrites())
            {
                meta = meta + " · ⏳";
            }
            Ui.text(commentBox, meta + "\n" + Repo.str(c, "text"));
            if ("public".equals(c.getString("visibility")) && !c.getMetadata().hasPendingWrites())
            {
                reactionRow(c.getId());
            }
        }
    }

    /**
     * The emoji buttons under a public comment: each with its count; mine marked with a dot.
     * @param (String) cid Comment id.
     */
    @SuppressWarnings("unchecked")
    private void reactionRow(final String cid)
    {
        List<List<String>> all = new ArrayList<List<String>>();
        List<String> found = new ArrayList<String>();
        String me = Repo.get().user().getUid();
        for (DocumentSnapshot r : reactions)
        {
            if (cid.equals(r.getString("cid")))
            {
                List<String> e = (List<String>) r.get("emojis");
                all.add(e);
                if (me.equals(r.getString("uid")) && e != null)
                {
                    found = e;
                }
            }
        }
        final List<String> mine = Reactions.clean(found);
        Map<String, Integer> counts = Reactions.count(all);
        LinearLayout row = Ui.row(this);
        commentBox.addView(row);
        for (int i = 0; i < Reactions.KEYS.length; i++)
        {
            final String key = Reactions.KEYS[i];
            Integer n = counts.get(key);
            String label = Reactions.EMOJIS[i] + (n == null ? "" : " " + n) + (mine.contains(key) ? " •" : "");
            Ui.button(row, label, new View.OnClickListener()
            {
                @Override
                public void onClick(View v)
                {
                    Repo.get().react(sid, cid, Reactions.toggle(mine, key));
                }
            });
        }
    }

    /**
     * Lists the polls & quizzes; an open one gets an "answer" button (students).
     * @param (List&lt;DocumentSnapshot&gt;) list Quizzes, newest first.
     */
    @SuppressWarnings("unchecked")
    private void showPolls(List<DocumentSnapshot> list)
    {
        pollBox.removeAllViews();
        for (final DocumentSnapshot q : list)
        {
            Map<String, Object> st = (Map<String, Object>) q.get("state");
            String phase = st == null ? "" : String.valueOf(st.get("phase"));
            boolean open = Quiz.isLive(phase) && !"end".equals(phase);
            if (open && !Repo.get().isLecturer())
            {
                Ui.button(pollBox, "📊 " + Repo.str(q, "title"), new View.OnClickListener()
                {
                    @Override
                    public void onClick(View v)
                    {
                        startActivity(new Intent(LectureActivity.this, QuizPlayActivity.class)
                                .putExtra(QuizPlayActivity.EXTRA_SID, sid).putExtra(QuizPlayActivity.EXTRA_QID, q.getId()));
                    }
                });
            }
            else
            {
                Ui.text(pollBox, Repo.str(q, "title") + (open ? " ●" : ""));
            }
        }
    }

    // ==========================================
    //          LECTURER: RECORD AND SUMMARY
    // ==========================================

    /**
     * Starts or stops the recording.
     * @param (Button) rec The record button (its label changes).
     */
    private void toggleRecording(Button rec)
    {
        if (recorder != null)
        {
            recorder.stop();
            recorder = null;
            rec.setText(getString(R.string.record_start));
            return;
        }
        if (!Ai.ready(this))
        {
            Ui.toast(this, getString(R.string.ai_missing));
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
        {
            micPermission.launch(Manifest.permission.RECORD_AUDIO);
            return;
        }
        startRecording();
        rec.setText(getString(R.string.record_stop));
    }

    /** Starts the 60-second-piece recorder. */
    private void startRecording()
    {
        recorder = new LectureRecorder(this, sid, new LectureRecorder.Status()
        {
            @Override
            public void onStatus(String text)
            {
                recStatus.setText("● " + text);
            }
        });
        try
        {
            recorder.start();
            recStatus.setText("●");
        }
        catch (IOException e)
        {
            recorder = null;
            Ui.toast(this, getString(R.string.error) + ": " + e.getMessage());
        }
    }

    /** Sends the transcript to the AI and stores the summary in the session. */
    private void makeSummary()
    {
        final String text = transcriptView.getText().toString();
        if (text.isEmpty())
        {
            Ui.toast(this, getString(R.string.no_summary));
            return;
        }
        if (!Ai.ready(this))
        {
            Ui.toast(this, getString(R.string.ai_missing));
            return;
        }
        recStatus.setText(getString(R.string.working));
        final boolean english = "en".equals(getResources().getConfiguration().getLocales().get(0).getLanguage());
        worker.execute(new Runnable()
        {
            @Override
            public void run()
            {
                String status;
                try
                {
                    String[] m = Prompts.summary(title, text, english);
                    String summary = Ai.chat(LectureActivity.this, m[0], m[1]);
                    Map<String, Object> f = new HashMap<String, Object>();
                    f.put("summary", summary);
                    Repo.get().updateSession(sid, f);
                    status = "✓";
                }
                catch (IOException e)
                {
                    status = getString(R.string.error) + ": " + e.getMessage();
                }
                final String done = status;
                main.post(new Runnable()
                {
                    @Override
                    public void run()
                    {
                        recStatus.setText(done);
                    }
                });
            }
        });
    }
}
