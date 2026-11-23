/**
 * The portal's XLSX writer omits the cell and row references (`r="A1"`), which are optional in
 * the file format but required by read-excel-file. This module adds them: it unpacks the
 * workbook, numbers the rows and cells of every worksheet that has none, and repacks everything
 * uncompressed. Workbooks that already carry references are returned untouched.
 */

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const SIGNATURE_END = 0x06054b50;
const SIGNATURE_CENTRAL = 0x02014b50;
const SIGNATURE_LOCAL = 0x04034b50;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== SIGNATURE_CENTRAL) throw new Error("Broken ZIP archive");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
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
    if (method === 0) entries.set(name, raw);
    else if (method === 8) entries.set(name, await inflateRaw(raw));
    else throw new Error(`Unsupported ZIP compression method ${method}`);
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

const HAS_REFS = /<(?:\w+:)?c\s[^>]*\sr="/;
const ELEMENT = /<((?:\w+:)?(?:row|c))(?=[\s/>])([^>]*?)(\/?)>/g;

/** Numbers rows and cells of a worksheet that has no references. */
function addCellRefs(xml: string): string {
  let row = 0;
  let column = 0;
  return xml.replace(ELEMENT, (_match, tag: string, attributes: string, close: string) => {
    if (tag.endsWith("row")) {
      row += 1;
      column = 0;
      return /\sr="/.test(attributes) ? _match : `<${tag}${attributes} r="${row}"${close}>`;
    }
    const ref = columnLetters(column++) + row;
    return `<${tag}${attributes} r="${ref}"${close}>`;
  });
}

/** Returns a workbook that read-excel-file can read; unchanged if it already has references. */
export async function addMissingCellReferences(bytes: Uint8Array): Promise<Uint8Array> {
  const entries = await readZip(bytes);
  let changed = false;
  for (const [name, data] of entries) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    const xml = decoder.decode(data);
    if (HAS_REFS.test(xml)) continue;
    entries.set(name, encoder.encode(addCellRefs(xml)));
    changed = true;
  }
  return changed ? writeZip(entries) : bytes;
}
