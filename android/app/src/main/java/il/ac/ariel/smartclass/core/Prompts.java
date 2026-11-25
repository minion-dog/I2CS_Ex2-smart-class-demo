package il.ac.ariel.smartclass.core;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The text we send to the AI and small form helpers (same prompts as web/js/ai/prompts.js,
 * so the website and the app give the same kind of summary and review).
 */
public final class Prompts
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Characters of transcript sent (~ a 3-hour lecture). */
    public static final int TRANSCRIPT_CHARS = 200000;

    /** Characters per submission sent. */
    public static final int SUBMISSION_CHARS = 60000;

    /** Characters per other student's summary. */
    public static final int PEER_SUMMARY_CHARS = 1500;

    /** Max answers in a poll. */
    public static final int MAX_POLL_OPTIONS = 6;

    /** A GitHub repository URL. */
    private static final Pattern GITHUB = Pattern.compile(
        "^https?://(?:www\\.)?github\\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\\.git)?(?:/.*)?$");

    /** The one-line summary at the end of a review. */
    private static final Pattern SUMMARY_LINE = Pattern.compile("(?i)SUMMARY:\\s*(.+)");

    /** Not instantiable. */
    private Prompts()
    {
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds the system and user messages for a lecture summary.
     * @param (String) title Lecture name.
     * @param (String) transcript Full text.
     * @param (boolean) english True for an English summary, false for Hebrew.
     * @return (String[]) {system, user}.
     */
    public static String[] summary(String title, String transcript, boolean english)
    {
        String lang = "Hebrew";
        if (english)
        {
            lang = "English";
        }
        String text = transcript.substring(0, Math.min(TRANSCRIPT_CHARS, transcript.length()));
        String system = "You summarise university lectures for students. Write in " + lang + ". "
            + "Structure: 1) the main topics as short headings, 2) key definitions and formulas, "
            + "3) examples the lecturer gave, 4) what to review before next time. "
            + "Use only what is in the transcript; if something is unclear, say so instead of guessing.";
        return new String[] {system, "Lecture: " + title + "\n\nTranscript:\n" + text};
    }

    /**
     * Builds the messages for a homework review that also compares with the class.
     * Other students appear only as short anonymous summaries.
     * @param (String) requirements The assignment's requirements.
     * @param (String) submission The submission's text (files joined).
     * @param (List&lt;String&gt;) peers One-line summaries of other submissions.
     * @param (boolean) english True for English, false for Hebrew.
     * @return (String[]) {system, user}.
     */
    public static String[] review(String requirements, String submission, List<String> peers, boolean english)
    {
        String lang = "Hebrew";
        if (english)
        {
            lang = "English";
        }
        StringBuilder p = new StringBuilder();
        for (int i = 0; i < peers.size(); i++)
        {
            String s = peers.get(i);
            p.append("\nStudent ").append((char) ('A' + (i % 26))).append(": ")
                .append(s.substring(0, Math.min(PEER_SUMMARY_CHARS, s.length())));
        }
        if (p.length() == 0)
        {
            p.append(" none yet");
        }
        String system = "You are a teaching assistant reviewing a software-engineering homework. Write in " + lang + ". "
            + "Sections: 1) Requirements check: each requirement, Met / Partly / Missing, with evidence (file name). "
            + "2) Missing elements. 3) Code quality (design, naming, tests). "
            + "4) Comparison with the class: how this work compares with the other submissions, without naming anyone. "
            + "5) Three concrete suggestions. Finish with one line: \"SUMMARY: <one sentence about what this submission does>\". "
            + "Be specific and fair; do not invent files that are not shown.";
        String sub = submission.substring(0, Math.min(SUBMISSION_CHARS, submission.length()));
        String user = "REQUIREMENTS:\n" + requirements + "\n\nOTHER SUBMISSIONS (anonymous summaries):" + p
            + "\n\nTHIS SUBMISSION:\n" + sub;
        return new String[] {system, user};
    }

    /**
     * Splits a GitHub URL into owner and repository.
     * @param (String) url Repository URL.
     * @return (String[]) {owner, repo}, or null when it is not a GitHub repository URL.
     */
    public static String[] githubParts(String url)
    {
        if (url == null)
        {
            return null;
        }
        Matcher m = GITHUB.matcher(url.trim());
        if (!m.matches())
        {
            return null;
        }
        return new String[] {m.group(1), m.group(2)};
    }

    /**
     * Pulls the one-sentence summary line out of a review.
     * @param (String) review The AI review.
     * @return (String) The summary, or the first 200 characters.
     */
    public static String reviewSummaryLine(String review)
    {
        if (review == null)
        {
            return "";
        }
        Matcher m = SUMMARY_LINE.matcher(review);
        if (m.find())
        {
            return m.group(1).trim();
        }
        return review.substring(0, Math.min(200, review.length()));
    }

}
