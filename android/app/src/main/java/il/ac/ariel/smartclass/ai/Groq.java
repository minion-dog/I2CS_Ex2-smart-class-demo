package il.ac.ariel.smartclass.ai;

import android.content.Context;
import android.content.SharedPreferences;

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
import java.util.UUID;

/**
 * The only class that talks to the AI (Groq): Whisper for speech to text (Hebrew) and a
 * chat model for summaries and reviews. Same models as web/js/ai/groq.js.
 *
 * The key is pasted by the lecturer in Settings and kept only on that phone (app-private
 * storage). It is never in the code and never in the app that students install.
 * All methods block, so call them from a background thread.
 */
public final class Groq
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** API base. */
    private static final String BASE = "https://api.groq.com/openai/v1";

    /** Speech model (supports Hebrew). */
    private static final String SPEECH_MODEL = "whisper-large-v3";

    /** Chat model (131k context). */
    private static final String CHAT_MODEL = "openai/gpt-oss-120b";

    /** Where the key is kept. */
    private static final String PREFS = "smartclass";

    /** Key name in the preferences. */
    private static final String KEY = "groqKey";

    /** Network timeout. */
    private static final int TIMEOUT_MS = 120000;

    /** Not instantiable. */
    private Groq()
    {
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Returns the saved key.
     * @param (Context) c Context.
     * @return (String) Key, or "".
     */
    public static String key(Context c)
    {
        return prefs(c).getString(KEY, "");
    }

    /**
     * Saves the key on this phone.
     * @param (Context) c Context.
     * @param (String) key The Groq API key.
     */
    public static void saveKey(Context c, String key)
    {
        prefs(c).edit().putString(KEY, key.trim()).apply();
    }

    /**
     * Asks the chat model.
     * @param (Context) c Context (for the key).
     * @param (String) system System message.
     * @param (String) user User message.
     * @return (String) The answer.
     * @throws (IOException) On a network or API error, or "no-key".
     */
    public static String chat(Context c, String system, String user) throws IOException
    {
        try
        {
            JSONObject body = new JSONObject();
            body.put("model", CHAT_MODEL);
            body.put("temperature", 0.3);
            JSONArray messages = new JSONArray();
            messages.put(new JSONObject().put("role", "system").put("content", system));
            messages.put(new JSONObject().put("role", "user").put("content", user));
            body.put("messages", messages);
            HttpURLConnection con = open(c, "/chat/completions");
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
            JSONObject res = readJson(con);
            return res.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content").trim();
        }
        catch (JSONException e)
        {
            throw new IOException("bad answer from Groq", e);
        }
    }

    /**
     * Transcribes an audio file (Hebrew).
     * @param (Context) c Context (for the key).
     * @param (File) audio The recording (m4a, webm, mp3...).
     * @return (String) The text.
     * @throws (IOException) On a network or API error, or "no-key".
     */
    public static String transcribe(Context c, File audio) throws IOException
    {
        String boundary = "----smartclass" + UUID.randomUUID();
        HttpURLConnection con = open(c, "/audio/transcriptions");
        con.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        OutputStream out = con.getOutputStream();
        try
        {
            field(out, boundary, "model", SPEECH_MODEL);
            field(out, boundary, "language", "he");
            field(out, boundary, "response_format", "json");
            String head = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\""
                + audio.getName() + "\"\r\nContent-Type: application/octet-stream\r\n\r\n";
            out.write(head.getBytes(StandardCharsets.UTF_8));
            InputStream in = new FileInputStream(audio);
            try
            {
                byte[] buf = new byte[8192];
                int n = in.read(buf);
                while (n > 0)
                {
                    out.write(buf, 0, n);
                    n = in.read(buf);
                }
            }
            finally
            {
                in.close();
            }
            out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        }
        finally
        {
            out.close();
        }
        try
        {
            return readJson(con).optString("text", "").trim();
        }
        catch (JSONException e)
        {
            throw new IOException("bad answer from Groq", e);
        }
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Opens an authorised POST connection.
     * @param (Context) c Context.
     * @param (String) path API path.
     * @return (HttpURLConnection) The connection.
     * @throws (IOException) "no-key" when no key is saved.
     */
    private static HttpURLConnection open(Context c, String path) throws IOException
    {
        String key = key(c);
        if (key.isEmpty())
        {
            throw new IOException("no-key");
        }
        HttpURLConnection con = (HttpURLConnection) new URL(BASE + path).openConnection();
        con.setRequestMethod("POST");
        con.setDoOutput(true);
        con.setConnectTimeout(TIMEOUT_MS);
        con.setReadTimeout(TIMEOUT_MS);
        con.setRequestProperty("Authorization", "Bearer " + key);
        return con;
    }

    /**
     * Writes one multipart text field.
     * @param (OutputStream) out Body.
     * @param (String) boundary Multipart boundary.
     * @param (String) name Field name.
     * @param (String) value Field value.
     * @throws (IOException) On a write error.
     */
    private static void field(OutputStream out, String boundary, String name, String value) throws IOException
    {
        String s = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n";
        out.write(s.getBytes(StandardCharsets.UTF_8));
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
