package il.ac.ariel.smartclass.ui;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import il.ac.ariel.smartclass.core.Faces;

/**
 * The class photo with a box on every face (same as web/js/ui/faceview.js, pick mode).
 * Pinch to zoom, drag to move, tap a face to choose it. Taken faces are grey, mine is green,
 * the one being confirmed is white.
 */
public final class FacePickView extends View
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Most zoom. */
    private static final float MAX_ZOOM = 6f;

    /**
     * Receives a tapped face.
     */
    public interface OnPick
    {
        /**
         * Called when a free face (or my own) is tapped.
         * @param (int) id Box id.
         */
        void onPick(int id);
    }

    /** The photo. */
    private Bitmap photo;

    /** The boxes. */
    private List<Faces.Box> boxes = new ArrayList<Faces.Box>();

    /** Ids taken by others. */
    private Set<Integer> taken = new HashSet<Integer>();

    /** My chosen id (0 = none) and the one being confirmed. */
    private int mine;

    /** Selected, waiting for "yes, that's me". */
    private int selected;

    /** Zoom (1 = photo fits the width) and pan in view pixels. */
    private float zoom = 1f;

    /** Pan x. */
    private float panX;

    /** Pan y. */
    private float panY;

    /** Callback. */
    private OnPick onPick;

    /** Box outline. */
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);

    /** Grey fill of taken faces. */
    private final Paint shade = new Paint();

    /** Pinch. */
    private final ScaleGestureDetector scale;

    /** Tap and drag. */
    private final GestureDetector gestures;

    /**
     * Creates the view.
     * @param (Context) c Context.
     */
    public FacePickView(Context c)
    {
        super(c);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeWidth(3 * getResources().getDisplayMetrics().density);
        shade.setColor(Color.argb(115, 0, 0, 0));
        scale = new ScaleGestureDetector(c, new ScaleGestureDetector.SimpleOnScaleGestureListener()
        {
            @Override
            public boolean onScale(ScaleGestureDetector d)
            {
                zoomAround(zoom * d.getScaleFactor(), d.getFocusX(), d.getFocusY());
                return true;
            }
        });
        gestures = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener()
        {
            @Override
            public boolean onDown(MotionEvent e)
            {
                return true;
            }

            @Override
            public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy)
            {
                panX -= dx;
                panY -= dy;
                clampPan();
                invalidate();
                return true;
            }

            @Override
            public boolean onSingleTapUp(MotionEvent e)
            {
                tap(e.getX(), e.getY());
                return true;
            }
        });
    }

    // ==========================================
    //                  STATE
    // ==========================================

    /**
     * Shows a photo and its boxes.
     * @param (Bitmap) bmp Photo.
     * @param (List&lt;Faces.Box&gt;) b Boxes.
     */
    public void setPhoto(Bitmap bmp, List<Faces.Box> b)
    {
        photo = bmp;
        boxes = b;
        zoom = 1f;
        panX = 0;
        panY = 0;
        requestLayout();
        invalidate();
    }

    /**
     * Which faces are taken and which one is mine.
     * @param (Set&lt;Integer&gt;) t Taken ids.
     * @param (int) m My id (0 = none).
     */
    public void setTaken(Set<Integer> t, int m)
    {
        taken = t;
        mine = m;
        invalidate();
    }

    /**
     * Marks the face being confirmed.
     * @param (int) id Box id (0 = none).
     */
    public void select(int id)
    {
        selected = id;
        invalidate();
    }

    /**
     * Sets the tap callback.
     * @param (OnPick) l Callback.
     */
    public void setOnPick(OnPick l)
    {
        onPick = l;
    }

    /**
     * A zoomed-in picture of one face, to check it is really me.
     * @param (int) id Box id.
     * @param (int) side Output side in pixels.
     * @return (Bitmap) Crop, or null.
     */
    public Bitmap crop(int id, int side)
    {
        if (photo == null)
        {
            return null;
        }
        for (Faces.Box b : boxes)
        {
            if (b.id != id)
            {
                continue;
            }
            float w = photo.getWidth();
            float h = photo.getHeight();
            float s = (float) Math.max(b.w * w, b.h * h) * 2.2f;
            float cx = (float) (b.x + b.w / 2) * w;
            float cy = (float) (b.y + b.h / 2) * h;
            Bitmap out = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(out);
            c.drawColor(Color.BLACK);
            Matrix m = new Matrix();
            m.postTranslate(-(cx - s / 2), -(cy - s / 2));
            m.postScale(side / s, side / s);
            c.drawBitmap(photo, m, null);
            return out;
        }
        return null;
    }

    // ==========================================
    //                 DRAWING
    // ==========================================

    /**
     * Height follows the photo (width fits the screen).
     * @param (int) wSpec Width spec.
     * @param (int) hSpec Height spec.
     */
    @Override
    protected void onMeasure(int wSpec, int hSpec)
    {
        int w = MeasureSpec.getSize(wSpec);
        int h = photo == null ? 0 : Math.round(w * photo.getHeight() / (float) photo.getWidth());
        setMeasuredDimension(w, h);
    }

    /**
     * Draws the photo and the boxes.
     * @param (Canvas) c Canvas.
     */
    @Override
    protected void onDraw(Canvas c)
    {
        if (photo == null)
        {
            return;
        }
        float k = getWidth() / (float) photo.getWidth() * zoom;
        c.save();
        c.translate(panX, panY);
        c.scale(k, k);
        c.drawBitmap(photo, 0, 0, null);
        c.restore();
        for (Faces.Box b : boxes)
        {
            RectF r = screenRect(b);
            if (b.id == mine)
            {
                line.setColor(Color.rgb(46, 204, 113));
            }
            else if (taken.contains(b.id))
            {
                c.drawRect(r, shade);
                line.setColor(Color.argb(150, 200, 200, 200));
            }
            else
            {
                line.setColor(Color.rgb(255, 212, 0));
            }
            if (b.id == selected)
            {
                line.setColor(Color.WHITE);
            }
            c.drawRoundRect(r, 8, 8, line);
        }
    }

    /**
     * Pinch, drag and tap.
     * @param (MotionEvent) e Event.
     * @return (boolean) Handled.
     */
    @Override
    public boolean onTouchEvent(MotionEvent e)
    {
        getParent().requestDisallowInterceptTouchEvent(zoom > 1f || e.getPointerCount() > 1);
        boolean a = scale.onTouchEvent(e);
        boolean b = gestures.onTouchEvent(e);
        return a || b || super.onTouchEvent(e);
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * A box in view pixels.
     * @param (Faces.Box) b Box.
     * @return (RectF) Rectangle.
     */
    private RectF screenRect(Faces.Box b)
    {
        float W = getWidth() * zoom;
        float H = getHeight() * zoom;
        return new RectF((float) (panX + b.x * W), (float) (panY + b.y * H),
                (float) (panX + (b.x + b.w) * W), (float) (panY + (b.y + b.h) * H));
    }

    /**
     * Zooms keeping the point under the fingers in place.
     * @param (float) z New zoom.
     * @param (float) fx Focus x.
     * @param (float) fy Focus y.
     */
    private void zoomAround(float z, float fx, float fy)
    {
        float nz = Math.max(1f, Math.min(MAX_ZOOM, z));
        panX = fx - (fx - panX) * nz / zoom;
        panY = fy - (fy - panY) * nz / zoom;
        zoom = nz;
        clampPan();
        invalidate();
    }

    /** Keeps the photo covering the view. */
    private void clampPan()
    {
        panX = Math.min(0, Math.max(getWidth() - getWidth() * zoom, panX));
        panY = Math.min(0, Math.max(getHeight() - getHeight() * zoom, panY));
    }

    /**
     * A tap: the face under it, if free or mine.
     * @param (float) x View x.
     * @param (float) y View y.
     */
    private void tap(float x, float y)
    {
        double px = (x - panX) / (getWidth() * zoom);
        double py = (y - panY) / (getHeight() * zoom);
        int i = Faces.hitTest(boxes, px, py);
        if (i < 0 || onPick == null)
        {
            return;
        }
        int id = boxes.get(i).id;
        if (!taken.contains(id) || id == mine)
        {
            onPick.onPick(id);
        }
    }
}
