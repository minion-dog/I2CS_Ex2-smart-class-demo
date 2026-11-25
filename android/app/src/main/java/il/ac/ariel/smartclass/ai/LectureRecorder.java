package il.ac.ariel.smartclass.ai;

import android.content.Context;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;

import java.io.File;
import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import il.ac.ariel.smartclass.data.Repo;

/**
 * Records the lecture in 60-second pieces and transcribes each piece (same idea as
 * web/js/ui/recorder.js). WHY pieces: one 2-hour file at the end is slow and one failure
 * would lose everything; with pieces, students see the transcript grow during the lecture.
 */
public final class LectureRecorder
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Length of one piece. */
    private static final long PIECE_MS = 60000;

    /** Pieces smaller than this are silence or a too-short tail. */
    private static final long MIN_BYTES = 2000;

    /**
     * Receives progress messages.
     */
    public interface Status
    {
        /**
         * Called on the main thread.
         * @param (String) text Message.
         */
        void onStatus(String text);
    }

    /** Context for files and the key. */
    private final Context context;

    /** The lecture. */
    private final String sid;

    /** Progress callback. */
    private final Status status;

    /** Main-thread handler (timer and callbacks). */
    private final Handler main = new Handler(Looper.getMainLooper());

    /** Network thread. */
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    /** The current recorder. */
    private MediaRecorder recorder;

    /** The current piece's file. */
    private File current;

    /** True between start() and stop(). */
    private boolean active;

    /**
     * Creates a recorder for one lecture.
     * @param (Context) context Context.
     * @param (String) sid Session id.
     * @param (Status) status Progress callback.
     */
    public LectureRecorder(Context context, String sid, Status status)
    {
        this.context = context.getApplicationContext();
        this.sid = sid;
        this.status = status;
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Starts recording (the RECORD_AUDIO permission must already be granted).
     * @throws (IOException) When the microphone cannot be opened.
     */
    public void start() throws IOException
    {
        active = true;
        startPiece();
    }

    /** Stops; the last piece is still sent. */
    public void stop()
    {
        active = false;
        main.removeCallbacksAndMessages(null);
        finishPiece();
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Starts one piece and schedules its end.
     * @throws (IOException) When the microphone cannot be opened.
     */
    private void startPiece() throws IOException
    {
        current = new File(context.getCacheDir(), "piece-" + System.currentTimeMillis() + ".m4a");
        recorder = new MediaRecorder();
        recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        recorder.setAudioSamplingRate(16000);
        recorder.setAudioEncodingBitRate(32000);
        recorder.setOutputFile(current.getAbsolutePath());
        recorder.prepare();
        recorder.start();
        main.postDelayed(new Runnable()
        {
            @Override
            public void run()
            {
                finishPiece();
                if (active)
                {
                    try
                    {
                        startPiece();
                    }
                    catch (IOException e)
                    {
                        status.onStatus(e.getMessage());
                    }
                }
            }
        }, PIECE_MS);
    }

    /** Stops the current piece and sends it in the background. */
    private void finishPiece()
    {
        if (recorder == null)
        {
            return;
        }
        try
        {
            recorder.stop();
        }
        catch (RuntimeException e)
        {
            // stop() throws when nothing was recorded; the piece is skipped below
        }
        recorder.release();
        recorder = null;
        final File piece = current;
        final long index = System.currentTimeMillis();
        worker.execute(new Runnable()
        {
            @Override
            public void run()
            {
                send(piece, index);
            }
        });
    }

    /**
     * Transcribes one piece and stores its text (background thread).
     * @param (File) piece The audio file.
     * @param (long) index Piece number.
     */
    private void send(File piece, long index)
    {
        if (piece == null || piece.length() < MIN_BYTES)
        {
            return;
        }
        try
        {
            post("…");
            String text = Ai.transcribe(context, piece);
            if (!text.isEmpty())
            {
                Repo.get().addTranscript(sid, index, text);
            }
            post("✓");
        }
        catch (IOException e)
        {
            post(e.getMessage());
        }
        finally
        {
            piece.delete();
        }
    }

    /**
     * Sends a status message to the main thread.
     * @param (String) text Message.
     */
    private void post(final String text)
    {
        main.post(new Runnable()
        {
            @Override
            public void run()
            {
                status.onStatus(text);
            }
        });
    }
}
