package il.ac.ariel.smartclass.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The attendance spreadsheet, the sheet's main feature (same layout as web/js/core/sheet.js):
 * one row per student, one column per lecture, a total at the end.
 * V = in class, Z = Zoom, M = marked by the lecturer, empty = absent.
 */
public final class AttendanceSheet
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Stored status: scanned in class. */
    public static final String PRESENT = "present";

    /** Stored status: scanned from far away. */
    public static final String ZOOM = "zoom";

    /** Stored status: marked by the lecturer. */
    public static final String MANUAL = "manual";

    /** Status to letter. */
    private static final Map<String, String> MARK = new HashMap<String, String>();

    static
    {
        MARK.put(PRESENT, "V");
        MARK.put(ZOOM, "Z");
        MARK.put(MANUAL, "M");
    }

    /** Column titles. */
    private final List<String> header;

    /** One row per student. */
    private final List<List<Object>> rows;

    /**
     * Creates a built sheet.
     * @param (List&lt;String&gt;) header Column titles.
     * @param (List&lt;List&lt;Object&gt;&gt;) rows Rows.
     */
    private AttendanceSheet(List<String> header, List<List<Object>> rows)
    {
        this.header = header;
        this.rows = rows;
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the sheet.
     * @param (List&lt;Student&gt;) roster The class list (staff rows are left out).
     * @param (List&lt;SessionInfo&gt;) sessions The lectures, in any order.
     * @param (Map&lt;String, Map&lt;String, String&gt;&gt;) attendance Session id, then email, to status.
     * @return (AttendanceSheet) The table.
     */
    public static AttendanceSheet build(List<Student> roster, List<SessionInfo> sessions,
                                        Map<String, Map<String, String>> attendance)
    {
        List<SessionInfo> ordered = new ArrayList<SessionInfo>(sessions);
        Collections.sort(ordered, new Comparator<SessionInfo>()
        {
            @Override
            public int compare(SessionInfo a, SessionInfo b)
            {
                return Long.compare(a.startedAt(), b.startedAt());
            }
        });
        List<String> header = new ArrayList<String>();
        header.add("שם פרטי");
        header.add("שם משפחה");
        header.add("ת.ז.");
        header.add("דוא\"ל");
        for (SessionInfo s : ordered)
        {
            header.add(s.title());
        }
        header.add("סה\"כ");
        List<List<Object>> rows = new ArrayList<List<Object>>();
        for (Student st : roster)
        {
            if (st.staff())
            {
                continue;
            }
            List<Object> row = new ArrayList<Object>();
            row.add(st.first());
            row.add(st.last());
            row.add(st.id());
            row.add(st.email());
            int total = 0;
            for (SessionInfo s : ordered)
            {
                Map<String, String> bySession = attendance.get(s.id());
                String mark = null;
                if (bySession != null && bySession.get(st.email()) != null)
                {
                    mark = MARK.get(bySession.get(st.email()));
                }
                if (mark == null)
                {
                    row.add("");
                }
                else
                {
                    row.add(mark);
                    total++;
                }
            }
            row.add(total);
            rows.add(row);
        }
        return new AttendanceSheet(header, rows);
    }

    /**
     * Returns the column titles.
     * @return (List&lt;String&gt;) Header.
     */
    public List<String> header()
    {
        return header;
    }

    /**
     * Returns the rows.
     * @return (List&lt;List&lt;Object&gt;&gt;) Rows (String cells and an Integer total).
     */
    public List<List<Object>> rows()
    {
        return rows;
    }

    /**
     * Returns header + rows, ready for {@link Xlsx#write}.
     * @return (List&lt;List&lt;Object&gt;&gt;) All rows.
     */
    public List<List<Object>> table()
    {
        List<List<Object>> all = new ArrayList<List<Object>>();
        all.add(new ArrayList<Object>(header));
        all.addAll(rows);
        return all;
    }
}
