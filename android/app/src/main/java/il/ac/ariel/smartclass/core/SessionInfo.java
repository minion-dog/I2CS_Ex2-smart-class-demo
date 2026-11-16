package il.ac.ariel.smartclass.core;

/**
 * The part of a lecture the attendance sheet needs: id, title and start time.
 */
public final class SessionInfo
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Firestore id. */
    private final String id;

    /** Title shown as the column header. */
    private final String title;

    /** Start time, epoch milliseconds (orders the columns). */
    private final long startedAt;

    /**
     * Creates the info.
     * @param (String) id Session id.
     * @param (String) title Title.
     * @param (long) startedAt Start time in ms.
     */
    public SessionInfo(String id, String title, long startedAt)
    {
        this.id = id;
        this.title = title;
        this.startedAt = startedAt;
    }

    /**
     * Returns the id.
     * @return (String) Session id.
     */
    public String id()
    {
        return id;
    }

    /**
     * Returns the title.
     * @return (String) Title.
     */
    public String title()
    {
        return title;
    }

    /**
     * Returns the start time.
     * @return (long) Epoch ms.
     */
    public long startedAt()
    {
        return startedAt;
    }
}
