package il.ac.ariel.smartclass.core;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.junit.Test;

/**
 * The pure-Java logic of the Android app: the same rules as the website's
 * web/js/core files, so the two clients always agree (same TC names).
 */
public class CoreTest
{
    /** A 25x25 test matrix with a simple pattern. */
    private static boolean[] testMatrix(int size)
    {
        boolean[] dark = new boolean[size * size];
        for (int i = 0; i < dark.length; i++)
        {
            dark[i] = (i * 7 + i / size) % 3 == 0;
        }
        return dark;
    }

    // ==========================================
    //          FLICKER QR (can't photograph)
    // ==========================================

    /** Builds the plan for the test matrix. */
    private static FlickerSchedule testPlan(int size, int seed)
    {
        return new FlickerSchedule(testMatrix(size), size, seed);
    }

    /** Checks that any single frame is random: about half of each kind of square is black (TC-QR-2). */
    @Test
    public void singleFrameLooksRandom()
    {
        FlickerSchedule plan = testPlan(25, 7);
        boolean[] f = plan.frame(123);
        int darkBlack = 0;
        int darkN = 0;
        int lightBlack = 0;
        int lightN = 0;
        for (int i = 0; i < f.length; i++)
        {
            if (plan.isSlow(i))
            {
                darkN++;
                if (f[i])
                {
                    darkBlack++;
                }
            }
            else
            {
                lightN++;
                if (f[i])
                {
                    lightBlack++;
                }
            }
        }
        assertTrue("dark " + darkBlack + "/" + darkN, Math.abs((double) darkBlack / darkN - 0.5) < 0.15);
        assertTrue("light " + lightBlack + "/" + lightN, Math.abs((double) lightBlack / lightN - 0.5) < 0.15);
    }

    /** Checks that a merged photo is plain grey: dark and light squares average the same (TC-QR-4). */
    @Test
    public void mergedPhotoIsPlainGrey()
    {
        FlickerSchedule plan = testPlan(25, 12345);
        long darkSum = 0;
        long darkN = 0;
        long lightSum = 0;
        long lightN = 0;
        for (int p = 0; p < 800; p++)
        {
            boolean[] f = plan.frame(p);
            for (int i = 0; i < f.length; i++)
            {
                int v = 0;
                if (f[i])
                {
                    v = 1;
                }
                if (plan.isSlow(i))
                {
                    darkSum += v;
                    darkN++;
                }
                else
                {
                    lightSum += v;
                    lightN++;
                }
            }
        }
        assertEquals(0.5, (double) darkSum / darkN, 0.02);
        assertEquals(0.5, (double) lightSum / lightN, 0.02);
    }

    /** Checks the change rates: dark squares ~1/HOLD, light squares ~1/2 (TC-QR-12). */
    @Test
    public void darkChangesSlowlyLightChangesFast()
    {
        FlickerSchedule plan = testPlan(25, 99);
        boolean[] prev = plan.frame(0);
        int[] changes = new int[prev.length];
        int phases = 400;
        for (int p = 1; p < phases; p++)
        {
            boolean[] f = plan.frame(p);
            for (int i = 0; i < f.length; i++)
            {
                if (f[i] != prev[i])
                {
                    changes[i]++;
                }
            }
            prev = f;
        }
        double slow = 0;
        double fast = 0;
        int ns = 0;
        int nf = 0;
        for (int i = 0; i < changes.length; i++)
        {
            if (plan.isSlow(i))
            {
                slow += changes[i];
                ns++;
            }
            else
            {
                fast += changes[i];
                nf++;
            }
        }
        assertEquals(0.5 / FlickerSchedule.HOLD, slow / ns / (phases - 1), 0.02);
        assertEquals(0.5, fast / nf / (phases - 1), 0.03);
    }

    /** Draws a frame as a grey image, SCALE pixels per square. */
    private static byte[] draw(FlickerSchedule plan, long phase, int scale, int dx, int dy)
    {
        int n = plan.total();
        int side = n * scale;
        boolean[] f = plan.frame(phase);
        byte[] img = new byte[side * side];
        for (int y = 0; y < side; y++)
        {
            for (int x = 0; x < side; x++)
            {
                int sx = Math.min(side - 1, Math.max(0, x + dx));
                int sy = Math.min(side - 1, Math.max(0, y + dy));
                if (!f[(sy / scale) * n + sx / scale])
                {
                    img[y * side + x] = (byte) 255;
                }
            }
        }
        return img;
    }

