package il.ac.ariel.smartclass.ui;

import android.content.Intent;
import android.Manifest;
import android.annotation.SuppressLint;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.result.ActivityResultCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.Preview;
import androidx.camera.core.ZoomState;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.firebase.firestore.DocumentSnapshot;

import java.util.Locale;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.core.Payload;
import il.ac.ariel.smartclass.data.Repo;

/**
 * Attendance scan: camera -> flicker QR change map -> in class.
 * Decision: attendance is physical only. Only someone in the room can film the live code
 * (a photo or a Zoom stream loses the flicker), so a real scan = in class. No location.
 * Students at the back zoom with the + / - buttons or by pinching the camera picture.
 * Works offline: the record waits on the phone and is sent when the internet returns.
 */
public class ScanActivity extends BaseActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** One tap of + or - changes the zoom by this much. */
    private static final float ZOOM_STEP = 0.5f;

    /** Camera preview. */
    private PreviewView preview;

    /** Result line. */
    private TextView result;

    /** Shows the zoom, e.g. "2.5x". */
    private TextView zoomLabel;

    /** The bound camera (for zoom), or null before it starts. */
    private Camera camera;

    /** Background thread for frame analysis. */
    private final ExecutorService analysis = Executors.newSingleThreadExecutor();

    /** Asks for the camera permission. */
    private ActivityResultLauncher<String> permission;

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the screen and asks for the camera.
     * @param (Bundle) saved Saved state (unused).
     */
    @Override
    protected void onCreate(@Nullable Bundle saved)
    {
        super.onCreate(saved);
        LinearLayout col = Ui.screen(this);
        Ui.title(col, getString(R.string.scan));
        Ui.text(col, getString(R.string.scan_hint));
        preview = new PreviewView(this);
        int side = getResources().getDisplayMetrics().widthPixels - Ui.dp(this, 32);
        col.addView(preview, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, side));
        LinearLayout zoomRow = Ui.row(this);
        col.addView(zoomRow);
        Ui.button(zoomRow, "−", new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                zoomBy(-ZOOM_STEP);
            }
        });
        zoomLabel = Ui.title(zoomRow, "1x");
        Ui.button(zoomRow, "+", new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                zoomBy(ZOOM_STEP);
            }
        });
        result = Ui.title(col, "");
        pinchToZoom();
        permission = registerForActivityResult(new ActivityResultContracts.RequestPermission(),
            new ActivityResultCallback<Boolean>()
            {
                @Override
                public void onActivityResult(Boolean granted)
                {
                    if (hasCamera())
                    {
                        startCamera();
                    }
                    else
                    {
                        result.setText(getString(R.string.camera_denied));
                    }
                }
            });
        permission.launch(Manifest.permission.CAMERA);
    }

    /** Stops the analysis thread. */
    @Override
    protected void onDestroy()
    {
        analysis.shutdown();
        super.onDestroy();
    }

    // ==========================================
    //              BUILD PIPELINE
    // ==========================================

    /** Binds the camera preview and the change-map analyzer to this screen. */
    private void startCamera()
    {
        final ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(new Runnable()
        {
            @Override
            public void run()
            {
                try
                {
                    ProcessCameraProvider provider = future.get();
                    Preview p = new Preview.Builder().build();
                    p.setSurfaceProvider(preview.getSurfaceProvider());
                    ImageAnalysis a = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build();
                    a.setAnalyzer(analysis, new QrAnalyzer(new QrAnalyzer.OnText()
                    {
                        @Override
                        public void onText(final String text)
                        {
                            runOnUiThread(new Runnable()
                            {
                                @Override
                                public void run()
                                {
                                    onScanned(text);
                                }
                            });
                        }
                    }));
                    provider.unbindAll();
                    camera = provider.bindToLifecycle(ScanActivity.this, CameraSelector.DEFAULT_BACK_CAMERA, p, a);
                    result.setText("…");
                }
                catch (ExecutionException | InterruptedException e)
                {
                    result.setText(getString(R.string.error) + ": " + e.getMessage());
                }
            }
        }, ContextCompat.getMainExecutor(this));
    }

    /**
     * Handles a decoded QR text: a real code of a lecture = in class.
     * @param (String) text QR content.
     */
    private void onScanned(String text)
    {
        final Payload p = Payload.decode(text);
        if (p == null)
        {
            result.setText(getString(R.string.scan_bad));
            return;
        }
        vibrate();
        markIfNew(p);
    }

    /**
     * Writes the record unless the student is already marked (one scan per lecture).
     * The security rules check that the token belongs to this lecture.
     * @param (Payload) p Payload.
     */
    private void markIfNew(final Payload p)
    {
        Repo.get().getMyAttendance(p.sessionId(), new Repo.Done<DocumentSnapshot>()
        {
            @Override
            public void onDone(@Nullable DocumentSnapshot d, @Nullable Exception error)
            {
                if (d != null && d.exists())
                {
                    result.setText(getString(R.string.scan_already));
                }
                else
                {
                    Repo.get().markMe(p.sessionId(), p.token());
                    result.setText(getString(R.string.scan_ok_in_class));
                }
                // last step: tap your own face in the class photo
                startActivity(new Intent(ScanActivity.this, FacePickActivity.class)
                        .putExtra(FacePickActivity.EXTRA_SID, p.sessionId()));
            }
        });
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Changes the camera zoom by a step (the camera's own zoom: sharper than cropping).
     * @param (float) step Positive = closer.
     */
    private void zoomBy(float step)
    {
        if (camera == null)
        {
            return;
        }
        ZoomState z = camera.getCameraInfo().getZoomState().getValue();
        if (z == null)
        {
            return;
        }
        setZoom(z.getZoomRatio() + step);
    }

    /**
     * Sets the camera zoom within what the camera supports and shows it.
     * @param (float) ratio Wanted zoom (1 = none).
     */
    private void setZoom(float ratio)
    {
        if (camera == null)
        {
            return;
        }
        ZoomState z = camera.getCameraInfo().getZoomState().getValue();
        if (z == null)
        {
            return;
        }
        float r = Math.max(z.getMinZoomRatio(), Math.min(z.getMaxZoomRatio(), ratio));
        camera.getCameraControl().setZoomRatio(r);
        zoomLabel.setText(String.format(Locale.US, "%.1fx", r));
    }

    /** Two fingers on the camera picture zoom in and out. */
    @SuppressLint("ClickableViewAccessibility")
    private void pinchToZoom()
    {
        final ScaleGestureDetector pinch = new ScaleGestureDetector(this,
            new ScaleGestureDetector.SimpleOnScaleGestureListener()
            {
                @Override
                public boolean onScale(@NonNull ScaleGestureDetector d)
                {
                    if (camera == null)
                    {
                        return false;
                    }
                    ZoomState z = camera.getCameraInfo().getZoomState().getValue();
                    if (z != null)
                    {
                        setZoom(z.getZoomRatio() * d.getScaleFactor());
                    }
                    return true;
                }
            });
        preview.setOnTouchListener(new View.OnTouchListener()
        {
            @Override
            public boolean onTouch(View v, MotionEvent e)
            {
                pinch.onTouchEvent(e);
                return true;
            }
        });
    }

    /**
     * Tells whether the camera permission is granted.
     * @return (boolean) True when granted.
     */
    private boolean hasCamera()
    {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    /** Short vibration when a code is found. */
    private void vibrate()
    {
        Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (v != null)
        {
            v.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE));
        }
    }
}
