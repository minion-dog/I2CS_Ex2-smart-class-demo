package il.ac.ariel.smartclass.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.ListenerRegistration;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.core.AttendanceSheet;
import il.ac.ariel.smartclass.data.Repo;

/**
 * The student's home: the scan button, my attendance in recent lectures (with "waiting to
 * send" when offline), the list of lectures and the assignments.
 */
public class StudentHomeActivity extends BaseActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Lectures shown with their attendance status. */
    private static final int RECENT = 5;

    /** Refilled by the live sessions list. */
    private LinearLayout lectures;

    /** One status line per recent lecture. */
    private final Map<String, TextView> statusLines = new HashMap<String, TextView>();

    /** Live listeners of my own records, per session. */
    private final Map<String, ListenerRegistration> myRecords = new HashMap<String, ListenerRegistration>();

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
        Ui.text(col, Repo.get().myName() + " · " + Repo.get().myEmail());
        Ui.button(col, getString(R.string.scan), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                startActivity(new Intent(StudentHomeActivity.this, ScanActivity.class));
            }
        });
        Ui.button(col, getString(R.string.assignments), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                startActivity(new Intent(StudentHomeActivity.this, AssignmentsActivity.class));
            }
        });
        Ui.title(col, getString(R.string.lectures));
        lectures = Ui.box(col);
        keep(Repo.get().listenSessions(new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                showLectures(list);
            }
        }));
    }

    /** Removes the per-session listeners too. */
    @Override
    protected void onDestroy()
    {
        for (ListenerRegistration r : myRecords.values())
        {
            r.remove();
        }
        super.onDestroy();
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Shows the lectures; the recent ones with my attendance status.
     * @param (List&lt;DocumentSnapshot&gt;) list Sessions, newest first.
     */
    private void showLectures(List<DocumentSnapshot> list)
    {
        lectures.removeAllViews();
        statusLines.clear();
        for (int i = 0; i < list.size(); i++)
        {
            final DocumentSnapshot s = list.get(i);
            String label = Repo.str(s, "title") + " · " + Ui.when(Repo.num(s, "startedAt"));
            if (Repo.isOpen(s))
            {
                label = "● " + label;
            }
            Ui.button(lectures, label, new View.OnClickListener()
            {
                @Override
                public void onClick(View v)
                {
                    Intent in = new Intent(StudentHomeActivity.this, LectureActivity.class);
                    in.putExtra(LectureActivity.EXTRA_SESSION, s.getId());
                    in.putExtra(LectureActivity.EXTRA_TITLE, Repo.str(s, "title"));
                    startActivity(in);
                }
            });
            if (i < RECENT)
            {
                TextView line = Ui.text(lectures, "");
                statusLines.put(s.getId(), line);
                watchMine(s.getId());
            }
        }
    }

    /**
     * Watches my attendance record of one session and writes it under the lecture.
     * @param (String) sid Session.
     */
    private void watchMine(final String sid)
    {
        ListenerRegistration old = myRecords.remove(sid);
        if (old != null)
        {
            old.remove();
        }
        myRecords.put(sid, Repo.get().listenMyAttendance(sid, new Repo.Listener<DocumentSnapshot>()
        {
            @Override
            public void onChange(DocumentSnapshot d)
            {
                TextView line = statusLines.get(sid);
                if (line == null)
                {
                    return;
                }
                if (!d.exists())
                {
                    line.setText("   " + getString(R.string.absent));
                    return;
                }
                String text = "   " + statusLabel(Repo.str(d, "status"));
                if (d.getMetadata().hasPendingWrites())
                {
                    text = text + " · ⏳ " + getString(R.string.scan_pending);
                }
                line.setText(text);
            }
        }));
    }

    /**
     * Returns the label of a status.
     * @param (String) status Stored status.
     * @return (String) Label.
     */
    private String statusLabel(String status)
    {
        if (AttendanceSheet.PRESENT.equals(status))
        {
            return getString(R.string.in_class);
        }
        if (AttendanceSheet.ZOOM.equals(status))
        {
            return getString(R.string.on_zoom);
        }
        return getString(R.string.manual);
    }
}