    /**
     * Checks that the change map shows the QR with hand shake: at least 85 % of the square
     * centres are right in ONE ~0.8 s window. The QR's error correction (30 %) and the
     * scanner's sliding retries do the rest; web/test/noisyqr.test.js decodes it end to end
     * (TC-QR-5, TC-QR-6).
     */
    @Test
    public void changeMapRecoversTheCodeEvenWithShake()
    {
        int scale = 8;
        FlickerSchedule plan = testPlan(25, 4242);
        int side = plan.total() * scale;
        ChangeMap map = new ChangeMap(side * side, FlickerSchedule.FRAMES);
        int[] shakeX = {0, 1, 1, 2, 1, 1, 0, 0, -1, 0, 1, 1, 2, 2, 1, 0, 0, 1, 0, 0, -1, -1, 0, 0, 1};
        for (int k = 0; k < FlickerSchedule.FRAMES; k++)
        {
            map.push(draw(plan, 1000 + k, scale, shakeX[k % shakeX.length], 0));
        }
        int[] bw = map.image(side);
        int right = 0;
        int all = 0;
        int n = plan.total();
        for (int r = 0; r < n; r++)
        {
            for (int c = 0; c < n; c++)
            {
                int centre = bw[(r * scale + scale / 2) * side + c * scale + scale / 2];
                boolean black = centre == 0;
                if (black == plan.isSlow(r * n + c))
                {
                    right++;
                }
                all++;
            }
        }
        assertTrue("right " + right + "/" + all, right >= all * 85 / 100);
    }

    /**
     * Checks the back-of-the-class case: the code covers a quarter of a bigger, still room.
     * The box must be found around it, and inside the box the squares must still come out
     * right (TC-QR-9, same as web/test/noisyqr.test.js).
     */
    @Test
    public void smallCodeInABigRoomIsFound()
    {
        int scale = 4;
        FlickerSchedule plan = testPlan(25, 77);
        int n = plan.total();
        int code = n * scale;
        int side = code * 4;
        int ox = side / 2 - code / 2 + 13;
        int oy = side / 2 - code / 2 - 9;
        ChangeMap map = new ChangeMap(side * side, FlickerSchedule.FRAMES);
        for (int k = 0; k < FlickerSchedule.FRAMES; k++)
        {
            byte[] small = draw(plan, 2000 + k, scale, 0, 0);
            byte[] room = new byte[side * side];
            java.util.Arrays.fill(room, (byte) 60);
            for (int y = 0; y < code; y++)
            {
                System.arraycopy(small, y * code, room, (oy + y) * side + ox, code);
            }
            map.push(room);
        }
        int[] box = map.activeBox();
        assertNotNull(box);
        assertEquals(ox + code / 2.0, (box[0] + box[2]) / 2.0, 6);
        assertEquals(oy + code / 2.0, (box[1] + box[3]) / 2.0, 6);
        int[] bw = map.image(side);
        int right = 0;
        for (int r = 0; r < n; r++)
        {
            for (int c = 0; c < n; c++)
            {
                int centre = bw[(oy + r * scale + scale / 2) * side + ox + c * scale + scale / 2];
                if ((centre == 0) == plan.isSlow(r * n + c))
                {
                    right++;
                }
            }
        }
        assertTrue("right " + right + "/" + n * n, right >= n * n * 85 / 100);
    }

    /** Checks that a frozen picture (forwarded photo) gives no code at all (TC-QR-8). */
    @Test
    public void frozenPictureGivesNothing()
    {
        int scale = 8;
        FlickerSchedule plan = testPlan(25, 1);
        int side = plan.total() * scale;
        ChangeMap map = new ChangeMap(side * side, FlickerSchedule.FRAMES);
        byte[] still = draw(plan, 5, scale, 0, 0);
        for (int k = 0; k < FlickerSchedule.FRAMES; k++)
        {
            map.push(still);
        }
        assertFalse(map.hasSignal());
    }

    /** Checks that the map keeps only the newest frames (TC-QR-13). */
    @Test
    public void changeMapCountsFrames()
    {
        ChangeMap m = new ChangeMap(4, 3);
        for (int k = 0; k < 5; k++)
        {
            m.push(new byte[] {(byte) (k * 40), 0, 0, 0});
        }
        assertEquals(3, m.count());
    }

