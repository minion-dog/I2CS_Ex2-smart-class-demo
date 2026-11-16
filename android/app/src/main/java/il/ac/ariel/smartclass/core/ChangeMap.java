package il.ac.ariel.smartclass.core;

import java.util.ArrayDeque;

/**
 * The scanner side of the "QR you can't photograph" (same algorithm as
 * web/js/core/noisyqr.js ChangeMap).
 *
 * For every pixel it keeps the average absolute difference between consecutive camera
 * frames over the newest FRAMES frames. Light squares of the QR change a lot, dark squares
 * hardly change, so this "change map" is the QR. Before comparing, each frame is lined up
 * with the previous one (a hand-held phone moves a pixel or two), and the differences are
 * stored in the first frame's coordinates so the map stays sharp while the phone drifts.
 */
public final class ChangeMap
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Largest hand movement between two frames, in pixels. */
    private static final int MAX_SHIFT = 12;

    /** Larger total drift = start the map over. */
    private static final int MAX_DRIFT = 60;

    /** Compare every 7th pixel when lining frames up (fast). */
    private static final int SHIFT_STEP = 7;

    /** Smoothing of square edges in the map, in pixels (at 400 px). */
    private static final double BLUR_SIGMA = 1.5;

    /** Below this mean change (grey levels) the picture is frozen: nothing to read. */
    private static final double MIN_SIGNAL = 4;

    /** "Changes a lot" = above 35% of the strongest change (finding the code's box). */
    private static final double ACTIVE_LEVEL = 0.35;

    /** Fewer active pixels than this part of the picture = no code found. */
    private static final double ACTIVE_MIN_PART = 0.003;

    /** The box grows by 8% on each side (the code's flickering border). */
    private static final double BOX_MARGIN = 0.08;

    /** Frames to look at. */
    private final int capacity;

    /** Kept differences, oldest first (in first-frame coordinates). */
    private final ArrayDeque<int[]> diffs = new ArrayDeque<int[]>();

    /** Pixels per frame. */
    private int length;

    /** Side of the square frame. */
    private int side;

    /** Per pixel: sum of the kept differences. */
    private long[] sum;

    /** The previous frame. */
    private int[] last;

    /** Where the current frame sits relative to the first one. */
    private int cx;
    private int cy;

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Creates the map.
     * @param (int) length Pixels per frame (a square image).
     * @param (int) capacity Frames to look at.
     */
    public ChangeMap(int length, int capacity)
    {
        this.length = length;
        this.capacity = capacity;
        reset();
    }

    /** Forgets everything (new resolution, or the phone moved a lot). */
    public void reset()
    {
        side = (int) Math.round(Math.sqrt(length));
        last = null;
        diffs.clear();
        sum = new long[length];
        cx = 0;
        cy = 0;
    }

    /**
     * Adds a camera frame.
     * @param (byte[]) grey One unsigned grey byte per pixel (a square image).
     */
    public void push(byte[] grey)
    {
        if (grey.length != length)
        {
            length = grey.length;
            reset();
        }
        int[] frame = new int[length];
        for (int i = 0; i < length; i++)
        {
            frame[i] = grey[i] & 0xFF;
        }
        if (last != null)
        {
            int[] s = bestShift(frame, last, side);
            cx += s[0];
            cy += s[1];
            if (Math.abs(cx) > MAX_DRIFT || Math.abs(cy) > MAX_DRIFT)
            {
                reset();
                last = frame;
                return;
            }
            int[] d = new int[length];
            for (int y = 0; y < side; y++)
            {
                int ly = y + s[1];
                int ry = y + cy;
                if (ly < 0 || ly >= side || ry < 0 || ry >= side)
                {
                    continue;
                }
                for (int x = 0; x < side; x++)
                {
                    int lx = x + s[0];
                    int rx = x + cx;
                    if (lx < 0 || lx >= side || rx < 0 || rx >= side)
                    {
                        continue;
                    }
                    int v = Math.abs(frame[y * side + x] - last[ly * side + lx]);
                    d[ry * side + rx] = v;
                    sum[ry * side + rx] += v;
                }
            }
            diffs.addLast(d);
            if (diffs.size() > capacity - 1)
            {
                int[] old = diffs.removeFirst();
                for (int i = 0; i < old.length; i++)
                {
                    sum[i] -= old[i];
                }
            }
        }
        last = frame;
    }

    /**
     * Returns how many frames are in the map.
     * @return (int) Frames (differences + 1).
     */
    public int count()
    {
        if (last == null)
        {
            return 0;
        }
        return diffs.size() + 1;
    }

    /**
     * Tells whether anything changes at all (a frozen picture held up to the camera does not).
     * @return (boolean) True when some pixels change.
     */
    public boolean hasSignal()
    {
        double n = Math.max(1, diffs.size());
        for (long s : sum)
        {
            if (s / n >= MIN_SIGNAL)
            {
                return true;
            }
        }
        return false;
    }

    /**
     * Finds where the code is: the box around the pixels that change a lot.
     * WHY: from the back of the class the code is small and the still room around it
     * is most of the picture; the scanner zooms in on this box, and image() judges
     * "a lot / a little" only inside it (same as activeBox() in noisyqr.js).
     * @return (int[]) {x0, y0, x1, y1} in pixels, or null when nothing changes.
     */
    public int[] activeBox()
    {
        double[] mean = means();
        double t = Math.max(MIN_SIGNAL, ACTIVE_LEVEL * percentile(mean, 0.99));
        int[] xs = new int[side];
        int[] ys = new int[side];
        int count = 0;
        for (int i = 0; i < length; i++)
        {
            if (mean[i] > t)
            {
                xs[i % side]++;
                ys[i / side]++;
                count++;
            }
        }
        if (count < ACTIVE_MIN_PART * length)
        {
            return null;
        }
        // 1st..99th percentile of the positions: a few noisy pixels do not stretch the box
        return new int[] {position(xs, count, 0.01), position(ys, count, 0.01),
            position(xs, count, 0.99), position(ys, count, 0.99)};
    }

    /**
     * Builds the black-and-white picture a QR reader can read: little change = black,
     * much change = white. Steps: find the code's box, stretch (2nd..98th percentile
     * inside the box), blur, Otsu threshold inside the box; outside the box = black.
     * @param (int) side Width = height in pixels.
     * @return (int[]) 0 or 255 per pixel.
     */
    public int[] image(int side)
    {
        double[] mean = means();
        boolean[] inside = boxMask();
        int count = 0;
        for (boolean b : inside)
        {
            count += b ? 1 : 0;
        }
        double[] values = new double[count];
        int k = 0;
        for (int i = 0; i < length; i++)
        {
            if (inside[i])
            {
                values[k++] = mean[i];
            }
        }
        double lo = percentile(values, 0.02);
        double hi = percentile(values, 0.98);
        double span = Math.max(hi - lo, 1e-6);
        double[] img = new double[length];
        for (int i = 0; i < length; i++)
        {
            img[i] = inside[i] ? 255 * Math.min(1, Math.max(0, (mean[i] - lo) / span)) : 0;
        }
        double[] blurred = blur(img, side, side, BLUR_SIGMA);
        double[] insideValues = new double[count];
        k = 0;
        for (int i = 0; i < length; i++)
        {
            if (inside[i])
            {
                insideValues[k++] = blurred[i];
            }
        }
        int t = otsu(insideValues);
        int[] out = new int[length];
        for (int i = 0; i < length; i++)
        {
            if (inside[i] && blurred[i] > t)
            {
                out[i] = 255;
            }
        }
        return out;
    }

    /**
     * The mean change of every pixel.
     * @return (double[]) Mean per pixel.
     */
    private double[] means()
    {
        double n = Math.max(1, diffs.size());
        double[] mean = new double[length];
        for (int i = 0; i < length; i++)
        {
            mean[i] = sum[i] / n;
        }
        return mean;
    }

    /**
     * Marks the pixels inside the code's box (a little larger, for the border).
     * @return (boolean[]) True inside (all true when no box is found).
     */
    private boolean[] boxMask()
    {
        boolean[] mask = new boolean[length];
        int[] b = activeBox();
        if (b == null)
        {
            java.util.Arrays.fill(mask, true);
            return mask;
        }
        double m = BOX_MARGIN * Math.max(b[2] - b[0], b[3] - b[1]);
        int x0 = Math.max(0, (int) Math.floor(b[0] - m));
        int x1 = Math.min(side - 1, (int) Math.ceil(b[2] + m));
        int y0 = Math.max(0, (int) Math.floor(b[1] - m));
        int y1 = Math.min(side - 1, (int) Math.ceil(b[3] + m));
        for (int y = y0; y <= y1; y++)
        {
            for (int x = x0; x <= x1; x++)
            {
                mask[y * side + x] = true;
            }
        }
        return mask;
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Finds the shift that best lines up a frame with the previous one:
     * frame(x, y) ~ last(x + dx, y + dy), on a sparse grid in the middle of the image.
     * @param (int[]) frame New frame.
     * @param (int[]) last Previous frame.
     * @param (int) n Side in pixels.
     * @return (int[]) {dx, dy}.
     */
    private static int[] bestShift(int[] frame, int[] last, int n)
    {
        // coarse search every 2nd shift over +-MAX_SHIFT, then the exact shift around the winner
        int[] coarse = searchShift(frame, last, n, 0, 0, MAX_SHIFT, 2);
        return searchShift(frame, last, n, coarse[0], coarse[1], 1, 1);
    }

    /**
     * Tries the shifts around (cx, cy) and returns the one with the smallest difference.
     * @param (int[]) frame New frame.
     * @param (int[]) last Previous frame.
     * @param (int) n Side in pixels.
     * @param (int) cx Centre of the search, x.
     * @param (int) cy Centre of the search, y.
     * @param (int) radius How far to try around the centre.
     * @param (int) step Try every step-th shift.
     * @return (int[]) {dx, dy}.
     */
    private static int[] searchShift(int[] frame, int[] last, int n, int cx, int cy, int radius, int step)
    {
        long best = Long.MAX_VALUE;
        int bx = cx;
        int by = cy;
        int margin = MAX_SHIFT + 1;
        int lo = Math.max(n / 4, margin);
        int hi = Math.min(n - n / 4, n - margin);
        for (int dy = cy - radius; dy <= cy + radius; dy += step)
        {
            for (int dx = cx - radius; dx <= cx + radius; dx += step)
            {
                if (Math.abs(dx) > MAX_SHIFT || Math.abs(dy) > MAX_SHIFT)
                {
                    continue;
                }
                long sad = 0;
                for (int y = lo; y < hi; y += SHIFT_STEP)
                {
                    for (int x = lo; x < hi; x += SHIFT_STEP)
                    {
                        sad += Math.abs(frame[y * n + x] - last[(y + dy) * n + (x + dx)]);
                    }
                }
                if (sad < best)
                {
                    best = sad;
                    bx = dx;
                    by = dy;
                }
            }
        }
        return new int[] {bx, by};
    }

    /**
     * The position below which a fraction q of the counted pixels lie.
     * @param (int[]) hist Pixels per position.
     * @param (int) count All counted pixels.
     * @param (double) q Fraction 0..1.
     * @return (int) The position.
     */
    private static int position(int[] hist, int count, double q)
    {
        double target = q * count;
        long acc = 0;
        for (int v = 0; v < hist.length; v++)
        {
            acc += hist[v];
            if (acc >= target)
            {
                return v;
            }
        }
        return hist.length - 1;
    }

    /**
     * Returns the value below which a fraction q of the values lie (256-bin histogram).
     * @param (double[]) values Values 0..255.
     * @param (double) q Fraction 0..1.
     * @return (double) The percentile.
     */
    private static double percentile(double[] values, double q)
    {
        int[] hist = new int[256];
        for (double v : values)
        {
            hist[(int) Math.min(255, Math.max(0, Math.round(v)))]++;
        }
        double target = q * values.length;
        long acc = 0;
        for (int v = 0; v < 256; v++)
        {
            acc += hist[v];
            if (acc >= target)
            {
                return v;
            }
        }
        return 255;
    }

    /**
     * Blurs an image with a separable Gaussian.
     * @param (double[]) img Pixels.
     * @param (int) w Width.
     * @param (int) h Height.
     * @param (double) sigma Blur radius.
     * @return (double[]) Blurred copy.
     */
    private static double[] blur(double[] img, int w, int h, double sigma)
    {
        int r = (int) Math.ceil(2 * sigma);
        double[] k = new double[2 * r + 1];
        double ks = 0;
        for (int i = -r; i <= r; i++)
        {
            k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
            ks += k[i + r];
        }
        for (int i = 0; i < k.length; i++)
        {
            k[i] /= ks;
        }
        double[] tmp = new double[img.length];
        double[] out = new double[img.length];
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                double s = 0;
                for (int i = -r; i <= r; i++)
                {
                    int xx = Math.min(w - 1, Math.max(0, x + i));
                    s += img[y * w + xx] * k[i + r];
                }
                tmp[y * w + x] = s;
            }
        }
        for (int y = 0; y < h; y++)
        {
            for (int x = 0; x < w; x++)
            {
                double s = 0;
                for (int i = -r; i <= r; i++)
                {
                    int yy = Math.min(h - 1, Math.max(0, y + i));
                    s += tmp[yy * w + x] * k[i + r];
                }
                out[y * w + x] = s;
            }
        }
        return out;
    }

    /**
     * Finds the threshold that best splits an image into two groups (Otsu's method).
     * @param (double[]) img Pixels 0..255.
     * @return (int) Threshold.
     */
    private static int otsu(double[] img)
    {
        double[] hist = new double[256];
        for (double v : img)
        {
            hist[(int) Math.min(255, Math.max(0, Math.round(v)))]++;
        }
        double total = 0;
        double sumAll = 0;
        for (int v = 0; v < 256; v++)
        {
            total += hist[v];
            sumAll += v * hist[v];
        }
        double wB = 0;
        double sumB = 0;
        double best = 0;
        int bestT = 127;
        for (int t = 0; t < 256; t++)
        {
            wB += hist[t];
            if (wB == 0)
            {
                continue;
            }
            double wF = total - wB;
            if (wF == 0)
            {
                break;
            }
            sumB += t * hist[t];
            double mB = sumB / wB;
            double mF = (sumAll - sumB) / wF;
            double between = wB * wF * (mB - mF) * (mB - mF);
            if (between > best)
            {
                best = between;
                bestT = t;
            }
        }
        return bestT;
    }
}
