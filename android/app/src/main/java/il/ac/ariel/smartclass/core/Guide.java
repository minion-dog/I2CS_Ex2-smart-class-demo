package il.ac.ariel.smartclass.core;

/**
 * "Google Lens"-style help while scanning (same as web/js/core/guide.js): a box that lights up
 * around the flickering code and a hint for the student (a classmate's idea, 25 Nov 2026).
 */
public final class Guide
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Smaller than this in camera pixels: too small to read well. */
    public static final double CLOSER_PX = 110;

    /** Found this many times in a row: "hold still, reading". */
    public static final int STEADY_ROUNDS = 2;

    /** Not instantiable. */
    private Guide()
    {
    }

    // ==========================================
    //                  LOGIC
    // ==========================================

    /**
     * What to tell the student.
     * @param (boolean) hasBox The camera sees the code flicker.
     * @param (double) cameraPx The code's size in camera pixels.
     * @param (int) rounds Tries in a row that found it.
     * @return (String) "search" | "closer" | "found" | "steady".
     */
    public static String hint(boolean hasBox, double cameraPx, int rounds)
    {
        if (!hasBox)
        {
            return "search";
        }
        if (cameraPx < CLOSER_PX)
        {
            return "closer";
        }
        return rounds >= STEADY_ROUNDS ? "steady" : "found";
    }

    /**
     * Places a box from the camera image on the preview: the image is turned by the sensor's
     * rotation, then shown "fill center" (scaled to cover the view, the middle kept).
     * @param (double[]) box {x0, y0, x1, y1} in image pixels (before turning).
     * @param (int) imgW Image width.
     * @param (int) imgH Image height.
     * @param (int) rotation 0, 90, 180 or 270 (clockwise, as CameraX reports it).
     * @param (int) viewW Preview width.
     * @param (int) viewH Preview height.
     * @return (double[]) {x, y, w, h} as fractions of the preview.
     */
    public static double[] toView(double[] box, int imgW, int imgH, int rotation, int viewW, int viewH)
    {
        double[] a = turn(box[0], box[1], imgW, imgH, rotation);
        double[] b = turn(box[2], box[3], imgW, imgH, rotation);
        boolean sideways = rotation == 90 || rotation == 270;
        double rw = sideways ? imgH : imgW;
        double rh = sideways ? imgW : imgH;
        double scale = Math.max(viewW / rw, viewH / rh);
        double ox = (viewW - rw * scale) / 2;
        double oy = (viewH - rh * scale) / 2;
        double x0 = Math.min(a[0], b[0]) * scale + ox;
        double y0 = Math.min(a[1], b[1]) * scale + oy;
        double x1 = Math.max(a[0], b[0]) * scale + ox;
        double y1 = Math.max(a[1], b[1]) * scale + oy;
        return new double[] {x0 / viewW, y0 / viewH, (x1 - x0) / viewW, (y1 - y0) / viewH};
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Turns one point of the image clockwise.
     * @param (double) x X.
     * @param (double) y Y.
     * @param (int) w Image width.
     * @param (int) h Image height.
     * @param (int) rotation Degrees.
     * @return (double[]) The turned point.
     */
    private static double[] turn(double x, double y, int w, int h, int rotation)
    {
        switch (rotation)
        {
            case 90:
                return new double[] {h - y, x};
            case 180:
                return new double[] {w - x, h - y};
            case 270:
                return new double[] {y, w - x};
            default:
                return new double[] {x, y};
        }
    }
}
