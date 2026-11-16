package il.ac.ariel.smartclass.core;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Reads the Moodle participants file (same rules as web/js/core/classlist.js):
 * columns first name, last name, ID, email, groups; staff have an empty group;
 * emails are compared in lower case.
 */
public final class ClassList
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Column of each field. */
    private static final int COL_FIRST = 0;
    private static final int COL_LAST = 1;
    private static final int COL_ID = 2;
    private static final int COL_EMAIL = 3;
    private static final int COL_GROUP = 4;

    /** Not instantiable. */
    private ClassList()
    {
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Splits CSV text into rows of trimmed cells (RFC 4180 quotes, "" = one quote).
     * @param (String) text File content.
     * @return (List&lt;List&lt;String&gt;&gt;) Rows; empty lines are dropped.
     */
    public static List<List<String>> parseCsv(String text)
    {
        String src = text;
        if (src.startsWith("﻿"))
        {
            src = src.substring(1);
        }
        List<List<String>> rows = new ArrayList<List<String>>();
        List<String> row = new ArrayList<String>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < src.length(); i++)
        {
            char ch = src.charAt(i);
            if (quoted)
            {
                if (ch == '"' && i + 1 < src.length() && src.charAt(i + 1) == '"')
                {
                    cell.append('"');
                    i++;
                }
                else if (ch == '"')
                {
                    quoted = false;
                }
                else
                {
                    cell.append(ch);
                }
            }
            else if (ch == '"')
            {
                quoted = true;
            }
            else if (ch == ',')
            {
                row.add(cell.toString().trim());
                cell.setLength(0);
            }
            else if (ch == '\n' || ch == '\r')
            {
                if (ch == '\r' && i + 1 < src.length() && src.charAt(i + 1) == '\n')
                {
                    i++;
                }
                row.add(cell.toString().trim());
                addRow(rows, row);
                row = new ArrayList<String>();
                cell.setLength(0);
            }
            else
            {
                cell.append(ch);
            }
        }
        row.add(cell.toString().trim());
        addRow(rows, row);
        return rows;
    }

    /**
     * Turns rows (from CSV or XLSX) into class-list entries; the first row is the header.
     * Rows without an email are skipped; a repeated email is kept once.
     * @param (List&lt;List&lt;String&gt;&gt;) rows The rows.
     * @return (List&lt;Student&gt;) Entries.
     */
    public static List<Student> fromRows(List<List<String>> rows)
    {
        List<Student> out = new ArrayList<Student>();
        Set<String> seen = new HashSet<String>();
        for (int i = 1; i < rows.size(); i++)
        {
            List<String> r = rows.get(i);
            String email = normaliseEmail(cell(r, COL_EMAIL));
            if (email.isEmpty() || seen.contains(email))
            {
                continue;
            }
            seen.add(email);
            out.add(new Student(cell(r, COL_FIRST), cell(r, COL_LAST), cell(r, COL_ID), email, cell(r, COL_GROUP)));
        }
        return out;
    }

    /**
     * Normalises an email for comparison.
     * @param (String) email Any case, may have spaces.
     * @return (String) Trimmed lower case.
     */
    public static String normaliseEmail(String email)
    {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Returns a trimmed cell, or "" when the row is short.
     * @param (List&lt;String&gt;) row The row.
     * @param (int) col Column.
     * @return (String) Cell text.
     */
    private static String cell(List<String> row, int col)
    {
        if (col >= row.size())
        {
            return "";
        }
        return row.get(col).trim();
    }

    /**
     * Adds a row unless every cell is empty.
     * @param (List&lt;List&lt;String&gt;&gt;) rows Target.
     * @param (List&lt;String&gt;) row Candidate.
     */
    private static void addRow(List<List<String>> rows, List<String> row)
    {
        for (String c : row)
        {
            if (!c.isEmpty())
            {
                rows.add(row);
                return;
            }
        }
    }
}
