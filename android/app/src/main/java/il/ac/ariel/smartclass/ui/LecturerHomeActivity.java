package il.ac.ariel.smartclass.ui;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;

import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.core.content.FileProvider;

import com.google.firebase.firestore.DocumentSnapshot;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.core.AttendanceSheet;
import il.ac.ariel.smartclass.core.ClassList;
import il.ac.ariel.smartclass.core.Student;
import il.ac.ariel.smartclass.core.Xlsx;
import il.ac.ariel.smartclass.data.Repo;

/**
 * The lecturer's home: start a lecture, the list of lectures, the attendance sheet export
 * (XLSX, shared to mail/Drive/WhatsApp), the class-list import, assignments and settings.
 * Head counting runs on the website (it needs the TensorFlow.js model).
 */
public class LecturerHomeActivity extends BaseActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** XLSX MIME type. */
    private static final String XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /** Refilled by the live sessions list. */
    private LinearLayout sessionsBox;

    /** The latest sessions (for the export). */
    private List<DocumentSnapshot> sessions = new ArrayList<DocumentSnapshot>();

    /** Picks the class-list file. */
    private ActivityResultLauncher<String[]> pickRoster;

    /** Lecture title field. */
    private EditText titleField;

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
        titleField = Ui.field(col, getString(R.string.session_title));
        titleField.setText(getString(R.string.lectures) + " " + DateFormat.getDateInstance(DateFormat.SHORT).format(new Date()));
        Ui.button(col, getString(R.string.start_session), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                create();
            }
        });
        pickRoster = registerForActivityResult(new ActivityResultContracts.OpenDocument(), new ActivityResultCallback<Uri>()
        {
            @Override
            public void onActivityResult(Uri uri)
            {
                if (uri != null)
                {
                    importRoster(uri);
                }
            }
        });
        Ui.button(col, getString(R.string.export_sheet), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                exportSheet();
            }
        });
        Ui.button(col, getString(R.string.import_roster), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                pickRoster.launch(new String[] {"text/*", XLSX_MIME, "application/octet-stream"});
            }
        });
        Ui.button(col, getString(R.string.assignments), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                startActivity(new Intent(LecturerHomeActivity.this, AssignmentsActivity.class));
            }
        });
        Ui.button(col, getString(R.string.head_count_web), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(getString(R.string.web_url))));
            }
        });
        Ui.button(col, getString(R.string.settings), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                startActivity(new Intent(LecturerHomeActivity.this, SettingsActivity.class));
            }
        });
        Ui.title(col, getString(R.string.lectures));
        sessionsBox = Ui.box(col);
        keep(Repo.get().listenSessions(new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                sessions = list;
                showSessions();
            }
        }));
    }

    // ==========================================
    //              BUILD PIPELINE
    // ==========================================

    /**
     * Creates the session and opens its live screen (no location: attendance is the live scan).
     */
    private void create()
    {
        final String title = titleField.getText().toString().trim();
        Repo.get().createSession(title, new Repo.Done<String>()
        {
            @Override
            public void onDone(@Nullable String id, @Nullable Exception error)
            {
                if (id == null)
                {
                    Ui.toast(LecturerHomeActivity.this, getString(R.string.error));
                    return;
                }
                openLive(id, title);
            }
        });
    }

    /**
     * Builds the attendance sheet of all lectures and shares it as an .xlsx file.
     */
    private void exportSheet()
    {
        Ui.toast(this, getString(R.string.working));
        Repo.get().listRoster(new Repo.Done<List<Student>>()
        {
            @Override
            public void onDone(@Nullable final List<Student> roster, @Nullable Exception error)
            {
                if (roster == null)
                {
                    Ui.toast(LecturerHomeActivity.this, getString(R.string.error));
                    return;
                }
                Repo.get().loadAttendance(Repo.infos(sessions), new Repo.Done<Map<String, Map<String, String>>>()
                {
                    @Override
                    public void onDone(@Nullable Map<String, Map<String, String>> att, @Nullable Exception e2)
                    {
                        if (att == null)
                        {
                            Ui.toast(LecturerHomeActivity.this, getString(R.string.error));
                            return;
                        }
                        share(AttendanceSheet.build(roster, Repo.infos(sessions), att));
                    }
                });
            }
        });
    }

    /**
     * Writes the sheet to a file and opens the share menu.
     * @param (AttendanceSheet) sheet The table.
     */
    private void share(AttendanceSheet sheet)
    {
        try
        {
            File dir = new File(getCacheDir(), "exports");
            if (!dir.isDirectory() && !dir.mkdirs())
            {
                throw new IOException("cannot create " + dir);
            }
            File f = new File(dir, "attendance.xlsx");
            FileOutputStream out = new FileOutputStream(f);
            try
            {
                out.write(Xlsx.write("נוכחות", sheet.table()));
            }
            finally
            {
                out.close();
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(XLSX_MIME);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(send, getString(R.string.export_sheet)));
        }
        catch (IOException e)
        {
            Ui.toast(this, getString(R.string.error) + ": " + e.getMessage());
        }
    }

    /**
     * Reads a CSV or XLSX class list and saves it.
     * @param (Uri) uri The picked file.
     */
    private void importRoster(Uri uri)
    {
        try
        {
            InputStream raw = getContentResolver().openInputStream(uri);
            if (raw == null)
            {
                throw new IOException("cannot open the file");
            }
            BufferedInputStream in = new BufferedInputStream(raw);
            List<List<String>> rows;
            try
            {
                in.mark(4);
                int b0 = in.read();
                int b1 = in.read();
                in.reset();
                if (b0 == 'P' && b1 == 'K')
                {
                    rows = Xlsx.read(in);
                }
                else
                {
                    rows = ClassList.parseCsv(new String(readAll(in), StandardCharsets.UTF_8));
                }
            }
            finally
            {
                in.close();
            }
            final List<Student> entries = ClassList.fromRows(rows);
            Repo.get().saveRoster(entries, new Repo.Done<Integer>()
            {
                @Override
                public void onDone(@Nullable Integer n, @Nullable Exception error)
                {
                    if (n == null)
                    {
                        Ui.toast(LecturerHomeActivity.this, getString(R.string.error));
                        return;
                    }
                    Ui.toast(LecturerHomeActivity.this, n + " " + getString(R.string.roster_imported));
                }
            });
        }
        catch (IOException e)
        {
            Ui.toast(this, getString(R.string.error) + ": " + e.getMessage());
        }
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /** Shows the lectures: open ones go to the live screen, ended ones to the lecture page. */
    private void showSessions()
    {
        sessionsBox.removeAllViews();
        for (final DocumentSnapshot s : sessions)
        {
            String label = Repo.str(s, "title") + " · " + Ui.when(Repo.num(s, "startedAt"));
            if (Repo.isOpen(s))
            {
                label = "● " + label;
            }
            Ui.button(sessionsBox, label, new View.OnClickListener()
            {
                @Override
                public void onClick(View v)
                {
                    if (Repo.isOpen(s))
                    {
                        openLive(s.getId(), Repo.str(s, "title"));
                    }
                    else
                    {
                        Intent in = new Intent(LecturerHomeActivity.this, LectureActivity.class);
                        in.putExtra(LectureActivity.EXTRA_SESSION, s.getId());
                        in.putExtra(LectureActivity.EXTRA_TITLE, Repo.str(s, "title"));
                        startActivity(in);
                    }
                }
            });
        }
    }

    /**
     * Opens the live screen of a lecture.
     * @param (String) id Session id.
     * @param (String) title Title.
     */
    private void openLive(String id, String title)
    {
        Intent in = new Intent(this, LiveSessionActivity.class);
        in.putExtra(LectureActivity.EXTRA_SESSION, id);
        in.putExtra(LectureActivity.EXTRA_TITLE, title);
        startActivity(in);
    }

    /**
     * Reads a stream fully.
     * @param (InputStream) in Stream.
     * @return (byte[]) Bytes.
     * @throws (IOException) On a read error.
     */
    private static byte[] readAll(InputStream in) throws IOException
    {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n = in.read(buf);
        while (n > 0)
        {
            out.write(buf, 0, n);
            n = in.read(buf);
        }
        return out.toByteArray();
    }
}
