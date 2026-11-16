// =====================================================================
//  xlsx.js - write and read simple Excel files, no library
// =====================================================================
// WHY by hand: an .xlsx file is just a zip of a few XML files. Writing one
// sheet of text and numbers needs ~150 lines, so we avoid a 1 MB library.
// Writing stores the files uncompressed (zip "STORE"); reading also
// understands compressed ("deflate") entries, because Moodle's export is
// compressed; the browser's DecompressionStream does the inflating.

const ZIP = Object.freeze({
    LOCAL_SIG: 0x04034b50,
    CENTRAL_SIG: 0x02014b50,
    END_SIG: 0x06054b50,
    VERSION: 20,
    FLAG_UTF8: 0x0800,
    STORE: 0,
    DEFLATE: 8
});

// ---------------------------------------------------------------------
//  WRITE
// ---------------------------------------------------------------------

/**
 * Builds an .xlsx file with one right-to-left sheet.
 * @param {string} sheetName - tab name (max 31 characters)
 * @param {(string|number)[][]} rows - first row is the header
 * @returns {Uint8Array} the file bytes
 */
export function writeXlsx(sheetName, rows)
{
    const name = xmlEscape(sheetName.slice(0, 31));
    const files = [
        ['[Content_Types].xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
            '</Types>'],
        ['_rels/.rels',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
            '</Relationships>'],
        ['xl/workbook.xml',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
            '<sheets><sheet name="' + name + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
        ['xl/_rels/workbook.xml.rels',
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
            '</Relationships>'],
        ['xl/worksheets/sheet1.xml', sheetXml(rows)]
    ];
    const enc = new TextEncoder();
    const entries = [];
    for (const f of files)
    {
        entries.push({ name: enc.encode(f[0]), data: enc.encode(f[1]) });
    }
    return zipStore(entries);
}

/**
 * Builds the worksheet XML (inline strings, so no shared-strings file is needed).
 * @param {(string|number)[][]} rows - cells
 * @returns {string} XML
 */
function sheetXml(rows)
{
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetData>';
    for (let r = 0; r < rows.length; r++)
    {
        xml += '<row r="' + (r + 1) + '">';
        for (let c = 0; c < rows[r].length; c++)
        {
            const ref = columnName(c) + (r + 1);
            const v = rows[r][c];
            if (typeof v === 'number' && Number.isFinite(v))
            {
                xml += '<c r="' + ref + '"><v>' + v + '</v></c>';
            }
            else
            {
                xml += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
                    xmlEscape(String(v === null || v === undefined ? '' : v)) + '</t></is></c>';
            }
        }
        xml += '</row>';
    }
    return xml + '</sheetData></worksheet>';
}

/**
 * Packs entries into a zip without compression.
 * @param {{name:Uint8Array, data:Uint8Array}[]} entries - files
 * @returns {Uint8Array} zip bytes
 */
function zipStore(entries)
{
    const parts = [];
    const central = [];
    let offset = 0;
    for (const e of entries)
    {
        const crc = crc32(e.data);
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, ZIP.LOCAL_SIG, true);
        local.setUint16(4, ZIP.VERSION, true);
        local.setUint16(6, ZIP.FLAG_UTF8, true);
        local.setUint16(8, ZIP.STORE, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, e.data.length, true);
        local.setUint32(22, e.data.length, true);
        local.setUint16(26, e.name.length, true);
        parts.push(new Uint8Array(local.buffer), e.name, e.data);
        const cen = new DataView(new ArrayBuffer(46));
        cen.setUint32(0, ZIP.CENTRAL_SIG, true);
        cen.setUint16(4, ZIP.VERSION, true);
        cen.setUint16(6, ZIP.VERSION, true);
        cen.setUint16(8, ZIP.FLAG_UTF8, true);
        cen.setUint16(10, ZIP.STORE, true);
        cen.setUint32(16, crc, true);
        cen.setUint32(20, e.data.length, true);
        cen.setUint32(24, e.data.length, true);
        cen.setUint16(28, e.name.length, true);
        cen.setUint32(42, offset, true);
        central.push(new Uint8Array(cen.buffer), e.name);
        offset += 30 + e.name.length + e.data.length;
    }
    let centralSize = 0;
    for (const c of central)
    {
        centralSize += c.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, ZIP.END_SIG, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return concat(parts.concat(central, [new Uint8Array(end.buffer)]));
}

// ---------------------------------------------------------------------
//  READ
// ---------------------------------------------------------------------

/**
 * Reads the first sheet of an .xlsx file as rows of strings.
 * @param {Uint8Array} bytes - the file
 * @returns {Promise<string[][]>} rows
 */
export async function readXlsx(bytes)
{
    const files = await unzip(bytes);
    const dec = new TextDecoder();
    const shared = [];
    if (files['xl/sharedStrings.xml'])
    {
        const sx = dec.decode(files['xl/sharedStrings.xml']);
        const siRe = /<si>([\s\S]*?)<\/si>/g;
        let m = siRe.exec(sx);
        while (m !== null)
        {
            shared.push(textOf(m[1]));
            m = siRe.exec(sx);
        }
    }
    let sheetPath = 'xl/worksheets/sheet1.xml';
    if (!files[sheetPath])
    {
        sheetPath = Object.keys(files).filter(isWorksheet).sort()[0];
    }
    if (!sheetPath)
    {
        throw new Error('no worksheet in the file');
    }
    const xml = dec.decode(files[sheetPath]);
    const rows = [];
    const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rm = rowRe.exec(xml);
    while (rm !== null)
    {
        const row = [];
        const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let cm = cellRe.exec(rm[1]);
        while (cm !== null)
        {
            const attrs = cm[1];
            const body = cm[2] || '';
            const refM = /\br="([A-Z]+)\d+"/.exec(attrs);
            const typeM = /\bt="(\w+)"/.exec(attrs);
            const col = refM ? columnIndex(refM[1]) : row.length;
            while (row.length < col)
            {
                row.push('');
            }
            const vM = /<v>([\s\S]*?)<\/v>/.exec(body);
            let value = '';
            const type = typeM ? typeM[1] : 'n';
            if (type === 's' && vM)
            {
                value = shared[Number(vM[1])] || '';
            }
            else if (type === 'inlineStr')
            {
                value = textOf(body);
            }
            else if (vM)
            {
                value = xmlUnescape(vM[1]);
            }
            row[col] = value;
            cm = cellRe.exec(rm[1]);
        }
        rows.push(row);
        rm = rowRe.exec(xml);
    }
    return rows;
}

/**
 * Lists a zip's files and their (inflated) contents.
 * @param {Uint8Array} bytes - zip file
 * @returns {Promise<Object<string, Uint8Array>>} name to content
 */
async function unzip(bytes)
{
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let i = bytes.length - 22; i >= 0; i--)
    {
        if (view.getUint32(i, true) === ZIP.END_SIG)
        {
            end = i;
            break;
        }
    }
    if (end < 0)
    {
        throw new Error('not a zip / xlsx file');
    }
    const count = view.getUint16(end + 10, true);
    let p = view.getUint32(end + 16, true);
    const dec = new TextDecoder();
    const out = {};
    for (let k = 0; k < count; k++)
    {
        if (view.getUint32(p, true) !== ZIP.CENTRAL_SIG)
        {
            throw new Error('broken zip directory');
        }
        const method = view.getUint16(p + 10, true);
        const compSize = view.getUint32(p + 20, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const localOff = view.getUint32(p + 42, true);
        const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
        const lNameLen = view.getUint16(localOff + 26, true);
        const lExtraLen = view.getUint16(localOff + 28, true);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const raw = bytes.subarray(start, start + compSize);
        if (method === ZIP.STORE)
        {
            out[name] = raw;
        }
        else if (method === ZIP.DEFLATE)
        {
            out[name] = await inflateRaw(raw);
        }
        p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
}

/**
 * Inflates raw deflate data with the built-in DecompressionStream.
 * @param {Uint8Array} data - compressed
 * @returns {Promise<Uint8Array>} plain bytes
 */
async function inflateRaw(data)
{
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ---------------------------------------------------------------------
//  LOW-LEVEL HELPERS
// ---------------------------------------------------------------------

/**
 * Returns the spreadsheet column name for a 0-based index (0 = A, 26 = AA).
 * @param {number} i - index
 * @returns {string} name
 */
function columnName(i)
{
    let s = '';
    let n = i + 1;
    while (n > 0)
    {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

/**
 * Returns the 0-based index of a column name.
 * @param {string} name - e.g. "AB"
 * @returns {number} index
 */
function columnIndex(name)
{
    let n = 0;
    for (const ch of name)
    {
        n = n * 26 + (ch.charCodeAt(0) - 64);
    }
    return n - 1;
}

/**
 * Tells whether a zip entry is a worksheet.
 * @param {string} name - entry path
 * @returns {boolean} true for xl/worksheets/*.xml
 */
function isWorksheet(name)
{
    return /^xl\/worksheets\/[^/]+\.xml$/.test(name);
}

/**
 * Joins all <t> texts inside an XML fragment.
 * @param {string} xml - fragment
 * @returns {string} text
 */
function textOf(xml)
{
    let s = '';
    const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m = re.exec(xml);
    while (m !== null)
    {
        s += xmlUnescape(m[1]);
        m = re.exec(xml);
    }
    return s;
}

/**
 * Escapes text for XML.
 * @param {string} s - text
 * @returns {string} escaped
 */
function xmlEscape(s)
{
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Undoes XML escaping.
 * @param {string} s - escaped
 * @returns {string} text
 */
function xmlUnescape(s)
{
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&#(?:x([0-9A-Fa-f]+)|(\d+));/g, numericEntity).replace(/&amp;/g, '&');
}

/**
 * Converts a numeric XML entity (hex &#x5D5; or decimal &#1489;) to its character.
 * @param {string} _all - whole match
 * @param {string|undefined} hex - hex digits
 * @param {string|undefined} dec - decimal digits
 * @returns {string} character
 */
function numericEntity(_all, hex, dec)
{
    if (hex !== undefined)
    {
        return String.fromCodePoint(parseInt(hex, 16));
    }
    return String.fromCodePoint(Number(dec));
}

/**
 * Concatenates byte arrays.
 * @param {Uint8Array[]} parts - pieces
 * @returns {Uint8Array} joined
 */
function concat(parts)
{
    let len = 0;
    for (const p of parts)
    {
        len += p.length;
    }
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts)
    {
        out.set(p, o);
        o += p.length;
    }
    return out;
}

let crcTable = null;

/**
 * Computes the CRC-32 checksum a zip entry needs.
 * @param {Uint8Array} data - bytes
 * @returns {number} unsigned CRC
 */
function crc32(data)
{
    if (crcTable === null)
    {
        crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++)
        {
            let c = n;
            for (let k = 0; k < 8; k++)
            {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            crcTable[n] = c >>> 0;
        }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++)
    {
        crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