    // ==========================================
    //                PAYLOAD
    // ==========================================

    /** Checks the QR text round trip and that foreign codes are rejected (TC-PL-1, TC-PL-2). */
    @Test
    public void payloadRoundTripAndRejection()
    {
        String sid = Payload.newSessionId();
        String text = Payload.encode(sid, "TOK123");
        assertTrue(text, text.matches("[0-9A-Z/]+"));
        Payload p = Payload.decode(text);
        assertEquals(sid, p.sessionId());
        assertEquals("TOK123", p.token());
        assertNull(Payload.decode("https://example.com"));
        assertNull(Payload.decode("SC2/ONLYTWO"));
        assertNull(Payload.decode("SC2/A/B/C"));
        assertNotNull(Payload.decode("SC2/smwltc5it/DEF"));      // a lecture from an older version
        assertNull(Payload.decode("SC2/a-b/DEF"));
        assertNull(Payload.decode("SC1|A|B"));
    }

    /** Checks that tokens are random, 14 capitals/digits; lecture ids 10 (TC-PL-3). */
    @Test
    public void tokensAreRandomAndUrlSafe()
    {
        String a = Payload.newToken();
        String b = Payload.newToken();
        assertNotEquals(a, b);
        assertTrue(a, a.matches("[0-9A-HJKMNP-TV-Z]{14}"));
        assertTrue(Payload.newSessionId().matches("[0-9A-HJKMNP-TV-Z]{10}"));
    }

    /** Checks that the current and the previous code are accepted (TC-PL-4). */
    @Test
    public void currentAndPreviousCodesAccepted()
    {
        long t0 = 1_000_000L;
        assertTrue(Payload.isCurrentCode(t0, t0 + 5_000));
        assertTrue(Payload.isCurrentCode(t0, t0 + 2 * Payload.ROTATE_MS));
        assertFalse(Payload.isCurrentCode(t0, t0 + 2 * Payload.ROTATE_MS + Payload.NETWORK_SLACK_MS + 1));
    }

    // ==========================================
    //               CLASS LIST
    // ==========================================

    private static final String MOODLE_CSV = "﻿\"שם פרטי\",\"שם משפחה\",\"מספר זיהוי\",\"דוא\"\"ל\",קבוצות  \n"
        + "גיא,אביב,111111111,Guy.Test@Gmail.com,3  \n"
        + "\"דניאל שלמה\",אהרן,222222222,dan@gmail.com,3  \n"
        + "בועז,\"בן משה\",333333333,lecturer@ariel.ac.il,  \n"
        + "\n";

    /** Checks the CSV parser on the Moodle format (TC-CL-1). */
    @Test
    public void csvParserHandlesMoodleFile()
    {
        List<List<String>> rows = ClassList.parseCsv(MOODLE_CSV);
        assertEquals(4, rows.size());
        assertEquals(Arrays.asList("שם פרטי", "שם משפחה", "מספר זיהוי", "דוא\"ל", "קבוצות"), rows.get(0));
        assertEquals("דניאל שלמה", rows.get(2).get(0));
    }

    /** Checks lower-case emails and staff detection (TC-CL-2). */
    @Test
    public void rosterEntriesFromRows()
    {
        List<Student> roster = ClassList.fromRows(ClassList.parseCsv(MOODLE_CSV));
        assertEquals(3, roster.size());
        assertEquals("guy.test@gmail.com", roster.get(0).email());
        assertFalse(roster.get(0).staff());
        assertTrue(roster.get(2).staff());
    }

    // ==========================================
    //                 SHEET
    // ==========================================

