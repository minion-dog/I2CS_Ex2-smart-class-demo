package il.ac.ariel.smartclass.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

import androidx.annotation.Nullable;

/**
 * The lit-up corner brackets drawn over the camera preview around the found code
 * (same as #finder in web/student.html): yellow = found, orange = move closer,
 * green = holding still / read.
 */
public final class FinderView extends View
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Bracket colours. */
    private static final int YELLOW = 0xFFFFD54F;

    /** Move closer. */
    private static final int ORANGE = 0xFFFF9800;

    /** Holding still / read. */
    private static final int GREEN = 0xFF4CAF50;

    /** How fast the drawn box follows the new one (same as GUIDE.SMOOTH). */
    private static final float SMOOTH = 0.45f;

    /** Extra space around the code (fraction of the view). */
    private static final float PAD = 0.04f;

    /** Brackets. */
    private final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG);

    /** Green fill when read. */
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);

    /** Drawn box {x, y, w, h} as fractions, or null = hidden. */
    @Nullable
    private float[] box;

    /** Current hint. */
    private String hint = "search";

    /**
     * Creates the overlay.
     * @param (Context) c Context.
     */
    public FinderView(Context c)
    {
        super(c);
        line.setStyle(Paint.Style.STROKE);
        line.setStrokeCap(Paint.Cap.ROUND);
        line.setStrokeWidth(Ui.dp(c, 4));
        fill.setColor(0x334CAF50);
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Shows the box (smoothly) or hides it.
     * @param (double[]) next {x, y, w, h} as fractions of this view, or null.
     * @param (String) hint "search" | "closer" | "found" | "steady" | "done".
     */
    public void show(@Nullable double[] next, String hint)
    {
        this.hint = hint;
        if (next == null)
        {
            if (!"done".equals(hint))
            {
                box = null;
            }
        }
        else
        {
            float[] n = {(float) next[0] - PAD, (float) next[1] - PAD, (float) next[2] + 2 * PAD, (float) next[3] + 2 * PAD};
            if (box == null)
            {
                box = n;
            }
            else
            {
                for (int i = 0; i < 4; i++)
                {
                    box[i] += (n[i] - box[i]) * SMOOTH;
                }
            }
        }
        invalidate();
    }

    /**
     * Draws four corner brackets.
     * @param (Canvas) c Canvas.
     */
    @Override
    protected void onDraw(Canvas c)
    {
        super.onDraw(c);
        if (box == null)
        {
            return;
        }
        float x0 = box[0] * getWidth();
        float y0 = box[1] * getHeight();
        float x1 = x0 + box[2] * getWidth();
        float y1 = y0 + box[3] * getHeight();
        float arm = Math.min(x1 - x0, y1 - y0) / 4;
        line.setColor("closer".equals(hint) ? ORANGE : ("steady".equals(hint) || "done".equals(hint)) ? GREEN : YELLOW);
        if ("done".equals(hint))
        {
            c.drawRect(x0, y0, x1, y1, fill);
        }
        c.drawLine(x0, y0, x0 + arm, y0, line);
        c.drawLine(x0, y0, x0, y0 + arm, line);
        c.drawLine(x1, y0, x1 - arm, y0, line);
        c.drawLine(x1, y0, x1, y0 + arm, line);
        c.drawLine(x0, y1, x0 + arm, y1, line);
        c.drawLine(x0, y1, x0, y1 - arm, line);
        c.drawLine(x1, y1, x1 - arm, y1, line);
        c.drawLine(x1, y1, x1, y1 - arm, line);
    }
}
