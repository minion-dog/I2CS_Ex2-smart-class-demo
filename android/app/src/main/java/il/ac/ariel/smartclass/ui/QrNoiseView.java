package il.ac.ariel.smartclass.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.SystemClock;
import android.view.View;

import com.google.zxing.WriterException;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.google.zxing.qrcode.encoder.ByteMatrix;
import com.google.zxing.qrcode.encoder.Encoder;
import com.google.zxing.qrcode.encoder.QRCode;

import java.security.SecureRandom;

import il.ac.ariel.smartclass.core.FlickerSchedule;

/**
 * Draws the "QR you can't photograph" on the lecturer's phone or tablet (the website draws
 * the same thing with web/js/ui/qr-display.js): dark squares change slowly, light squares
 * fast, all in random colours. A new phase every 33 ms; the view redraws itself on every
 * animation frame while attached.
 */
public final class QrNoiseView extends View
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Dark modules. */
    private final Paint dark = new Paint();

    /** The flicker plan of the current text. */
    private FlickerSchedule plan;

    /** Seeds for new plans. */
    private final SecureRandom random = new SecureRandom();

    /**
     * Creates the view.
     * @param (Context) c Context.
     */
    public QrNoiseView(Context c)
    {
        super(c);
        dark.setColor(Color.BLACK);
        setBackgroundColor(Color.WHITE);
        setKeepScreenOn(true);
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Shows a new text (a new token every 30 s) with a fresh random plan.
     * @param (String) text QR payload.
     * @throws (WriterException) When the text cannot be encoded.
     */
    public void setText(String text) throws WriterException
    {
        // ZXing picks alphanumeric mode by itself for capitals/digits; level Q -> 25x25 squares
        QRCode qr = Encoder.encode(text, ErrorCorrectionLevel.Q);
        ByteMatrix m = qr.getMatrix();
        int size = m.getWidth();
        boolean[] modules = new boolean[size * size];
        for (int r = 0; r < size; r++)
        {
            for (int c = 0; c < size; c++)
            {
                modules[r * size + c] = m.get(c, r) == 1;
            }
        }
        plan = new FlickerSchedule(modules, size, random.nextInt());
        invalidate();
    }

    /**
     * Keeps the view square.
     * @param (int) widthSpec Width spec.
     * @param (int) heightSpec Height spec.
     */
    @Override
    protected void onMeasure(int widthSpec, int heightSpec)
    {
        int w = MeasureSpec.getSize(widthSpec);
        setMeasuredDimension(w, w);
    }

    /**
     * Draws the current phase and asks for the next frame.
     * @param (Canvas) canvas Canvas.
     */
    @Override
    protected void onDraw(Canvas canvas)
    {
        super.onDraw(canvas);
        if (plan == null)
        {
            return;
        }
        long phase = SystemClock.uptimeMillis() / FlickerSchedule.PHASE_MS;
        boolean[] squares = plan.frame(phase);
        int n = plan.total();
        float cell = (float) getWidth() / n;
        for (int r = 0; r < n; r++)
        {
            for (int c = 0; c < n; c++)
            {
                if (squares[r * n + c])
                {
                    canvas.drawRect(c * cell, r * cell, (c + 1) * cell, (r + 1) * cell, dark);
                }
            }
        }
        postInvalidateOnAnimation();
    }
}