    /** Checks one row per student and one column per session (TC-SH-1). */
    @Test
    public void attendanceSheetLayout()
    {
        List<Student> roster = new ArrayList<Student>();
        roster.add(new Student("א", "א", "1", "a@x.com", "3"));
        roster.add(new Student("ב", "ב", "2", "b@x.com", "3"));
        roster.add(new Student("מ", "מ", "3", "t@x.com", ""));
        List<SessionInfo> sessions = new ArrayList<SessionInfo>();
        sessions.add(new SessionInfo("s2", "שיעור 2", 2));
        sessions.add(new SessionInfo("s1", "שיעור 1", 1));
        Map<String, Map<String, String>> att = new HashMap<String, Map<String, String>>();
        att.put("s1", new HashMap<String, String>());
        att.get("s1").put("a@x.com", AttendanceSheet.PRESENT);
        att.put("s2", new HashMap<String, String>());
        att.get("s2").put("a@x.com", AttendanceSheet.ZOOM);
        att.get("s2").put("b@x.com", AttendanceSheet.MANUAL);
        AttendanceSheet sheet = AttendanceSheet.build(roster, sessions, att);
        List<String> h = sheet.header();
        assertEquals(Arrays.asList("שיעור 1", "שיעור 2", "סה\"כ"), h.subList(h.size() - 3, h.size()));
        assertEquals(2, sheet.rows().size());
        List<Object> r0 = sheet.rows().get(0);
        assertEquals(Arrays.asList((Object) "V", "Z", 2), r0.subList(r0.size() - 3, r0.size()));
        List<Object> r1 = sheet.rows().get(1);
        assertEquals(Arrays.asList((Object) "", "M", 1), r1.subList(r1.size() - 3, r1.size()));
    }

    // ==========================================
    //                 XLSX
    // ==========================================

    /** Checks that an XLSX file written here reads back the same (TC-XL-1). */
    @Test
    public void xlsxRoundTrip() throws Exception
    {
        List<List<Object>> rows = new ArrayList<List<Object>>();
        rows.add(Arrays.asList((Object) "שם", "ציון"));
        rows.add(Arrays.asList((Object) "מאור <&>", 95));
        byte[] bytes = Xlsx.write("נוכחות", rows);
        assertArrayEquals(new byte[] {0x50, 0x4B}, Arrays.copyOf(bytes, 2));
        List<List<String>> back = Xlsx.read(new ByteArrayInputStream(bytes));
        assertEquals(Arrays.asList("שם", "ציון"), back.get(0));
        assertEquals(Arrays.asList("מאור <&>", "95"), back.get(1));
    }

