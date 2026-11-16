package il.ac.ariel.smartclass.core;

/**
 * The screen side of the "QR you can't photograph" (same algorithm and hash as
 * web/js/core/noisyqr.js).
 *
 * The QR is hidden in HOW FAST each square changes, not in its colour:
 * <ul>
 *   <li>every square shows a random colour (black or white);</li>
 *   <li>a DARK square of the QR keeps its colour for HOLD phases;</li>
 *   <li>a LIGHT square (and the quiet border) gets a new random colour every phase.</li>
 * </ul>
 * So a single frame is random dots, and the average of ANY number of frames (a phone photo
 * merges several: HDR, night mode) is plain grey. Only a live video, analysed by
 * {@link ChangeMap}, shows which squares change slowly: those are the dark squares.
 */
public final class FlickerSchedule
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** A new phase every 33 ms (30 per second). */
    public static final long PHASE_MS = 33;

    /** A dark square keeps its colour for 8 phases (~0.27 s). */
    public static final int HOLD = 8;

    /** Camera frames in the change map (~0.8 s at 30 fps). */
    public static final int FRAMES = 25;

    /** Flickering border in squares (2 is enough for our readers, and the squares get bigger). */
    public static final int QUIET_ZONE = 2;

    /** Squares per side, border included. */
    private final int total;

    /** Per square: true = dark square of the QR (changes slowly). */
    private final boolean[] slow;

    /** Per square: when inside its HOLD period it changes (spreads the changes over time). */
    private final int[] offset;

    /** Random seed of this code. */
    private final int seed;

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the plan for one QR.
     * @param (boolean[]) dark Clean modules, row by row; true = dark.
     * @param (int) size Modules per side.
     * @param (int) seed Random seed (a fresh one for every code).
     */
    public FlickerSchedule(boolean[] dark, int size, int seed)
    {
        this.total = size + 2 * QUIET_ZONE;
        this.seed = seed;
        this.slow = new boolean[total * total];
        this.offset = new int[total * total];
        for (int r = 0; r < size; r++)
        {
            for (int c = 0; c < size; c++)
            {
                slow[(r + QUIET_ZONE) * total + (c + QUIET_ZONE)] = dark[r * size + c];
            }
        }
        for (int i = 0; i < offset.length; i++)
        {
            offset[i] = Integer.remainderUnsigned(mix(seed, i, 0x51ED, 7), HOLD);
        }
    }

    /**
     * Returns the colours of one phase, border included.
     * @param (long) phase Phase number (time / PHASE_MS).
     * @return (boolean[]) total*total squares; true = black.
     */
    public boolean[] frame(long phase)
    {
        boolean[] out = new boolean[slow.length];
        for (int i = 0; i < out.length; i++)
        {
            if (slow[i])
            {
                int epoch = (int) Math.floorDiv(phase + offset[i], (long) HOLD);
                out[i] = (mix(seed, i, epoch, 1) & 1) == 1;
            }
            else
            {
                out[i] = (mix(seed, i, (int) phase, 0) & 1) == 1;
            }
        }
        return out;
    }

    /**
     * Returns the number of squares per side, border included.
     * @return (int) Squares per side.
     */
    public int total()
    {
        return total;
    }

    /**
     * Tells whether a square is a dark square of the QR (changes slowly).
     * @param (int) i Square index (row * total + column).
     * @return (boolean) True for a dark square.
     */
    public boolean isSlow(int i)
    {
        return slow[i];
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * A fast integer hash (deterministic "random" bits), identical to the website's.
     * @param (int) seed Code seed.
     * @param (int) i Square index.
     * @param (int) epoch Time slot.
     * @param (int) salt Extra input.
     * @return (int) 32 hash bits.
     */
    static int mix(int seed, int i, int epoch, int salt)
    {
        int h = seed ^ ((i + 1) * 0x9E3779B1) ^ ((epoch + 0x7F4A7C15) * 0x85EBCA77) ^ ((salt + 3) * 0xC2B2AE3D);
        h = (h ^ (h >>> 16)) * 0x7FEB352D;
        h = (h ^ (h >>> 15)) * 0x846CA68B;
        return h ^ (h >>> 16);
    }
}
