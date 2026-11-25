package il.ac.ariel.smartclass.core;

/**
 * Polls & quizzes, one feature (same rules as web/js/core/quiz.js). A question may have a
 * correct answer or not (a poll), and a time limit or not. A correct answer gives 500-1000
 * points (faster = more) when timed, 1000 when not. The phone shows 2-6 coloured buttons.
 */
public final class Quiz
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Points for an instant correct answer. */
    public static final int MAX_POINTS = 1000;

    /** Points for a correct answer at the last moment. */
    public static final int MIN_POINTS = 500;

    /** Network time after the timer ends. */
    public static final long GRACE_MS = 2000;

    /** Button colours (red, blue, yellow, green, purple, teal). */
    public static final int[] COLORS = {0xFFE21B3C, 0xFF1368CE, 0xFFD89E00, 0xFF26890C, 0xFF864CBF, 0xFF0A8F8F};

    /** Button shapes. */
    public static final String[] SHAPES = {"▲", "◆", "●", "■", "★", "⬟"};

    /** No correct answer (a poll question). */
    public static final int NO_ANSWER = -1;

    /** Not instantiable. */
    private Quiz()
    {
    }

    // ==========================================
    //                  LOGIC
    // ==========================================

    /**
     * Points for one answer.
     * @param (boolean) correct Right answer.
     * @param (long) elapsedMs From the question's start to the answer.
     * @param (long) limitMs The question's time.
     * @return (int) Points.
     */
    public static int points(boolean correct, long elapsedMs, long limitMs)
    {
        if (!correct || (limitMs > 0 && elapsedMs > limitMs + GRACE_MS))
        {
            return 0;
        }
        if (limitMs <= 0)
        {
            return MAX_POINTS;                       // no time limit: a correct answer gets the full points
        }
        double part = Math.min(1.0, Math.max(0.0, elapsedMs / (double) limitMs));
        return (int) Math.round(MAX_POINTS - (MAX_POINTS - MIN_POINTS) * part);
    }

    /**
     * Whole seconds left in a question.
     * @param (long) startedAt Start (ms).
     * @param (long) seconds Question time.
     * @param (long) now Now (ms).
     * @return (long) Seconds left, 0 at the end.
     */
    public static long secondsLeft(long startedAt, long seconds, long now)
    {
        return Math.max(0, (long) Math.ceil((startedAt + seconds * 1000 - now) / 1000.0));
    }

    /**
     * The timer text: "45", "4:59", or "" without a limit.
     * @param (long) seconds Question time (0 = no limit).
     * @param (long) left Seconds left.
     * @return (String) Label.
     */
    public static String timerLabel(long seconds, long left)
    {
        if (seconds <= 0)
        {
            return "";
        }
        return left >= 60 ? (left / 60) + ":" + String.format(java.util.Locale.ROOT, "%02d", left % 60) : String.valueOf(left);
    }

    /**
     * Tells whether students see the quiz (the lecturer opened it).
     * @param (String) phase State phase.
     * @return (boolean) Shown on phones.
     */
    public static boolean isLive(String phase)
    {
        return "lobby".equals(phase) || "question".equals(phase) || "reveal".equals(phase)
                || "board".equals(phase) || "end".equals(phase);
    }
}
