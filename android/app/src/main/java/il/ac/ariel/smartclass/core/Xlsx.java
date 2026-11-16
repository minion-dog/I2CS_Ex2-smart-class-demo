package il.ac.ariel.smartclass.core;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * Writes and reads simple Excel files with no library (same idea as web/js/core/xlsx.js):
 * an .xlsx file is a zip of a few XML files, and Java's java.util.zip does the zipping.
 * Writing makes one right-to-left sheet of text and numbers; reading returns the first
 * sheet as strings (enough for the Moodle participants export).
 */
public final class Xlsx
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** XML header. */
    private static final String XML_HEAD = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

    /** Spreadsheet namespace. */
    private static final String MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

    /** Package relationship namespace. */
    private static final String REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

    /** Office relationship types. */
    private static final String REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

    /** Max sheet-name length in Excel. */
    private static final int MAX_SHEET_NAME = 31;

    /** A numeric character reference: &amp;#x5D5; (hex) or &amp;#1489; (decimal). */
    private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(?:x([0-9A-Fa-f]+)|([0-9]+));");

    /** Not instantiable. */
    private Xlsx()
    {
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Builds an .xlsx file with one right-to-left sheet.
     * @param (String) sheetName Tab name.
     * @param (List&lt;List&lt;Object&gt;&gt;) rows Cells; Numbers are written as numbers, the rest as text.
     * @return (byte[]) The file.
     * @throws (IOException) Never in practice (in-memory zip).
     */
    public static byte[] write(String sheetName, List<List<Object>> rows) throws IOException
    {
        String name = escape(sheetName.substring(0, Math.min(MAX_SHEET_NAME, sheetName.length())));
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        ZipOutputStream zip = new ZipOutputStream(bytes);
        try
        {
            put(zip, "[Content_Types].xml", XML_HEAD
                + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                + "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                + "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>"
                + "<Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
                + "</Types>");
            put(zip, "_rels/.rels", XML_HEAD + "<Relationships xmlns=\"" + REL_NS + "\">"
                + "<Relationship Id=\"rId1\" Type=\"" + REL_TYPE + "officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>");
            put(zip, "xl/workbook.xml", XML_HEAD + "<workbook xmlns=\"" + MAIN_NS + "\" xmlns:r=\"" + REL_TYPE.substring(0, REL_TYPE.length() - 1) + "\">"
                + "<sheets><sheet name=\"" + name + "\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>");
            put(zip, "xl/_rels/workbook.xml.rels", XML_HEAD + "<Relationships xmlns=\"" + REL_NS + "\">"
                + "<Relationship Id=\"rId1\" Type=\"" + REL_TYPE + "worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>");
            put(zip, "xl/worksheets/sheet1.xml", sheetXml(rows));
        }
        finally
        {
            zip.close();
        }
        return bytes.toByteArray();
    }

    /**
     * Reads the first sheet of an .xlsx file as rows of strings.
     * @param (InputStream) in The file (closed by the caller).
     * @return (List&lt;List&lt;String&gt;&gt;) Rows.
     * @throws (IOException) When the file is not a readable xlsx.
     */
    public static List<List<String>> read(InputStream in) throws IOException
    {
        Map<String, String> files = new HashMap<String, String>();
        ZipInputStream zip = new ZipInputStream(in);
        ZipEntry e = zip.getNextEntry();
        while (e != null)
        {
            String n = e.getName();
            if (n.equals("xl/sharedStrings.xml") || n.startsWith("xl/worksheets/"))
            {
                files.put(n, new String(readAll(zip), StandardCharsets.UTF_8));
            }
            e = zip.getNextEntry();
        }
        List<String> shared = new ArrayList<String>();
        String sx = files.get("xl/sharedStrings.xml");
        if (sx != null)
        {
            Matcher m = Pattern.compile("<si>([\\s\\S]*?)</si>").matcher(sx);
            while (m.find())
            {
                shared.add(textOf(m.group(1)));
            }
        }
        String xml = files.get("xl/worksheets/sheet1.xml");
        if (xml == null)
        {
            throw new IOException("no worksheet in the file");
        }
        return parseSheet(xml, shared);
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * Builds the worksheet XML with inline strings.
     * @param (List&lt;List&lt;Object&gt;&gt;) rows Cells.
     * @return (String) XML.
     */
    private static String sheetXml(List<List<Object>> rows)
    {
        StringBuilder xml = new StringBuilder(XML_HEAD);
        xml.append("<worksheet xmlns=\"").append(MAIN_NS).append("\">");
        xml.append("<sheetViews><sheetView rightToLeft=\"1\" workbookViewId=\"0\"/></sheetViews><sheetData>");
        for (int r = 0; r < rows.size(); r++)
        {
            xml.append("<row r=\"").append(r + 1).append("\">");
            List<Object> row = rows.get(r);
            for (int c = 0; c < row.size(); c++)
            {
                String ref = columnName(c) + (r + 1);
                Object v = row.get(c);
                if (v instanceof Number)
                {
                    xml.append("<c r=\"").append(ref).append("\"><v>").append(v).append("</v></c>");
                }
                else
                {
                    String s = "";
                    if (v != null)
                    {
                        s = v.toString();
                    }
                    xml.append("<c r=\"").append(ref).append("\" t=\"inlineStr\"><is><t xml:space=\"preserve\">")
                        .append(escape(s)).append("</t></is></c>");
                }
            }
            xml.append("</row>");
        }
        return xml.append("</sheetData></worksheet>").toString();
    }

    /**
     * Parses the rows of a worksheet.
     * @param (String) xml Worksheet XML.
     * @param (List&lt;String&gt;) shared Shared strings.
     * @return (List&lt;List&lt;String&gt;&gt;) Rows.
     */
    private static List<List<String>> parseSheet(String xml, List<String> shared)
    {
        List<List<String>> rows = new ArrayList<List<String>>();
        Matcher rm = Pattern.compile("<row\\b[^>]*>([\\s\\S]*?)</row>").matcher(xml);
        Pattern cellRe = Pattern.compile("<c\\b([^>]*?)(?:/>|>([\\s\\S]*?)</c>)");
        Pattern refRe = Pattern.compile("\\br=\"([A-Z]+)\\d+\"");
        Pattern typeRe = Pattern.compile("\\bt=\"(\\w+)\"");
        Pattern valueRe = Pattern.compile("<v>([\\s\\S]*?)</v>");
        while (rm.find())
        {
            List<String> row = new ArrayList<String>();
            Matcher cm = cellRe.matcher(rm.group(1));
            while (cm.find())
            {
                String attrs = cm.group(1);
                String body = cm.group(2);
                if (body == null)
                {
                    body = "";
                }
                Matcher ref = refRe.matcher(attrs);
                int col = row.size();
                if (ref.find())
                {
                    col = columnIndex(ref.group(1));
                }
                while (row.size() < col)
                {
                    row.add("");
                }
                Matcher type = typeRe.matcher(attrs);
                String t = "n";
                if (type.find())
                {
                    t = type.group(1);
                }
                Matcher v = valueRe.matcher(body);
                String value = "";
                if (t.equals("s") && v.find())
                {
                    int k = Integer.parseInt(v.group(1).trim());
                    if (k < shared.size())
                    {
                        value = shared.get(k);
                    }
                }
                else if (t.equals("inlineStr"))
                {
                    value = textOf(body);
                }
                else if (v.find())
                {
                    value = unescape(v.group(1));
                }
                if (col < row.size())
                {
                    row.set(col, value);
                }
                else
                {
                    row.add(value);
                }
            }
            rows.add(row);
        }
        return rows;
    }

    /**
     * Adds one text file to the zip.
     * @param (ZipOutputStream) zip Target.
     * @param (String) name Entry name.
     * @param (String) content Text.
     * @throws (IOException) On a write error.
     */
    private static void put(ZipOutputStream zip, String name, String content) throws IOException
    {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    /**
     * Reads the current zip entry fully.
     * @param (InputStream) in The zip stream.
     * @return (byte[]) Entry bytes.
     * @throws (IOException) On a read error.
     */
    private static byte[] readAll(InputStream in) throws IOException
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

    /**
     * Joins the &lt;t&gt; texts of a fragment.
     * @param (String) xml Fragment.
     * @return (String) Text.
     */
    private static String textOf(String xml)
    {
        StringBuilder s = new StringBuilder();
        Matcher m = Pattern.compile("<t\\b[^>]*>([\\s\\S]*?)</t>").matcher(xml);
        while (m.find())
        {
            s.append(unescape(m.group(1)));
        }
        return s.toString();
    }

    /**
     * Returns the column name of a 0-based index (0 = A, 26 = AA).
     * @param (int) i Index.
     * @return (String) Name.
     */
    private static String columnName(int i)
    {
        StringBuilder s = new StringBuilder();
        int n = i + 1;
        while (n > 0)
        {
            int rem = (n - 1) % 26;
            s.insert(0, (char) ('A' + rem));
            n = (n - 1) / 26;
        }
        return s.toString();
    }

    /**
     * Returns the 0-based index of a column name.
     * @param (String) name E.g. "AB".
     * @return (int) Index.
     */
    private static int columnIndex(String name)
    {
        int n = 0;
        for (int i = 0; i < name.length(); i++)
        {
            n = n * 26 + (name.charAt(i) - 'A' + 1);
        }
        return n - 1;
    }

    /**
     * Escapes text for XML.
     * @param (String) s Text.
     * @return (String) Escaped.
     */
    private static String escape(String s)
    {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    /**
     * Undoes XML escaping.
     * @param (String) s Escaped.
     * @return (String) Text.
     */
    private static String unescape(String s)
    {
        Matcher m = NUMERIC_ENTITY.matcher(s);
        StringBuilder out = new StringBuilder();
        while (m.find())
        {
            int code;
            if (m.group(1) != null)
            {
                code = Integer.parseInt(m.group(1), 16);
            }
            else
            {
                code = Integer.parseInt(m.group(2));
            }
            m.appendReplacement(out, Matcher.quoteReplacement(new String(Character.toChars(code))));
        }
        m.appendTail(out);
        return out.toString().replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
            .replace("&apos;", "'").replace("&amp;", "&");
    }
}
