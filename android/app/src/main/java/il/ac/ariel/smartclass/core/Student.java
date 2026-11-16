package il.ac.ariel.smartclass.core;

/**
 * One row of the Moodle class list. Staff (lecturer, TA) have an empty group.
 */
public final class Student
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** First name. */
    private final String first;

    /** Last name. */
    private final String last;

    /** National ID (only the lecturer can read it). */
    private final String id;

    /** Email in lower case (the key everywhere). */
    private final String email;

    /** Moodle group; empty for staff. */
    private final String group;

    /**
     * Creates a class-list entry.
     * @param (String) first First name.
     * @param (String) last Last name.
     * @param (String) id National ID.
     * @param (String) email Email (stored in lower case).
     * @param (String) group Moodle group, empty for staff.
     */
    public Student(String first, String last, String id, String email, String group)
    {
        this.first = first;
        this.last = last;
        this.id = id;
        this.email = ClassList.normaliseEmail(email);
        this.group = group;
    }

    /**
     * Returns the first name.
     * @return (String) First name.
     */
    public String first()
    {
        return first;
    }

    /**
     * Returns the last name.
     * @return (String) Last name.
     */
    public String last()
    {
        return last;
    }

    /**
     * Returns the national ID.
     * @return (String) ID.
     */
    public String id()
    {
        return id;
    }

    /**
     * Returns the email in lower case.
     * @return (String) Email.
     */
    public String email()
    {
        return email;
    }

    /**
     * Returns the Moodle group.
     * @return (String) Group, empty for staff.
     */
    public String group()
    {
        return group;
    }

    /**
     * Tells whether this row is staff (no group).
     * @return (boolean) True for the lecturer or a TA.
     */
    public boolean staff()
    {
        return group.isEmpty();
    }

    /**
     * Returns "first last".
     * @return (String) Full name.
     */
    public String fullName()
    {
        return first + " " + last;
    }
}
