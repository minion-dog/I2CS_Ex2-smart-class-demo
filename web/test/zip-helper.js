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
