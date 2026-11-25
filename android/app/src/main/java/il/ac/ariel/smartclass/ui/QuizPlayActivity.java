package il.ac.ariel.smartclass.ui;

import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.google.firebase.Timestamp;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.ListenerRegistration;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.core.Quiz;
import il.ac.ariel.smartclass.data.Repo;

/**
 * The student's side of the live quiz (same as web/js/ui/quiz-play.js): "get ready" -> four
 * big coloured buttons -> right / wrong with the points -> my place -> final place.
 */
public final class QuizPlayActivity extends BaseActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Intent extras. */
    public static final String EXTRA_SID = "sid";

    /** Intent extra: the quiz id. */
    public static final String EXTRA_QID = "qid";

    /** Background (Kahoot purple). */
    private static final int BG = 0xFF46178F;

    /** Timer refresh. */
    private static final long TICK_MS = 250;

    /** Session and quiz. */
    private String sid;

    /** Quiz id. */
    private String qid;

    /** Content area. */
    private LinearLayout box;

    /** The latest quiz document. */
    private DocumentSnapshot quiz;

    /** My answers: question index -> chosen option. */
    private final Map<Long, Long> chosen = new HashMap<Long, Long>();

    /** My score before the current question (to show "+points"). */
    private long prevScore;

    /** My score now. */
    private long myScore;

    /** Timer label (question phase). */
    private TextView timer;

    /** Ticks the timer. */
    private final Handler main = new Handler(Looper.getMainLooper());

    /** Last drawn phase (phase + index). */
    private String drawn = "";

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the screen and follows the quiz.
     * @param (Bundle) saved Saved state (unused).
     */
    @Override
    protected void onCreate(@Nullable Bundle saved)
    {
        super.onCreate(saved);
        sid = getIntent().getStringExtra(EXTRA_SID);
        qid = getIntent().getStringExtra(EXTRA_QID);
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setBackgroundColor(BG);
        int pad = Ui.dp(this, 16);
        box.setPadding(pad, pad, pad, pad);
        setContentView(box);
        keep(Repo.get().listenQuizzes(sid, new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                for (DocumentSnapshot d : list)
                {
                    if (d.getId().equals(qid))
                    {
                        quiz = d;
                        draw();
                    }
                }
            }
        }));
        keep(Repo.get().listenMyQuizAnswers(sid, qid, new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                for (DocumentSnapshot a : list)
                {
                    chosen.put(Repo.num(a, "index"), Repo.num(a, "option"));
                }
                drawn = "";
                draw();
            }
        }));
    }

    /** Stops the timer. */
    @Override
    protected void onDestroy()
    {
        main.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /** Draws the current phase. */
    @SuppressWarnings("unchecked")
    private void draw()
    {
        if (quiz == null)
        {
            return;
        }
        Map<String, Object> st = (Map<String, Object>) quiz.get("state");
        List<Map<String, Object>> qs = (List<Map<String, Object>>) quiz.get("questions");
        if (st == null || qs == null)
        {
            return;
        }
        String phase = String.valueOf(st.get("phase"));
        long index = st.get("index") instanceof Number ? ((Number) st.get("index")).longValue() : -1;
        Map<String, Object> scores = (Map<String, Object>) st.get("scores");
        Map<String, Object> mine = scores == null ? null : (Map<String, Object>) scores.get(Repo.get().user().getUid());
        long score = mine != null && mine.get("score") instanceof Number ? ((Number) mine.get("score")).longValue() : 0;
        long rank = mine != null && mine.get("rank") instanceof Number ? ((Number) mine.get("rank")).longValue() : 0;
        String key = phase + ":" + index + ":" + chosen.containsKey(index);
        if (key.equals(drawn))
        {
            return;
        }
        if ("question".equals(phase) && !drawn.startsWith("question:" + index))
        {
            prevScore = myScore;                      // points of this question = after - before
        }
        myScore = score;
        drawn = key;
        main.removeCallbacksAndMessages(null);
        box.removeAllViews();
        String title = Repo.str(quiz, "title");
        if ("lobby".equals(phase))
        {
            big(title, 34);
            big(getString(R.string.quiz_ready), 20);
            return;
        }
        if ("end".equals(phase))
        {
            big("🏆 " + title, 30);
            big(rank > 0 ? "#" + rank : "", 48);
            big(getString(R.string.quiz_score) + ": " + score, 22);
            return;
        }
        if (index < 0 || index >= qs.size())
        {
            return;
        }
        Map<String, Object> q = qs.get((int) index);
        List<String> options = (List<String>) q.get("options");
        long seconds = q.get("seconds") instanceof Number ? ((Number) q.get("seconds")).longValue() : 20;
        if ("question".equals(phase))
        {
            Object at = st.get("startedAt");
            final long start = at instanceof Timestamp ? ((Timestamp) at).toDate().getTime() : System.currentTimeMillis();
            timer = big(String.valueOf(Quiz.secondsLeft(start, seconds, System.currentTimeMillis())), 40);
            final long secs = seconds;
            main.post(new Runnable()
            {
                @Override
                public void run()
                {
                    timer.setText(String.valueOf(Quiz.secondsLeft(start, secs, System.currentTimeMillis())));
                    main.postDelayed(this, TICK_MS);
                }
            });
            if (chosen.containsKey(index))
            {
                big("✓ " + getString(R.string.quiz_sent), 30);
                return;
            }
            big(String.valueOf(q.get("q")), 18);
            for (int i = 0; i < options.size(); i++)
            {
                answerButton(index, i, options.get(i));
            }
            return;
        }
        long correct = st.get("correct") instanceof Number ? ((Number) st.get("correct")).longValue() : -1;
        boolean mineRight = chosen.containsKey(index) && chosen.get(index) == correct;
        big(chosen.containsKey(index) ? (mineRight ? "✓ " + getString(R.string.quiz_right) : "✗ " + getString(R.string.quiz_wrong))
                : "⏱ " + getString(R.string.quiz_no_answer), 32);
        if (mineRight)
        {
            big("+" + (score - prevScore), 24);
        }
        big(getString(R.string.quiz_score) + ": " + score + (rank > 0 ? " · #" + rank : ""), 20);
        if (correct >= 0 && correct < options.size())
        {
            TextView c = big(Quiz.SHAPES[(int) correct] + "  " + options.get((int) correct), 20);
            c.setBackgroundColor(Quiz.COLORS[(int) correct]);
        }
    }

    /**
     * A big coloured answer button.
     * @param (long) index Question.
     * @param (int) i Option.
     * @param (String) text Answer.
     */
    private void answerButton(final long index, final int i, String text)
    {
        Button b = new Button(this);
        b.setText(Quiz.SHAPES[i] + "\n" + text);
        b.setTextSize(20);
        b.setTextColor(Color.WHITE);
        b.setAllCaps(false);
        b.setBackgroundColor(Quiz.COLORS[i]);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f);
        lp.topMargin = Ui.dp(this, 8);
        b.setOnClickListener(new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                chosen.put(index, (long) i);
                drawn = "";
                draw();
                Repo.get().answerQuiz(sid, qid, index, i, new Repo.Done<Void>()
                {
                    @Override
                    public void onDone(@Nullable Void value, @Nullable Exception error)
                    {
                        if (error != null)
                        {
                            Ui.toast(QuizPlayActivity.this, getString(R.string.quiz_late));
                        }
                    }
                });
            }
        });
        box.addView(b, lp);
    }

    /**
     * A centred white text line.
     * @param (String) text Text.
     * @param (int) sp Size.
     * @return (TextView) The line.
     */
    private TextView big(String text, int sp)
    {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(sp);
        t.setTextColor(Color.WHITE);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setGravity(Gravity.CENTER);
        int pad = Ui.dp(this, 8);
        t.setPadding(pad, pad, pad, pad);
        box.addView(t);
        return t;
    }
}
