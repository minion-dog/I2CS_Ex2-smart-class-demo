package il.ac.ariel.smartclass.ai;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * The only class that talks to the AI: Google Gemini (free tier), for speech to text
 * (Hebrew) and for summaries and reviews. Same model as web/js/ai/gemini.js.
 *
 * Decision: the lecturer never types a key ("works as you get it"). The key is built in
 * but private: the course admin stores it once in Firestore at config/ai, the security
 * rules let only the lecturer account read it, and {@link il.ac.ariel.smartclass.data.Repo}
 * hands it to this class after the lecturer signs in. It is cached in app-private storage
 * so AI also works offline. It is never in the code or in the app that students install.
 * All network methods block, so call them from a background thread.
 */
public final class Ai
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** API base. */
    private static final String BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

    /** Model (answers in Hebrew; checked 25 Nov 2026). */
    private static final String MODEL = "gemini-3.5-flash";

    /** Audio up to this size is sent inside the request (Gemini limit 20 MB). */
    private static final long MAX_INLINE_BYTES = 18L * 1024 * 1024;

    /** Where the key is cached. */
    private static final String PREFS = "smartclass";

    /** Key name in the preferences. */
    private static final String KEY = "aiKey";

    /** Network timeout. */
    private static final int TIMEOUT_MS = 120000;

    /** Not instantiable. */
    private Ai()
    {
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Tells whether the built-in key is here.
     * @param (Context) c Context.
     * @return (boolean) True when AI can be used.
     */
    public static boolean ready(Context c)
    {
        return !key(c).isEmpty();
    }

    /**
     * Keeps the key that Repo read from Firestore (lecturer only).
     * @param (Context) c Context.
     * @param (String) key The key, or "" to forget it.
     */
    public static void setKey(Context c, String key)
    {
        prefs(c).edit().putString(KEY, key == null ? "" : key.trim()).apply();
    }

    /**
     * Asks the model.
     * @param (Context) c Context (for the key).
     * @param (String) system Instructions.
     * @param (String) user The question / material.
     * @return (String) The answer.
     * @throws (IOException) On a network or API error, or "no-key".
     */
    public static String chat(Context c, String system, String user) throws IOException
    {
        try
        {
            JSONObject body = new JSONObject();
            body.put("systemInstruction", new JSONObject().put("parts", new JSONArray().put(new JSONObject().put("text", system))));
            body.put("contents", new JSONArray().put(userTurn(new JSONArray().put(new JSONObject().put("text", user)))));
            body.put("generationConfig", new JSONObject().put("temperature", 0.3));
            return textOf(post(c, body));
        }
        catch (JSONException e)
        {
            throw new IOException("bad answer from Gemini", e);
        }
    }

    /**
     * Transcribes an audio file (Hebrew).
     * @param (Context) c Context (for the key).
     * @param (File) audio The recording (m4a).
     * @return (String) The text.
     * @throws (IOException) On a network or API error, "no-key" or "file-too-large".
     */
    public static String transcribe(Context c, File audio) throws IOException
    {
        if (audio.length() > MAX_INLINE_BYTES)
        {
            throw new IOException("file-too-large");
        }
        try
        {
            String data = Base64.encodeToString(readBytes(audio), Base64.NO_WRAP);
            JSONArray parts = new JSONArray();
            parts.put(new JSONObject().put("text",
                "Transcribe this lecture recording word by word in Hebrew. Output only the transcript, no comments."));
            parts.put(new JSONObject().put("inline_data", new JSONObject().put("mime_type", "audio/mp4").put("data", data)));
            JSONObject body = new JSONObject();
            body.put("contents", new JSONArray().put(userTurn(parts)));
            body.put("generationConfig", new JSONObject().put("temperature", 0));
            return textOf(post(c, body));
        }
        catch (JSONException e)
        {
            throw new IOException("bad answer from Gemini", e);
        }
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * One user turn.
     * @param (JSONArray) parts Its parts.
     * @return (JSONObject) The turn.
     * @throws (JSONException) Never in practice.
     */
    private static JSONObject userTurn(JSONArray parts) throws JSONException
    {
        return new JSONObject().put("role", "user").put("parts", parts);
    }

    /**
     * Reads the text out of an answer.
     * @param (JSONObject) res The response body.
     * @return (String) The text, or "".
     * @throws (JSONException) On an unexpected shape.
     */
    private static String textOf(JSONObject res) throws JSONException
    {
        JSONArray cands = res.optJSONArray("candidates");
        if (cands == null || cands.length() == 0)
        {
            return "";
        }
        JSONArray parts = cands.getJSONObject(0).getJSONObject("content").getJSONArray("parts");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < parts.length(); i++)
        {
            out.append(parts.getJSONObject(i).optString("text", ""));
        }
        return out.toString().trim();
    }

    /**
     * POSTs to generateContent.
     * @param (Context) c Context (for the key).
     * @param (JSONObject) body Request body.
     * @return (JSONObject) Response body.
     * @throws (IOException) On errors, or "no-key".
     * @throws (JSONException) On a body that is not JSON.
     */
    private static JSONObject post(Context c, JSONObject body) throws IOException, JSONException
    {
        String key = key(c);
        if (key.isEmpty())
        {
            throw new IOException("no-key");
        }
        HttpURLConnection con = (HttpURLConnection) new URL(BASE + MODEL + ":generateContent").openConnection();
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setConnectTimeout(TIMEOUT_MS);
        con.setReadTimeout(TIMEOUT_MS);
        con.setRequestProperty("x-goog-api-key", key);
        con.setRequestProperty("Content-Type", "application/json");
        OutputStream out = con.getOutputStream();
        try
        {
            out.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        finally
        {
            out.close();
        }
        return readJson(con);
    }

    /**
     * The cached key.
     * @param (Context) c Context.
     * @return (String) Key, or "".
     */
    private static String key(Context c)
    {
        return prefs(c).getString(KEY, "");
    }

    /**
     * Reads a whole file.
     * @param (File) f The file.
     * @return (byte[]) Its bytes.
     * @throws (IOException) On a read error.
     */
    private static byte[] readBytes(File f) throws IOException
    {
        InputStream in = new FileInputStream(f);
        try
        {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n = in.read(buf);
            while (n > 0)
            {
                out.write(buf, 0, n);
                n = in.read(buf);
            }
            return out.toByteArray();
        }
        finally
        {
            in.close();
        }
    }

    /**
     * Reads a JSON answer; HTTP errors become exceptions with the API's message.
     * @param (HttpURLConnection) con The connection.
     * @return (JSONObject) The body.
     * @throws (IOException) On HTTP errors.
     * @throws (JSONException) On a body that is not JSON.
     */
    private static JSONObject readJson(HttpURLConnection con) throws IOException, JSONException
    {
        int code = con.getResponseCode();
        InputStream in;
        if (code >= 400)
        {
            in = con.getErrorStream();
        }
        else
        {
            in = con.getInputStream();
        }
        String text = "";
        if (in != null)
        {
            text = readAll(in);
        }
        if (code >= 400)
        {
            String msg = "HTTP " + code;
            try
            {
                msg = new JSONObject(text).getJSONObject("error").getString("message");
            }
            catch (JSONException e)
            {
                // keep the HTTP code as the message
            }
            throw new IOException(msg);
        }
        return new JSONObject(text);
    }

    /**
     * Reads a stream as UTF-8 text and closes it.
     * @param (InputStream) in The stream.
     * @return (String) Text.
     * @throws (IOException) On a read error.
     */
    static String readAll(InputStream in) throws IOException
    {
        try
        {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n = in.read(buf);
            while (n > 0)
            {
                out.write(buf, 0, n);
                n = in.read(buf);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
        finally
        {
            in.close();
        }
    }

    /**
     * Returns the app-private preferences.
     * @param (Context) c Context.
     * @return (SharedPreferences) Preferences.
     */
    private static SharedPreferences prefs(Context c)
    {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
