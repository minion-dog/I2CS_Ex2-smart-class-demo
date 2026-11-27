package il.ac.ariel.smartclass.ui;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.AutoCompleteTextView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.google.firebase.firestore.DocumentSnapshot;
import com.google.zxing.WriterException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.core.AttendanceSheet;
import il.ac.ariel.smartclass.core.ClassList;
import il.ac.ariel.smartclass.core.Payload;
import il.ac.ariel.smartclass.core.Student;
import il.ac.ariel.smartclass.data.Repo;

/**
 * The lecturer's live lecture: the noisy QR (a new secret code every 5 s), the counters,
 * the live attendance list with manual marking, and the way to comments/polls/summary.
 */
public class LiveSessionActivity extends BaseActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** The lecture. */
    private String sid;

    /** The lecture title. */
    private String title;

    /** The animated QR. */
    private QrNoiseView qr;

    /** Counters line. */
    private TextView counters;

    /** Live attendance list. */
    private LinearLayout attendanceBox;

    /** Class list, for names and manual marking. */
    private final Map<String, Student> roster = new HashMap<String, Student>();

    /** Rotates the code. */
    private final Handler main = new Handler(Looper.getMainLooper());

    /** Publishes a new code and schedules the next one. */
    private final Runnable rotate = new Runnable()
    {
        @Override
        public void run()
        {
            String token = Payload.newToken();
            Repo.get().publishCode(sid, token);
            try
            {
                qr.setText(Payload.encode(sid, token));
            }
            catch (WriterException e)
            {
                Ui.toast(LiveSessionActivity.this, getString(R.string.error) + ": " + e.getMessage());
            }
            main.postDelayed(this, Payload.ROTATE_MS);
        }
    };

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the screen and starts the QR.
     * @param (Bundle) saved Saved state (unused).
     */
    @Override
    protected void onCreate(@Nullable Bundle saved)
    {
        super.onCreate(saved);
        sid = getIntent().getStringExtra(LectureActivity.EXTRA_SESSION);
        title = getIntent().getStringExtra(LectureActivity.EXTRA_TITLE);
        LinearLayout col = Ui.screen(this);
        Ui.hero(col, title, "");
        qr = new QrNoiseView(this);
        col.addView(qr);
        counters = Ui.title(col, "");
        Ui.button(col, getString(R.string.open_lecture), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                Intent in = new Intent(LiveSessionActivity.this, LectureActivity.class);
                in.putExtra(LectureActivity.EXTRA_SESSION, sid);
                in.putExtra(LectureActivity.EXTRA_TITLE, title);
                startActivity(in);
            }
        });
        Ui.button(col, getString(R.string.end_session), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                Map<String, Object> f = new HashMap<String, Object>();
                f.put("endedAt", System.currentTimeMillis());
                Repo.get().updateSession(sid, f);
                finish();
            }
        });
        buildManual(col);
        attendanceBox = Ui.box(col);
        keep(Repo.get().listenAttendance(sid, new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                showAttendance(list);
            }
        }));
    }

    /** Starts rotating the code while the screen is visible. */
    @Override
    protected void onResume()
    {
        super.onResume();
        main.post(rotate);
    }

    /** Stops rotating while hidden. */
    @Override
    protected void onPause()
    {
        main.removeCallbacks(rotate);
        super.onPause();
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Adds the manual-marking field (suggests emails from the class list).
     * @param (LinearLayout) col Screen column.
     */
    private void buildManual(LinearLayout col)
    {
        Ui.title(col, getString(R.string.mark_by_hand));
        final AutoCompleteTextView field = new AutoCompleteTextView(this);
        field.setHint(getString(R.string.email));
        field.setSingleLine(true);
        col.addView(field);
        Repo.get().listRoster(new Repo.Done<List<Student>>()
        {
            @Override
            public void onDone(@Nullable List<Student> list, @Nullable Exception error)
            {
                if (list == null)
                {
                    return;
                }
                List<String> emails = new ArrayList<String>();
                for (Student s : list)
                {
                    roster.put(s.email(), s);
                    if (!s.staff())
                    {
                        emails.add(s.email());
                    }
                }
                field.setAdapter(new ArrayAdapter<String>(LiveSessionActivity.this,
                    android.R.layout.simple_dropdown_item_1line, emails));
            }
        });
        Ui.button(col, getString(R.string.mark_by_hand), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                String email = ClassList.normaliseEmail(field.getText().toString());
                if (!roster.containsKey(email))
                {
                    Ui.toast(LiveSessionActivity.this, getString(R.string.not_on_list));
                    return;
                }
                Repo.get().setAttendance(sid, email, AttendanceSheet.MANUAL);
                field.setText("");
            }
        });
    }

    /**
     * Draws the counters and the attendance list.
     * @param (List&lt;DocumentSnapshot&gt;) list Attendance records.
     */
    private void showAttendance(List<DocumentSnapshot> list)
    {
        int present = 0;
        int zoom = 0;
        int manual = 0;
        attendanceBox.removeAllViews();
        for (final DocumentSnapshot r : list)
        {
            String status = Repo.str(r, "status");
            String label;
            if (AttendanceSheet.PRESENT.equals(status))
            {
                present++;
                label = getString(R.string.in_class);
            }
            else if (AttendanceSheet.ZOOM.equals(status))
            {
                zoom++;
                label = getString(R.string.on_zoom);
            }
            else
            {
                manual++;
                label = getString(R.string.manual);
            }
            final String email = r.getId();
            String name = email;
            Student s = roster.get(email);
            if (s != null)
            {
                name = s.fullName();
            }
            Ui.text(attendanceBox, label + " · " + name + " · " + Ui.when(Repo.num(r, "scannedAt")));
            Ui.button(attendanceBox, getString(R.string.remove), new View.OnClickListener()
            {
                @Override
                public void onClick(View v)
                {
                    Repo.get().setAttendance(sid, email, null);
                }
            });
        }
        counters.setText(getString(R.string.in_class) + " " + present + " · " + getString(R.string.on_zoom) + " " + zoom
            + " · " + getString(R.string.manual) + " " + manual);
    }
}
