package il.ac.ariel.smartclass.ui;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;

import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.ListenerRegistration;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.core.Faces;
import il.ac.ariel.smartclass.data.Repo;

/**
 * The last step after scanning (same as the website): the class photo, the student taps
 * their own face, sees it big ("is this you?") and confirms. "I can't find myself" tells the
 * lecturer at once. One student per face.
 */
public final class FacePickActivity extends BaseActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Intent extra: the session id. */
    public static final String EXTRA_SID = "sid";

    /** Side of the "is this you?" picture, in dp. */
    private static final int CROP_DP = 140;

    /** Session. */
    private String sid;

    /** The photo with boxes. */
    private FacePickView view;

    /** "Is this you?" row. */
    private LinearLayout confirm;

    /** The zoomed face. */
    private ImageView cropView;

    /** Status line. */
    private TextView status;

    /** Current photo version (null = no photo yet). */
    private Long version;

    /** Taken boxes listener (per version). */
    private ListenerRegistration takenReg;

    /** My record. */
    private DocumentSnapshot mine;

    /** Taken ids. */
    private Set<Integer> taken = new HashSet<Integer>();

    /** The face being confirmed. */
    private int chosen;

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the screen and starts watching the photo and my record.
     * @param (Bundle) saved Saved state (unused).
     */
    @Override
    protected void onCreate(@Nullable Bundle saved)
    {
        super.onCreate(saved);
        sid = getIntent().getStringExtra(EXTRA_SID);
        LinearLayout col = Ui.screen(this);
        Ui.title(col, getString(R.string.pick_title));
        Ui.text(col, getString(R.string.pick_hint));
        view = new FacePickView(this);
        col.addView(view);
        confirm = Ui.row(this);
        cropView = new ImageView(this);
        int side = Ui.dp(this, CROP_DP);
        confirm.addView(cropView, new LinearLayout.LayoutParams(side, side));
        LinearLayout ask = Ui.column(this);
        Ui.title(ask, getString(R.string.is_this_you));
        Ui.button(ask, getString(R.string.yes_me), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                choose(chosen);
            }
        });
        Ui.button(ask, getString(R.string.not_me), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                select(0);
            }
        });
        confirm.addView(ask);
        confirm.setVisibility(View.GONE);
        col.addView(confirm);
        final Button none = Ui.button(col, getString(R.string.cant_find), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                choose(Faces.NOT_FOUND);
            }
        });
        none.setAlpha(0.85f);
        status = Ui.text(col, "");
        view.setOnPick(new FacePickView.OnPick()
        {
            @Override
            public void onPick(int id)
            {
                select(id);
            }
        });
        keep(Repo.get().listenPhoto(sid, new Repo.Listener<DocumentSnapshot>()
        {
            @Override
            public void onChange(DocumentSnapshot d)
            {
                showPhoto(d);
            }
        }));
        keep(Repo.get().listenMyAttendance(sid, new Repo.Listener<DocumentSnapshot>()
        {
            @Override
            public void onChange(DocumentSnapshot d)
            {
                mine = d;
                draw();
            }
        }));
    }

    /** Stops the per-version listener too. */
    @Override
    protected void onDestroy()
    {
        if (takenReg != null)
        {
            takenReg.remove();
        }
        super.onDestroy();
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * A new or changed photo.
     * @param (DocumentSnapshot) d The photo document.
     */
    private void showPhoto(DocumentSnapshot d)
    {
        if (d == null || !d.exists())
        {
            version = null;
            draw();
            return;
        }
        Long v = d.getLong("v");
        Object raw = d.get("boxes");
        Bitmap bmp = decode(d.getString("image"));
        if (bmp == null || v == null)
        {
            return;
        }
        boolean isNew = version == null || version.longValue() != v.longValue();
        version = v;
        view.setPhoto(bmp, Faces.fromMaps(raw instanceof List ? (List<?>) raw : null));
        if (isNew)
        {
            watchTaken(v);
        }
        draw();
    }

    /**
     * Watches the taken faces of one photo version.
     * @param (long) v Version.
     */
    private void watchTaken(long v)
    {
        if (takenReg != null)
        {
            takenReg.remove();
        }
        takenReg = Repo.get().listenTakenFaces(sid, v, new Repo.Listener<List<DocumentSnapshot>>()
        {
            @Override
            public void onChange(List<DocumentSnapshot> list)
            {
                Set<Integer> ids = new HashSet<Integer>();
                for (DocumentSnapshot c : list)
                {
                    String[] parts = c.getId().split("_");
                    if (parts.length == 2)
                    {
                        ids.add(Integer.parseInt(parts[1]));
                    }
                }
                taken = ids;
                draw();
            }
        });
    }

    /** Shows what is left to do. */
    private void draw()
    {
        boolean scanned = mine != null && mine.exists();
        Long face = scanned ? mine.getLong("face") : null;
        Long photoV = scanned ? mine.getLong("photoV") : null;
        Faces.Step step = Faces.myStep(scanned, face, photoV, version);
        int myId = step == Faces.Step.DONE && face != null ? face.intValue() : 0;
        view.setTaken(taken, myId);
        view.setVisibility(version == null ? View.GONE : View.VISIBLE);
        switch (step)
        {
            case DONE:
                status.setText(getString(R.string.pick_done));
                break;
            case TOLD:
                status.setText(getString(R.string.told_lecturer));
                break;
            case NO_PHOTO:
                status.setText(getString(R.string.wait_photo));
                break;
            default:
                status.setText("");
        }
    }

    /**
     * Shows one face big and asks "is this you?".
     * @param (int) id Box id (0 = hide).
     */
    private void select(int id)
    {
        chosen = id;
        view.select(id);
        if (id == 0)
        {
            confirm.setVisibility(View.GONE);
            return;
        }
        cropView.setImageBitmap(view.crop(id, Ui.dp(this, CROP_DP)));
        confirm.setVisibility(View.VISIBLE);
    }

    /**
     * Sends my choice.
     * @param (int) id Box id or Faces.NOT_FOUND.
     */
    private void choose(int id)
    {
        if (version == null || id == 0)
        {
            return;
        }
        Repo.get().chooseFace(sid, version, id, new Repo.Done<Void>()
        {
            @Override
            public void onDone(@Nullable Void value, @Nullable Exception error)
            {
                select(0);
                if (error != null)
                {
                    Ui.toast(FacePickActivity.this, getString(R.string.box_taken));
                }
            }
        });
    }

    /**
     * Decodes a "data:image/jpeg;base64,..." photo.
     * @param (String) dataUrl Data URL.
     * @return (Bitmap) Photo, or null.
     */
    private static Bitmap decode(@Nullable String dataUrl)
    {
        if (dataUrl == null || dataUrl.indexOf(',') < 0)
        {
            return null;
        }
        byte[] bytes = Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), Base64.DEFAULT);
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
    }
}