    /** Checks that numeric XML entities (some Excel writers use them for Hebrew) are decoded (TC-XL-2). */
    @Test
    public void xlsxReadsNumericEntities() throws Exception
    {
        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        java.util.zip.ZipOutputStream zip = new java.util.zip.ZipOutputStream(bytes);
        zip.putNextEntry(new java.util.zip.ZipEntry("xl/worksheets/sheet1.xml"));
        String xml = "<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>&#1489;&#x05D5;&#1506;&#1494;</t></is></c>"
            + "<c r=\"C1\"><v>7</v></c></row></sheetData></worksheet>";
        zip.write(xml.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        zip.closeEntry();
        zip.close();
        List<List<String>> rows = Xlsx.read(new ByteArrayInputStream(bytes.toByteArray()));
        assertEquals(Arrays.asList("בועז", "", "7"), rows.get(0));
    }

    // ==========================================
    //                PROMPTS
    // ==========================================

    /** Checks GitHub URL parsing (TC-AI-2). */
    @Test
    public void githubUrlsAreParsed()
    {
        assertArrayEquals(new String[] {"NoamTheGolem", "Intro2SE_Ex1"}, Prompts.githubParts("https://github.com/NoamTheGolem/Intro2SE_Ex1"));
        assertArrayEquals(new String[] {"a", "b"}, Prompts.githubParts("https://github.com/a/b.git"));
        assertNull(Prompts.githubParts("https://gitlab.com/a/b"));
    }

    /** Checks that the review summary line is extracted (TC-AI-6). */
    @Test
    public void reviewSummaryLine()
    {
        assertEquals("A stack with tests.", Prompts.reviewSummaryLine("...\nSUMMARY: A stack with tests."));
        assertEquals("no line", Prompts.reviewSummaryLine("no line"));
    }

    /** Checks the face step: tapping, the next step, claim ids (TC-FACE-J1, same as web TC-FACE-5/7). */
    @Test
    public void facesTapAndSteps()
    {
        java.util.List<Faces.Box> boxes = java.util.Arrays.asList(
                new Faces.Box(1, 0.10, 0.10, 0.02, 0.02), new Faces.Box(2, 0.13, 0.10, 0.02, 0.02));
        assertEquals(0, Faces.hitTest(boxes, 0.11, 0.11));
        assertEquals(1, Faces.hitTest(boxes, 0.141, 0.11));
        assertEquals(-1, Faces.hitTest(boxes, 0.6, 0.6));
        assertEquals(Faces.Step.SCAN, Faces.myStep(false, null, null, 2L));
        assertEquals(Faces.Step.NO_PHOTO, Faces.myStep(true, null, null, null));
        assertEquals(Faces.Step.PICK, Faces.myStep(true, 3L, 1L, 2L));
        assertEquals(Faces.Step.DONE, Faces.myStep(true, 3L, 2L, 2L));
        assertEquals(Faces.Step.TOLD, Faces.myStep(true, (long) Faces.NOT_FOUND, 2L, 2L));
        assertEquals("2_7", Faces.claimId(2, 7));
        java.util.Map<String, Object> m = new java.util.HashMap<String, Object>();
        m.put("id", 4L);
        m.put("x", 0.1);
        m.put("y", 0.2);
        m.put("w", 0.03);
        m.put("h", 0.04);
        assertEquals(4, Faces.fromMaps(java.util.Arrays.asList(m, "junk")).get(0).id);
    }

    /** Checks quiz points, the timer and which phases phones show (TC-QZ-J1, same as web TC-QZ-1/5). */
    @Test
    public void quizPointsAndTimer()
    {
        assertEquals(1000, Quiz.points(true, 0, 20000));
        assertEquals(750, Quiz.points(true, 10000, 20000));
        assertEquals(500, Quiz.points(true, 20000, 20000));
        assertEquals(0, Quiz.points(true, 20000 + Quiz.GRACE_MS + 1, 20000));
        assertEquals(0, Quiz.points(false, 0, 20000));
        assertEquals(15, Quiz.secondsLeft(0, 20, 5500));
        assertEquals(0, Quiz.secondsLeft(0, 20, 25000));
        assertEquals(1000, Quiz.points(true, 3_600_000, 0));
        assertEquals("", Quiz.timerLabel(0, 0));
        assertEquals("4:59", Quiz.timerLabel(300, 299));
        assertEquals("45", Quiz.timerLabel(20, 45));
        assertTrue(Quiz.isLive("question"));
        assertFalse(Quiz.isLive("draft"));
    }

    /** Checks the scanning guide: hints and the box on a turned, "fill center" preview (TC-GD-J1). */
    @Test
    public void guideHintsAndPlacement()
    {
        assertEquals("search", Guide.hint(false, 0, 0));
        assertEquals("closer", Guide.hint(true, 50, 5));
        assertEquals("found", Guide.hint(true, 300, 1));
        assertEquals("steady", Guide.hint(true, 300, 2));
        // a 640x480 image, phone held upright (turned 90): shown as 480x640 on a 480x640 view
        double[] r = Guide.toView(new double[] {0, 0, 100, 50}, 640, 480, 90, 480, 640);
        assertEquals((480 - 50) / 480.0, r[0], 1e-9);
        assertEquals(0, r[1], 1e-9);
        assertEquals(50 / 480.0, r[2], 1e-9);
        assertEquals(100 / 640.0, r[3], 1e-9);
        // not turned, a square view crops the sides ("fill center")
        double[] c = Guide.toView(new double[] {80, 0, 560, 480}, 640, 480, 0, 480, 480);
        assertEquals(0, c[0], 1e-9);
        assertEquals(1, c[2], 1e-9);
    }

    /** Checks emoji reactions: clean, toggle, count (TC-RX-J1). */
    @Test
    public void reactionsCleanToggleCount()
    {
        assertEquals(Reactions.of("like", "wow"), Reactions.clean(Reactions.of("wow", "like", "like", "bomb")));
        assertEquals(Reactions.of("like", "think"), Reactions.toggle(Reactions.of("like"), "think"));
        assertEquals(Reactions.of("think"), Reactions.toggle(Reactions.of("like", "think"), "like"));
        java.util.List<java.util.List<String>> recs = new java.util.ArrayList<java.util.List<String>>();
        recs.add(Reactions.of("like", "haha"));
        recs.add(Reactions.of("like"));
        recs.add(Reactions.of("like", "like", "nope"));
        java.util.Map<String, Integer> c = Reactions.count(recs);
        assertEquals(Integer.valueOf(3), c.get("like"));
        assertEquals(Integer.valueOf(1), c.get("haha"));
        assertNull(c.get("wow"));
        assertEquals("c1_u9", Reactions.id("c1", "u9"));
    }
}
