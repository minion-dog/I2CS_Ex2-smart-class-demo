package il.ac.ariel.smartclass.core;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Emoji reactions on public comments (same as web/js/core/reactions.js): each user may pick
 * several emojis on a comment, each once; everyone sees how many of each, never who.
 */
public final class Reactions
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Emoji keys, in the shown order. */
    public static final String[] KEYS = {"like", "love", "haha", "wow", "think"};

    /** The emojis, matching KEYS. */
    public static final String[] EMOJIS = {"👍", "❤️", "😂", "😮", "🤔"};

    /** Not instantiable. */
    private Reactions()
    {
    }

    // ==========================================
    //                  LOGIC
    // ==========================================

    /**
     * The record id of one user on one comment.
     * @param (String) cid Comment id.
     * @param (String) uid User id.
     * @return (String) Id.
     */
    public static String id(String cid, String uid)
    {
        return cid + "_" + uid;
    }

    /**
     * Keeps only known keys, each once, in the shown order.
     * @param (List&lt;String&gt;) emojis Keys (may be null).
     * @return (List&lt;String&gt;) Clean keys.
     */
    public static List<String> clean(List<String> emojis)
    {
        Set<String> in = new LinkedHashSet<String>(emojis == null ? new ArrayList<String>() : emojis);
        List<String> out = new ArrayList<String>();
        for (String k : KEYS)
        {
            if (in.contains(k))
            {
                out.add(k);
            }
        }
        return out;
    }

    /**
     * Adds the emoji when it is not picked, removes it when it is.
     * @param (List&lt;String&gt;) mine My keys on this comment.
     * @param (String) key The tapped emoji.
     * @return (List&lt;String&gt;) New keys.
     */
    public static List<String> toggle(List<String> mine, String key)
    {
        List<String> next = new ArrayList<String>(clean(mine));
        if (!next.remove(key))
        {
            next.add(key);
        }
        return clean(next);
    }

    /**
     * Counts one comment's emojis.
     * @param (List&lt;List&lt;String&gt;&gt;) records Each user's keys on this comment.
     * @return (Map&lt;String, Integer&gt;) Count per key (only keys with a count).
     */
    public static Map<String, Integer> count(List<List<String>> records)
    {
        Map<String, Integer> out = new HashMap<String, Integer>();
        for (List<String> r : records)
        {
            for (String k : clean(r))
            {
                Integer n = out.get(k);
                out.put(k, n == null ? 1 : n + 1);
            }
        }
        return out;
    }

    /**
     * Convenience for tests and callers: a list from keys.
     * @param (String[]) keys Keys.
     * @return (List&lt;String&gt;) The list.
     */
    public static List<String> of(String... keys)
    {
        return new ArrayList<String>(Arrays.asList(keys));
    }
}
