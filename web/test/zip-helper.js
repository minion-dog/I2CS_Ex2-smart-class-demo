// Test helper: a one-file zip, built with Node's own zlib (independent of xlsx.js).
import { deflateRawSync, crc32 } from 'node:zlib';

/**
 * Builds a zip with one deflated file.
 * @param {string} name - entry name
 * @param {string} text - entry content
 * @returns {Uint8Array} zip bytes
 */
export function zipForTest(name, text)
{
    const data = Buffer.from(text, 'utf8');
    const comp = deflateRawSync(data);
    const nameB = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameB.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(8, 10);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameB.length, 28); cen.writeUInt32LE(0, 42);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
    end.writeUInt32LE(46 + nameB.length, 12); end.writeUInt32LE(30 + nameB.length + comp.length, 16);
    return new Uint8Array(Buffer.concat([local, nameB, comp, cen, nameB, end]));
}

/**
 * Reads a stored (uncompressed) zip independently of xlsx.js and checks every CRC.
 * @param {Uint8Array} zip - zip bytes
 * @returns {Promise<Object<string, Uint8Array>>} name -> bytes
 */
export async function readZip(zip)
{
    const b = Buffer.from(zip);
    const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = b.readUInt16LE(end + 10);
    let p = b.readUInt32LE(end + 16);
    const out = {};
    for (let i = 0; i < count; i++)
    {
        const crc = b.readUInt32LE(p + 16);
        const size = b.readUInt32LE(p + 20);
        const nameLen = b.readUInt16LE(p + 28);
        const extra = b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
        const offset = b.readUInt32LE(p + 42);
        const name = b.subarray(p + 46, p + 46 + nameLen).toString('utf8');
        const start = offset + 30 + b.readUInt16LE(offset + 26) + b.readUInt16LE(offset + 28);
        const data = b.subarray(start, start + size);
        if (crc32(data) !== crc)
        {
            throw new Error('bad CRC in ' + name);
        }
        out[name] = new Uint8Array(data);
        p += 46 + nameLen + extra;
    }
    return out;
}
