package il.ac.ariel.smartclass.ai;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

import il.ac.ariel.smartclass.core.Prompts;

/**
 * Reads a PUBLIC GitHub repository for the AI review (same choice of files as
 * web/js/ai/github.js): README first, then source files, shallow paths first, no build
 * output. Blocks, so call it from a background thread.
 */
public final class GitHub
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Files read from a repository. */
    private static final int MAX_FILES = 25;

    /** Characters kept per file. */
    private static final int FILE_CHARS = 12000;

    /** Files worth reading. */
    private static final Pattern CODE_EXT = Pattern.compile(
        "(?i).*\\.(java|kt|py|js|ts|c|h|cpp|hpp|cs|go|rs|html|css|md|txt|json|xml|gradle|sql)$");

    /** Folders never read. */
    private static final Pattern SKIP_DIR = Pattern.compile(
        "(^|.*/)(node_modules|build|dist|out|\\.git|\\.idea|venv|__pycache__|target)(/.*|$)");

    /** Not instantiable. */
    private GitHub()
    {
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Downloads the chosen files of a repository and joins them into one text.
     * @param (String) url Repository URL.
     * @return (String) "===== path =====" blocks.
     * @throws (IOException) For a non-GitHub URL, a private repo or a network error.
     */
    public static String repoText(String url) throws IOException
    {
        String[] parts = Prompts.githubParts(url);
        if (parts == null)
        {
            throw new IOException("not a GitHub link");
        }
        String base = "https://api.github.com/repos/" + parts[0] + "/" + parts[1];
        try
        {
            String branch = new JSONObject(get(base)).getString("default_branch");
            JSONArray tree = new JSONObject(get(base + "/git/trees/" + enc(branch) + "?recursive=1")).getJSONArray("tree");
            List<String> paths = pick(tree);
            StringBuilder out = new StringBuilder();
            for (String p : paths)
            {
                String raw = "https://raw.githubusercontent.com/" + parts[0] + "/" + parts[1] + "/" + enc(branch) + "/" + p;
                String body = get(raw);
                if (body.length() > FILE_CHARS)
                {
                    body = body.substring(0, FILE_CHARS) + "\n[... cut ...]";
                }
                out.append("\n===== ").append(p).append(" =====\n").append(body).append('\n');
            }
            return out.toString();
        }
        catch (JSONException e)
        {
            throw new IOException("unexpected GitHub answer", e);
        }
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Picks which files to read.
     * @param (JSONArray) tree The trees API list.
     * @return (List&lt;String&gt;) Paths, README first.
     * @throws (JSONException) On a malformed list.
     */
    private static List<String> pick(JSONArray tree) throws JSONException
    {
        List<String> readme = new ArrayList<String>();
        List<String> rest = new ArrayList<String>();
        for (int i = 0; i < tree.length(); i++)
        {
            JSONObject n = tree.getJSONObject(i);
            String path = n.getString("path");
            if (!"blob".equals(n.optString("type")) || !CODE_EXT.matcher(path).matches() || SKIP_DIR.matcher(path).matches())
            {
                continue;
            }
            if (path.toLowerCase(java.util.Locale.ROOT).endsWith("readme.md"))
            {
                readme.add(path);
            }
            else
            {
                rest.add(path);
            }
        }
        Collections.sort(rest, new Comparator<String>()
        {
            @Override
            public int compare(String a, String b)
            {
                int d = depth(a) - depth(b);
                if (d != 0)
                {
                    return d;
                }
                return a.compareTo(b);
            }
        });
        readme.addAll(rest);
        return readme.subList(0, Math.min(MAX_FILES, readme.size()));
    }

    /**
     * Counts the slashes of a path.
     * @param (String) p Path.
     * @return (int) Depth.
     */
    private static int depth(String p)
    {
        int n = 0;
        for (int i = 0; i < p.length(); i++)
        {
            if (p.charAt(i) == '/')
            {
                n++;
            }
        }
        return n;
    }

    /**
     * GETs a URL as text.
     * @param (String) url URL.
     * @return (String) Body.
     * @throws (IOException) On HTTP errors.
     */
    private static String get(String url) throws IOException
    {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setRequestProperty("Accept", "application/vnd.github+json");
        int code = con.getResponseCode();
        if (code >= 400)
        {
            throw new IOException("GitHub " + code);
        }
        return Ai.readAll(con.getInputStream());
    }

    /**
     * URL-encodes a branch name.
     * @param (String) s Text.
     * @return (String) Encoded.
     */
    private static String enc(String s)
    {
        try
        {
            return URLEncoder.encode(s, StandardCharsets.UTF_8.name());
        }
        catch (java.io.UnsupportedEncodingException e)
        {
            return s;
        }
    }
}
