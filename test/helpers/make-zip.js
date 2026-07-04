'use strict';
// Minimal ZIP writer for tests — enough to exercise lib/zip-read.js and the 3MF
// path in lib/thumbnail-extract.js. Supports STORE (0) and DEFLATE (8). CRCs are
// written as 0 (the reader ignores them).
const zlib = require('zlib');

/** entries: [{ name, data:Buffer|string, method?:0|8 }] → ZIP Buffer */
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    const method = e.method === 8 ? 8 : 0;
    const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(e.name, 'utf8');

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt32LE(0, 14);            // crc (ignored)
    lfh.writeUInt32LE(comp.length, 18);  // compressed size
    lfh.writeUInt32LE(raw.length, 22);   // uncompressed size
    lfh.writeUInt16LE(name.length, 26);
    lfh.writeUInt16LE(0, 28);            // extra len
    locals.push(lfh, name, comp);

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt32LE(0, 16);            // crc
    cdh.writeUInt32LE(comp.length, 20);
    cdh.writeUInt32LE(raw.length, 24);
    cdh.writeUInt16LE(name.length, 28);
    cdh.writeUInt32LE(offset, 42);       // local header offset
    centrals.push({ cdh, name });

    offset += lfh.length + name.length + comp.length;
  }
  const cdStart = offset;
  const cdBufs = [];
  for (const c of centrals) { cdBufs.push(c.cdh, c.name); }
  const cd = Buffer.concat(cdBufs);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdStart, 16);

  return Buffer.concat([...locals, cd, eocd]);
}

module.exports = { makeZip };
