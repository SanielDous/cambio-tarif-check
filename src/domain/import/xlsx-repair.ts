/**
 * The portal's XLSX writer omits the cell and row references (`r="A1"`), which are optional in
 * the file format but required by read-excel-file. This module adds them: it unpacks the
 * workbook, numbers the rows and cells of every worksheet that has none, and repacks everything
 * uncompressed. Workbooks that already carry references are returned untouched.
 */

import { ImportError } from "./fields";

const MAX_INFLATED_BYTES = 100 * 1024 * 1024;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const SIGNATURE_END = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;

/**
 * Inflates a raw deflate stream, counting the bytes as they come out: past `limit` bytes it stops
 * and throws "too-large", whatever size the archive declared.
 */
async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new ImportError("too-large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let position = 0;
  for (const chunk of chunks) {
    result.set(chunk, position);
    position += chunk.length;
  }
  return result;
}

/** Reads all entries of a ZIP archive (stored or deflated). Throws on anything else. */
async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === SIGNATURE_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a ZIP archive");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = new Map<string, Uint8Array>();
  // Declared sizes, checked first so that an honest ZIP bomb is never inflated at all.
  let declared = 0;
  // Bytes actually produced, which a forged archive cannot hide.
  let inflated = 0;
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== SIGNATURE_CENTRAL) throw new Error("Broken ZIP archive");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    declared += view.getUint32(offset + 24, true);
    if (declared > MAX_INFLATED_BYTES) throw new ImportError("too-large");
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== SIGNATURE_LOCAL)
      throw new Error("Broken ZIP archive");
    const start =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compressedSize);
    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) data = await inflateRaw(raw, MAX_INFLATED_BYTES - inflated);
    else throw new Error(`Unsupported ZIP compression method ${method}`);
    inflated += data.length;
    if (inflated > MAX_INFLATED_BYTES) throw new ImportError("too-large");
    entries.set(name, data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Writes entries as an uncompressed ZIP archive. */
function writeZip(entries: Map<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = encoder.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, SIGNATURE_LOCAL, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, SIGNATURE_CENTRAL, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, data.length, true);
    head.setUint32(24, data.length, true);
    head.setUint16(28, nameBytes.length, true);
    head.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(head.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const tail = new DataView(new ArrayBuffer(22));
  tail.setUint32(0, SIGNATURE_END, true);
  tail.setUint16(8, entries.size, true);
  tail.setUint16(10, entries.size, true);
  tail.setUint32(12, centralSize, true);
  tail.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(tail.buffer)];
  const result = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of all) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}

function columnLetters(index: number): string {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

const ELEMENT = /<((?:\w+:)?(?:row|c))(?=[\s/>])([^>]*?)(\/?)>/g;
const REF = /\sr="([A-Z]*)(\d*)"/;

function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

/**
 * Adds the missing `r` attribute to rows and cells, counting on from the last reference seen.
 * Elements that have one are left alone. Returns null if nothing was missing.
 */
function addCellRefs(xml: string): string | null {
  let row = 0;
  let column = 0;
  let changed = false;
  const result = xml.replace(ELEMENT, (match, tag: string, attributes: string, close: string) => {
    const ref = REF.exec(attributes);
    if (tag.endsWith("row")) {
      column = 0;
      if (ref) {
        row = Number(ref[2]) || row + 1;
        return match;
      }
      row += 1;
      changed = true;
      return `<${tag}${attributes} r="${row}"${close}>`;
    }
    if (ref) {
      column = (ref[1] ? columnIndex(ref[1]) : column) + 1;
      return match;
    }
    changed = true;
    return `<${tag}${attributes} r="${columnLetters(column++)}${row}"${close}>`;
  });
  return changed ? result : null;
}

/**
 * Returns a workbook that read-excel-file can read. A workbook in which nothing needed repair is
 * returned as the very same bytes.
 */
export async function addMissingCellReferences(bytes: Uint8Array): Promise<Uint8Array> {
  const entries = await readZip(bytes);
  let changed = false;
  for (const [name, data] of entries) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    const repaired = addCellRefs(decoder.decode(data));
    if (repaired === null) continue;
    entries.set(name, encoder.encode(repaired));
    changed = true;
  }
  return changed ? writeZip(entries) : bytes;
}
