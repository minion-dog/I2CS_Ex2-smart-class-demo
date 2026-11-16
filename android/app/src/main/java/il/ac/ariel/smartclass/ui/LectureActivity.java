package il.ac.ariel.smartclass.ui;

import android.Manifest;
import android.content.pm.PackageManager;
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
import com.google.firebase.firestore.ListenerRegistration;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.ai.Groq;
import il.ac.ariel.smartclass.ai.LectureRecorder;
import il.ac.ariel.smartclass.core.Prompts;
import il.ac.ariel.smartclass.data.Repo;

/**
 * One lecture, for both roles: comments (public/private, anonymous or with a name), polls,
 * summary and transcript. The lecturer also creates polls, records the lecture (Whisper
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
    private LinearLayout pollBox;
    private TextView summaryView;
    private TextView transcriptView;
    private TextView recStatus;

    /** Per-poll vote listeners, removed when the poll list changes. */
    private final Map<String, ListenerRegistration> voteListeners = new HashMap<String, ListenerRegistration>();

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
        for (ListenerRegistration r : voteListeners.values())
        {
            r.remove();
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
                showComments(list);
            }
        }));
    }

    /**
     * Adds the polls (lecturer: a form to open one).
     * @param (LinearLayout) col Screen column.
     */
    private void buildPolls(LinearLayout col)
    {
        Ui.title(col, getString(R.string.polls));
        if (Repo.get().isLecturer())
        {
            final EditText q = Ui.field(col, getString(R.string.poll_question));
            final EditText opts = Ui.area(col, getString(R.string.poll_options), 3);
            Ui.button(col, getString(R.string.create_poll), new View.OnClickListener()
            {
                @Override
                public void onClick(View v)
                {
                    List<String> options = Prompts.pollOptions(opts.getText().toString());
                    String question = q.getText().toString().trim();
                    if (options == null || question.isEmpty())
                    {
                        Ui.toast(LectureActivity.this, getString(R.string.poll_options));
                        return;
                    }
                    Repo.get().createPoll(sid, question, options);
                    q.setText("");
                    opts.setText("");
                }
            });
        }
        pollBox = Ui.box(col);
        keep(Repo.get().listenPolls(sid, new Repo.Listener<List<DocumentSnapshot>>()
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

    /**
     * Draws the comments.
     * @param (List&lt;DocumentSnapshot&gt;) list Comments, oldest first.
     */
    private void showComments(List<DocumentSnapshot> list)
    {
        commentBox.removeAllViews();
        for (DocumentSnapshot c : list)
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
        }
    }

    /**
     * Draws the polls: results for the lecturer, vote buttons for students.
     * @param (List&lt;DocumentSnapshot&gt;) list Polls, newest first.
     */
    private void showPolls(List<DocumentSnapshot> list)
    {
        for (ListenerRegistration r : voteListeners.values())
        {
            r.remove();
        }
        voteListeners.clear();
        pollBox.removeAllViews();
        for (final DocumentSnapshot p : list)
        {
            final LinearLayout card = Ui.box(pollBox);
            if (Repo.get().isLecturer())
            {
                voteListeners.put(p.getId(), Repo.get().listenVotes(sid, p.getId(), new Repo.Listener<List<DocumentSnapshot>>()
                {
                    @Override
                    public void onChange(List<DocumentSnapshot> votes)
                    {
                        drawResults(card, p, votes);
                    }
                }));
            }
            else
            {
                voteListeners.put(p.getId(), Repo.get().listenMyVote(sid, p.getId(), new Repo.Listener<DocumentSnapshot>()
                {
                    @Override
                    public void onChange(DocumentSnapshot mine)
                    {
                        drawVote(card, p, mine);
                    }
                }));
            }
        }
    }

    /**
     * Draws a poll's live results (lecturer).
     * @param (LinearLayout) card Container.
     * @param (DocumentSnapshot) p Poll.
     * @param (List&lt;DocumentSnapshot&gt;) votes Votes.
     */
    private void drawResults(LinearLayout card, final DocumentSnapshot p, List<DocumentSnapshot> votes)
    {
        card.removeAllViews();
        List<String> options = options(p);
        int[] counts = new int[options.size()];
        for (DocumentSnapshot v : votes)
        {
            int k = (int) Repo.num(v, "option");
            if (k >= 0 && k < counts.length)
            {
                counts[k]++;
            }
        }
        Ui.text(card, "❓ " + Repo.str(p, "question"));
        for (int i = 0; i < options.size(); i++)
        {
            int pct = 0;
            if (!votes.isEmpty())
            {
                pct = Math.round(100f * counts[i] / votes.size());
            }
            Ui.text(card, String.format(Locale.ROOT, "%s · %d (%d%%)", options.get(i), counts[i], pct));
        }
        final boolean open = Boolean.TRUE.equals(p.getBoolean("open"));
        String label = getString(R.string.reopen_poll);
        if (open)
        {
            label = getString(R.string.close_poll);
        }
        Ui.button(card, votes.size() + " " + getString(R.string.votes) + " · " + label, new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                Repo.get().setPollOpen(sid, p.getId(), !open);
            }
        });
    }

    /**
     * Draws the vote buttons, or "voted" (student).
     * @param (LinearLayout) card Container.
     * @param (DocumentSnapshot) p Poll.
     * @param (DocumentSnapshot) mine The student's vote document.
     */
    private void drawVote(LinearLayout card, final DocumentSnapshot p, DocumentSnapshot mine)
    {
        card.removeAllViews();
        final List<String> options = options(p);
        Ui.text(card, "❓ " + Repo.str(p, "question"));
        if (mine.exists())
        {
            int k = (int) Repo.num(mine, "option");
            if (k >= 0 && k < options.size())
            {
                Ui.text(card, getString(R.string.voted) + " · " + options.get(k));
            }
            return;
        }
        if (!Boolean.TRUE.equals(p.getBoolean("open")))
        {
            Ui.text(card, getString(R.string.poll_closed));
            return;
        }
        for (int i = 0; i < options.size(); i++)
        {
            final int choice = i;
            Ui.button(card, options.get(i), new View.OnClickListener()
            {
                @Override
                public void onClick(View v)
                {
                    Repo.get().vote(sid, p.getId(), choice);
                }
            });
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
        if (Groq.key(this).isEmpty())
        {
            Ui.toast(this, getString(R.string.groq_missing));
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
        if (Groq.key(this).isEmpty())
        {
            Ui.toast(this, getString(R.string.groq_missing));
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
                    String summary = Groq.chat(LectureActivity.this, m[0], m[1]);
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

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Reads a poll's answers.
     * @param (DocumentSnapshot) p Poll.
     * @return (List&lt;String&gt;) Answers.
     */
    @SuppressWarnings("unchecked")
    private static List<String> options(DocumentSnapshot p)
    {
        Object o = p.get("options");
        if (o instanceof List)
        {
            return (List<String>) o;
        }
        return new java.util.ArrayList<String>();
    }
}
