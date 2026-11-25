package il.ac.ariel.smartclass.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The face boxes of the class photo (same logic as web/js/core/faces.js).
 * Decision (ours, 25 Nov 2026): the lecturer takes one class photo with a box on every face;
 * after scanning, each student taps their own face and confirms. One student per face.
 * Boxes are fractions of the photo (0..1) with an id that never changes.
 */
public final class Faces
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** "I am not in the photo". */
    public static final int NOT_FOUND = -2;

    /** A tap this far outside a small box (in box sizes) still hits it. */
    private static final double HIT_SLACK = 0.6;

    /** What the student still has to do. */
    public enum Step
    {
        /** Not scanned yet. */
        SCAN,
        /** Scanned, the lecturer has no photo yet. */
        NO_PHOTO,
        /** Scanned, must tap their face. */
        PICK,
        /** Chose a face in this photo. */
        DONE,
        /** Said "not in the photo" (may still choose later). */
        TOLD
    }

    /**
     * One face box.
     */
    public static final class Box
    {
        /** Number that never changes. */
        public final int id;
        /** Left, top, width, height as fractions of the photo. */
        public final double x;
        /** Top. */
        public final double y;
        /** Width. */
        public final double w;
        /** Height. */
        public final double h;

        /**
         * Creates a box.
         * @param (int) id Box id.
         * @param (double) x Left.
         * @param (double) y Top.
         * @param (double) w Width.
         * @param (double) h Height.
         */
        public Box(int id, double x, double y, double w, double h)
        {
            this.id = id;
            this.x = x;
            this.y = y;
            this.w = w;
            this.h = h;
        }
    }

    /** Not instantiable. */
    private Faces()
    {
    }

    // ==========================================
    //                  LOGIC
    // ==========================================

    /**
     * Reads the boxes stored in the photo document.
     * @param (List&lt;?&gt;) raw List of maps {id, x, y, w, h}.
     * @return (List&lt;Box&gt;) Boxes (bad items skipped).
     */
    public static List<Box> fromMaps(List<?> raw)
    {
        List<Box> out = new ArrayList<Box>();
        if (raw == null)
        {
            return out;
        }
        for (Object o : raw)
        {
            if (!(o instanceof Map))
            {
                continue;
            }
            Map<?, ?> m = (Map<?, ?>) o;
            try
            {
                out.add(new Box(((Number) m.get("id")).intValue(), num(m, "x"), num(m, "y"), num(m, "w"), num(m, "h")));
            }
            catch (RuntimeException e)
            {
                // a broken box is skipped
            }
        }
        return out;
    }

    /**
     * Finds the box under a tap; small boxes get slack; the closest centre wins.
     * @param (List&lt;Box&gt;) boxes Boxes.
     * @param (double) px Tap x (fraction).
     * @param (double) py Tap y (fraction).
     * @return (int) Index, or -1.
     */
    public static int hitTest(List<Box> boxes, double px, double py)
    {
        int best = -1;
        double bestD = Double.MAX_VALUE;
        for (int i = 0; i < boxes.size(); i++)
        {
            Box b = boxes.get(i);
            double sx = b.w * HIT_SLACK;
            double sy = b.h * HIT_SLACK;
            if (px < b.x - sx || px > b.x + b.w + sx || py < b.y - sy || py > b.y + b.h + sy)
            {
                continue;
            }
            double d = Math.hypot((b.x + b.w / 2 - px) / b.w, (b.y + b.h / 2 - py) / b.h);
            if (d < bestD)
            {
                bestD = d;
                best = i;
            }
        }
        return best;
    }

    /**
     * What the student still has to do.
     * @param (boolean) scanned The student has an attendance record.
     * @param (Long) face Their chosen box, or null.
     * @param (Long) photoV The photo version they chose in, or null.
     * @param (Long) currentV The current photo version, or null when there is no photo.
     * @return (Step) Next step.
     */
    public static Step myStep(boolean scanned, Long face, Long photoV, Long currentV)
    {
        if (!scanned)
        {
            return Step.SCAN;
        }
        if (currentV == null)
        {
            return Step.NO_PHOTO;
        }
        if (photoV == null || photoV.longValue() != currentV.longValue())
        {
            return Step.PICK;
        }
        return face != null && face.longValue() == NOT_FOUND ? Step.TOLD : Step.DONE;
    }

    /**
     * Id of a claim document: one per box per photo version.
     * @param (long) version Photo version.
     * @param (long) id Box id.
     * @return (String) "version_id".
     */
    public static String claimId(long version, long id)
    {
        return version + "_" + id;
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Reads a number field.
     * @param (Map) m Map.
     * @param (String) k Key.
     * @return (double) Value.
     */
    private static double num(Map<?, ?> m, String k)
    {
        return ((Number) m.get(k)).doubleValue();
    }
}
