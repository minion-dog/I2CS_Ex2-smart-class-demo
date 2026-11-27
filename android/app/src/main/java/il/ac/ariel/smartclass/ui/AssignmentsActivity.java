package il.ac.ariel.smartclass.ui;

import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;

import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;

import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.ListenerRegistration;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.ai.GitHub;
import il.ac.ariel.smartclass.ai.Ai;
import il.ac.ariel.smartclass.core.Prompts;
import il.ac.ariel.smartclass.data.Repo;

/**
 * Assignments for both roles.
 * Student: requirements, submit a GitHub link and/or text files, see review, grade, feedback.
 * Lecturer: create assignments, see submissions, run the AI review (compared with the other
 * submissions), give a grade and feedback.
 */
public class AssignmentsActivity extends BaseActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Max total size of uploaded files (Firestore documents are limited to 1 MB). */
    private static final long MAX_UPLOAD_BYTES = 500 * 1024;

    /** Refilled by the live assignments list. */
    private LinearLayout listBox;

    /** Per-assignment submission listeners. */
    private final List<ListenerRegistration> subListeners = new ArrayList<ListenerRegistration>();

    /** Student: picks files to submit. */
    private ActivityResultLauncher<String[]> pickFiles;

    /** Student: files chosen for the assignment being submitted. */
    private final List<Map<String, Object>> chosenFiles = new ArrayList<Map<String, Object>>();

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
        LinearLayout col = Ui.screen(this);
        Ui.hero(col, getString(R.string.assignments), "");
        if (Repo.get().isLecturer())
        {
            buildCreateForm(col);
        }
        else
        {
            pickFiles = registerForActivityResult(new ActivityResultContracts.OpenMultipleDocuments(),
                new ActivityResultCallback<List<Uri>>()
                {
                    @Override
                    public void onActivityResult(List<Uri> uris)
                    {
                        readFiles(uris);
                    }
                });
        }
        listBox = Ui.box(col);
        keep(Repo.get().listenAssignments(new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                showAssignments(list);
            }
        }));
    }

    /** Removes the per-assignment listeners. */
    @Override
    protected void onDestroy()
    {
        clearSubListeners();
        worker.shutdown();
        super.onDestroy();
    }

    // ==========================================
    //              BUILD PIPELINE
    // ==========================================

    /**
     * Lecturer: the "new assignment" form.
     * @param (LinearLayout) col Screen column.
     */
    private void buildCreateForm(LinearLayout col)
    {
        Ui.title(col, getString(R.string.new_assignment));
        final EditText title = Ui.field(col, getString(R.string.assignment_title));
        final EditText req = Ui.area(col, getString(R.string.requirements), 4);
        final EditText due = Ui.field(col, getString(R.string.due));
        Ui.button(col, getString(R.string.create), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                String t = title.getText().toString().trim();
                if (t.isEmpty())
                {
                    return;
                }
                Repo.get().createAssignment(t, req.getText().toString().trim(), due.getText().toString().trim());
                title.setText("");
                req.setText("");
                due.setText("");
            }
        });
    }

    /**
     * Shows every assignment with its role-specific part.
     * @param (List&lt;DocumentSnapshot&gt;) list Assignments.
     */
    private void showAssignments(List<DocumentSnapshot> list)
    {
        clearSubListeners();
        listBox.removeAllViews();
        for (DocumentSnapshot a : list)
        {
            LinearLayout card = Ui.box(listBox);
            Ui.title(card, Repo.str(a, "title"));
            if (!Repo.str(a, "due").isEmpty())
            {
                Ui.text(card, getString(R.string.due) + ": " + Repo.str(a, "due"));
            }
            Ui.text(card, Repo.str(a, "requirements"));
            if (Repo.get().isLecturer())
            {
                lecturerPart(card, a);
            }
            else
            {
                studentPart(card, a);
            }
        }
    }

    /**
     * Student: submit form and own result.
     * @param (LinearLayout) card Container.
     * @param (DocumentSnapshot) a Assignment.
     */
    private void studentPart(LinearLayout card, final DocumentSnapshot a)
    {
        final EditText repo = Ui.field(card, getString(R.string.repo_url));
        repo.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        Ui.button(card, getString(R.string.pick_files), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                pickFiles.launch(new String[] {"text/*", "application/octet-stream", "application/json", "application/xml"});
            }
        });
        Ui.button(card, getString(R.string.submit), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                String url = repo.getText().toString().trim();
                if (url.isEmpty() && chosenFiles.isEmpty())
                {
                    return;
                }
                if (!url.isEmpty() && !url.matches("(?i)^https?://.+"))
                {
                    Ui.toast(AssignmentsActivity.this, getString(R.string.repo_url) + ": https://…");
                    return;
                }
                Repo.get().submit(a.getId(), url, new ArrayList<Map<String, Object>>(chosenFiles), new Repo.Done<Void>()
                {
                    @Override
                    public void onDone(@Nullable Void v, @Nullable Exception error)
                    {
                        if (error != null)
                        {
                            Ui.toast(AssignmentsActivity.this, getString(R.string.error) + ": " + error.getMessage());
                        }
                    }
                });
                chosenFiles.clear();
                Ui.toast(AssignmentsActivity.this, getString(R.string.submitted));
            }
        });
        final LinearLayout mine = Ui.box(card);
        subListeners.add(Repo.get().listenMySubmission(a.getId(), new Repo.Listener<DocumentSnapshot>()
        {
            @Override
            public void onChange(DocumentSnapshot s)
            {
                mine.removeAllViews();
                if (!s.exists())
                {
                    return;
                }
                if (repo.getText().length() == 0)
                {
                    repo.setText(Repo.str(s, "repoUrl"));
                }
                String head = "✓ " + getString(R.string.submitted) + " · " + Ui.when(Repo.num(s, "submittedAt"));
                if (s.getMetadata().hasPendingWrites())
                {
                    head = "⏳ " + head;
                }
                Ui.text(mine, head);
                if (s.get("grade") != null)
                {
                    Ui.text(mine, getString(R.string.grade) + ": " + s.get("grade"));
                }
                if (!Repo.str(s, "feedback").isEmpty())
                {
                    Ui.text(mine, getString(R.string.feedback) + ": " + Repo.str(s, "feedback"));
                }
                if (!Repo.str(s, "review").isEmpty())
                {
                    Ui.text(mine, getString(R.string.ai_review) + ":\n" + Repo.str(s, "review"));
                }
            }
        }));
    }

    /**
     * Lecturer: the submissions with review, grade and feedback.
     * @param (LinearLayout) card Container.
     * @param (DocumentSnapshot) a Assignment.
     */
    private void lecturerPart(LinearLayout card, final DocumentSnapshot a)
    {
        Ui.title(card, getString(R.string.submissions));
        final LinearLayout subs = Ui.box(card);
        subListeners.add(Repo.get().listenSubmissions(a.getId(), new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(final List<DocumentSnapshot> list)
            {
                subs.removeAllViews();
                for (final DocumentSnapshot s : list)
                {
                    Ui.text(subs, Repo.str(s, "name") + " · " + Repo.str(s, "email") + " · " + Ui.when(Repo.num(s, "submittedAt")));
                    if (!Repo.str(s, "repoUrl").isEmpty())
                    {
                        Ui.text(subs, Repo.str(s, "repoUrl"));
                    }
                    if (!Repo.str(s, "review").isEmpty())
                    {
                        Ui.text(subs, Repo.str(s, "review"));
                    }
                    Ui.button(subs, getString(R.string.ai_review), new View.OnClickListener()
                    {
                        @Override
                        public void onClick(View v)
                        {
                            review(a, s, list);
                        }
                    });
                    LinearLayout row = Ui.row(AssignmentsActivity.this);
                    subs.addView(row);
                    final EditText grade = Ui.field(row, getString(R.string.grade));
                    grade.setInputType(InputType.TYPE_CLASS_NUMBER);
                    if (s.get("grade") != null)
                    {
                        grade.setText(String.valueOf(s.get("grade")));
                    }
                    final EditText feedback = Ui.field(subs, getString(R.string.feedback));
                    feedback.setText(Repo.str(s, "feedback"));
                    Ui.button(subs, getString(R.string.ok), new View.OnClickListener()
                    {
                        @Override
                        public void onClick(View v)
                        {
                            Map<String, Object> f = new HashMap<String, Object>();
                            String g = grade.getText().toString().trim();
                            if (g.isEmpty())
                            {
                                f.put("grade", null);
                            }
                            else
                            {
                                f.put("grade", Long.parseLong(g));
                            }
                            f.put("feedback", feedback.getText().toString().trim());
                            Repo.get().updateSubmission(a.getId(), s.getId(), f);
                            Ui.toast(AssignmentsActivity.this, getString(R.string.saved));
                        }
                    });
                }
            }
        }));
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Runs the AI review of one submission in the background, comparing it with the others.
     * @param (DocumentSnapshot) a Assignment.
     * @param (DocumentSnapshot) s Submission.
     * @param (List&lt;DocumentSnapshot&gt;) all All submissions (for the comparison).
     */
    private void review(final DocumentSnapshot a, final DocumentSnapshot s, List<DocumentSnapshot> all)
    {
        if (!Ai.ready(this))
        {
            Ui.toast(this, getString(R.string.ai_missing));
            return;
        }
        final List<String> peers = new ArrayList<String>();
        for (DocumentSnapshot o : all)
        {
            if (!o.getId().equals(s.getId()) && !Repo.str(o, "review").isEmpty())
            {
                peers.add(Prompts.reviewSummaryLine(Repo.str(o, "review")));
            }
        }
        final String requirements = Repo.str(a, "requirements") + "\n" + Repo.str(a, "title");
        final String filesText = filesText(s);
        final String repoUrl = Repo.str(s, "repoUrl");
        final boolean english = "en".equals(getResources().getConfiguration().getLocales().get(0).getLanguage());
        Ui.toast(this, getString(R.string.working));
        worker.execute(new Runnable()
        {
            @Override
            public void run()
            {
                String msg;
                try
                {
                    String text = filesText;
                    if (!repoUrl.isEmpty())
                    {
                        text = text + GitHub.repoText(repoUrl);
                    }
                    String[] m = Prompts.review(requirements, text, peers, english);
                    String review = Ai.chat(AssignmentsActivity.this, m[0], m[1]);
                    Map<String, Object> f = new HashMap<String, Object>();
                    f.put("review", review);
                    Repo.get().updateSubmission(a.getId(), s.getId(), f);
                    msg = getString(R.string.saved);
                }
                catch (IOException e)
                {
                    msg = getString(R.string.error) + ": " + e.getMessage();
                }
                final String done = msg;
                main.post(new Runnable()
                {
                    @Override
                    public void run()
                    {
                        Ui.toast(AssignmentsActivity.this, done);
                    }
                });
            }
        });
    }

    /**
     * Joins the uploaded files of a submission.
     * @param (DocumentSnapshot) s Submission.
     * @return (String) "===== name =====" blocks.
     */
    @SuppressWarnings("unchecked")
    private static String filesText(DocumentSnapshot s)
    {
        StringBuilder out = new StringBuilder();
        Object o = s.get("files");
        if (o instanceof List)
        {
            for (Object item : (List<Object>) o)
            {
                if (item instanceof Map)
                {
                    Map<String, Object> f = (Map<String, Object>) item;
                    out.append("\n===== ").append(f.get("name")).append(" =====\n").append(f.get("text")).append('\n');
                }
            }
        }
        return out.toString();
    }

    /**
     * Reads the picked files as text (up to MAX_UPLOAD_BYTES in total).
     * @param (List&lt;Uri&gt;) uris Picked files.
     */
    private void readFiles(List<Uri> uris)
    {
        chosenFiles.clear();
        long total = 0;
        try
        {
            for (Uri u : uris)
            {
                InputStream in = getContentResolver().openInputStream(u);
                if (in == null)
                {
                    continue;
                }
                byte[] bytes;
                try
                {
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n = in.read(buf);
                    while (n > 0)
                    {
                        out.write(buf, 0, n);
                        n = in.read(buf);
                    }
                    bytes = out.toByteArray();
                }
                finally
                {
                    in.close();
                }
                total += bytes.length;
                if (total > MAX_UPLOAD_BYTES)
                {
                    chosenFiles.clear();
                    Ui.toast(this, getString(R.string.files_too_big));
                    return;
                }
                Map<String, Object> f = new HashMap<String, Object>();
                f.put("name", displayName(u));
                f.put("text", new String(bytes, StandardCharsets.UTF_8));
                chosenFiles.add(f);
            }
            Ui.toast(this, chosenFiles.size() + " ✓");
        }
        catch (IOException e)
        {
            Ui.toast(this, getString(R.string.error) + ": " + e.getMessage());
        }
    }

    /**
     * Returns the file name of a picked document.
     * @param (Uri) u Document.
     * @return (String) File name.
     */
    private String displayName(Uri u)
    {
        Cursor c = getContentResolver().query(u, null, null, null, null);
        if (c == null)
        {
            return u.getLastPathSegment();
        }
        try
        {
            int col = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
            if (col >= 0 && c.moveToFirst())
            {
                return c.getString(col);
            }
            return u.getLastPathSegment();
        }
        finally
        {
            c.close();
        }
    }

    /** Removes the submission listeners. */
    private void clearSubListeners()
    {
        for (ListenerRegistration r : subListeners)
        {
            r.remove();
        }
        subListeners.clear();
    }
}
