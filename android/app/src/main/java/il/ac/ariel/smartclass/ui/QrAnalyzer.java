package il.ac.ariel.smartclass.ui;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.ReaderException;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import java.nio.ByteBuffer;
import java.util.EnumMap;
import java.util.Map;

import il.ac.ariel.smartclass.core.ChangeMap;
import il.ac.ariel.smartclass.core.Guide;
import il.ac.ariel.smartclass.core.FlickerSchedule;

/**
 * The camera side of the "QR you can't photograph" (same algorithm as web/js/ui/scanner.js):
 * every camera frame is cropped to a centre square, scaled to SIDE x SIDE grey, and fed to
 * the {@link ChangeMap}. Pixels that change a lot are the QR's light squares, pixels that
 * hardly change are its dark squares; every few frames the map becomes a black-and-white
 * picture and ZXing reads it. A normal camera app (or any photo) sees only random dots.
 * From the back of the class the code is small: the analyzer finds WHERE things change
 * ({@link ChangeMap#activeBox()}), then crops just that part of the camera frame (at full
 * resolution) and starts the map again there, like scanner.js.
 */
public final class QrAnalyzer implements ImageAnalysis.Analyzer
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Analysed square in pixels. */
    private static final int SIDE = 400;

    /** Try to decode every 3rd frame (saves battery). */
    private static final int DECODE_EVERY = 3;

    /** Zoom in when the code covers less than 60% of the square. */
    private static final double ZOOM_WHEN = 0.6;

    /** After zooming, the square is 1.35 x the code (room for shake). */
    private static final double ZOOM_FILL = 1.35;

    /** Never zoom closer than 200 camera pixels. */
    private static final int MIN_CROP = 200;

    /** Zoomed but nothing read for 4 s: look at the whole frame again. */
    private static final long GIVE_UP_MS = 4000;

    /**
     * Receives the decoded text (on the analysis thread).
     */
    public interface OnText
    {
        /**
         * Called once with the QR text.
         * @param (String) text Decoded text.
         */
        void onText(String text);
    }

    /**
     * Receives the scanning guide (on the analysis thread): where the code is and a hint.
     */
    public interface OnGuide
    {
        /**
         * Called on each try.
         * @param (double[]) box {x0, y0, x1, y1} in image pixels, or null (nothing flickers).
         * @param (int) w Image width.
         * @param (int) h Image height.
         * @param (int) rotation Image rotation in degrees.
         * @param (String) hint See {@link Guide#hint}.
         */
        void onGuide(@Nullable double[] box, int w, int h, int rotation, String hint);
    }

    /** The change map of the last frames. */
    private final ChangeMap map = new ChangeMap(SIDE * SIDE, FlickerSchedule.FRAMES);

    /** ZXing QR reader. */
    private final QRCodeReader reader = new QRCodeReader();

    /** Decoder hints. */
    private final Map<DecodeHintType, Object> hints = new EnumMap<DecodeHintType, Object>(DecodeHintType.class);

    /** Callback. */
    private final OnText onText;

    /** Guide callback, or null. */
    @Nullable
    private final OnGuide onGuide;

    /** Tries in a row that found the code. */
    private int rounds;

    /** Frames seen. */
    private int frames;

    /** True after a code was found (stop reporting). */
    private volatile boolean done;

    /** Part of the camera frame being analysed: {x, y, side}, or null = the centre square. */
    private int[] crop;

    /** When the analyzer zoomed in (0 = not zoomed). */
    private long zoomedAt;

    /**
     * Creates the analyzer.
     * @param (OnText) onText Called once with the decoded text.
     */
    public QrAnalyzer(OnText onText)
    {
        this(onText, null);
    }

    /**
     * Creates the analyzer with the scanning guide.
     * @param (OnText) onText Called once with the decoded text.
     * @param (OnGuide) onGuide Called on each try with the found box and a hint (or null).
     */
    public QrAnalyzer(OnText onText, @Nullable OnGuide onGuide)
    {
        this.onText = onText;
        this.onGuide = onGuide;
        hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Adds one camera frame to the change map and tries to decode.
     * @param (ImageProxy) image The frame (YUV; only the Y = brightness plane is used).
     */
    @Override
    public void analyze(@NonNull ImageProxy image)
    {
        try
        {
            if (done)
            {
                return;
            }
            if (crop == null)
            {
                int side = Math.min(image.getWidth(), image.getHeight());
                crop = new int[] {(image.getWidth() - side) / 2, (image.getHeight() - side) / 2, side};
            }
            map.push(square(image, crop));
            frames++;
            boolean ready = map.count() >= FlickerSchedule.FRAMES && frames % DECODE_EVERY == 0;
            if (ready && !map.hasSignal())
            {
                rounds = 0;
                guide(null, image);
            }
            if (ready && map.hasSignal())
            {
                guide(map.activeBox(), image);
                tryDecode();
                if (!done)
                {
                    zoomIfSmall(image.getWidth(), image.getHeight());
                }
            }
            if (zoomedAt > 0 && System.currentTimeMillis() - zoomedAt > GIVE_UP_MS)
            {
                crop = null;                 // the phone moved, or zooming did not help
                zoomedAt = 0;
                map.reset();
            }
        }
        finally
        {
            image.close();
        }
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Tells the screen where the code is (in image pixels) and what to say.
     * @param (int[]) box activeBox in analysed pixels, or null.
     * @param (ImageProxy) image The frame.
     */
    private void guide(@Nullable int[] box, ImageProxy image)
    {
        if (onGuide == null)
        {
            return;
        }
        int rotation = image.getImageInfo().getRotationDegrees();
        if (box == null)
        {
            onGuide.onGuide(null, image.getWidth(), image.getHeight(), rotation, Guide.hint(false, 0, 0));
            return;
        }
        rounds++;
        double per = crop[2] / (double) SIDE;
        double[] px = {crop[0] + box[0] * per, crop[1] + box[1] * per, crop[0] + box[2] * per, crop[1] + box[3] * per};
        double size = Math.max(px[2] - px[0], px[3] - px[1]);
        onGuide.onGuide(px, image.getWidth(), image.getHeight(), rotation, Guide.hint(true, size, rounds));
    }

    /**
     * When the code is small in the picture, zooms in on it: the next frames are taken from
     * just that part of the camera frame, so each square of the code gets more pixels.
     * @param (int) w Frame width.
     * @param (int) h Frame height.
     */
    private void zoomIfSmall(int w, int h)
    {
        int[] box = map.activeBox();
        if (box == null)
        {
            return;
        }
        int size = Math.max(box[2] - box[0], box[3] - box[1]);
        if (size >= ZOOM_WHEN * SIDE)
        {
            return;
        }
        double per = crop[2] / (double) SIDE;                 // camera pixels per analysed pixel
        int side = (int) Math.max(MIN_CROP, size * ZOOM_FILL * per);
        side = Math.min(side, Math.min(w, h));
        if (side > 0.8 * crop[2])
        {
            return;                                            // already as close as it gets
        }
        double cx = crop[0] + (box[0] + box[2]) / 2.0 * per;
        double cy = crop[1] + (box[1] + box[3]) / 2.0 * per;
        int x = (int) Math.min(Math.max(0, cx - side / 2.0), w - side);
        int y = (int) Math.min(Math.max(0, cy - side / 2.0), h - side);
        crop = new int[] {x, y, side};
        zoomedAt = System.currentTimeMillis();
        map.reset();
    }

    /**
     * Takes a square part of the Y plane and scales it to SIDE x SIDE (nearest pixel).
     * @param (ImageProxy) image Camera frame.
     * @param (int[]) part {x, y, side} in frame pixels.
     * @return (byte[]) Grey pixels.
     */
    private static byte[] square(ImageProxy image, int[] part)
    {
        ImageProxy.PlaneProxy y = image.getPlanes()[0];
        ByteBuffer buf = y.getBuffer();
        int rowStride = y.getRowStride();
        int pixStride = y.getPixelStride();
        byte[] out = new byte[SIDE * SIDE];
        for (int r = 0; r < SIDE; r++)
        {
            int sy = part[1] + r * part[2] / SIDE;
            for (int c = 0; c < SIDE; c++)
            {
                int sx = part[0] + c * part[2] / SIDE;
                out[r * SIDE + c] = buf.get(sy * rowStride + sx * pixStride);
            }
        }
        return out;
    }

    /** Runs ZXing on the black-and-white change map. */
    private void tryDecode()
    {
        int[] bw = map.image(SIDE);
        byte[] lum = new byte[bw.length];
        for (int i = 0; i < bw.length; i++)
        {
            lum[i] = (byte) bw[i];
        }
        PlanarYUVLuminanceSource source = new PlanarYUVLuminanceSource(lum, SIDE, SIDE, 0, 0, SIDE, SIDE, false);
        try
        {
            Result r = reader.decode(new BinaryBitmap(new HybridBinarizer(source)), hints);
            done = true;
            onText.onText(r.getText());
        }
        catch (ReaderException e)
        {
            // not readable yet: keep averaging
        }
        finally
        {
            reader.reset();
        }
    }
}
