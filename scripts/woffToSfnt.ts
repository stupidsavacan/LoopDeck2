import { inflateSync } from 'node:zlib';

/** Reconstruct the bundled font's sfnt tables at build time (WOFF 1.0 section 4).
 * PDF font streams need sfnt bytes. Passing compressed WOFF also makes fontkit
 * repeatedly inflate the entire glyf table while enumerating a full CJK font.
 * This helper handles trusted, dependency-pinned build assets, not user uploads.
 */
export function woffToSfnt(input: Uint8Array): Buffer {
  const source = Buffer.from(input);
  if (source.length < 44 || source.toString('ascii', 0, 4) !== 'wOFF') throw new Error('Expected a WOFF 1.0 font.');
  const count = source.readUInt16BE(12);
  const totalSize = source.readUInt32BE(16);
  if (!count || 44 + count * 20 > source.length || totalSize > 32 * 1024 * 1024) throw new Error('Invalid bundled WOFF directory.');
  const output = Buffer.alloc(totalSize);
  output.writeUInt32BE(source.readUInt32BE(4), 0);
  output.writeUInt16BE(count, 4);
  const selector = Math.floor(Math.log2(count));
  const searchRange = 16 * 2 ** selector;
  output.writeUInt16BE(searchRange, 6);
  output.writeUInt16BE(selector, 8);
  output.writeUInt16BE(count * 16 - searchRange, 10);
  let offset = 12 + count * 16;
  let headOffset: number | undefined;
  for (let index = 0; index < count; index += 1) {
    const entry = 44 + index * 20;
    const tag = source.toString('ascii', entry, entry + 4);
    const start = source.readUInt32BE(entry + 4);
    const compressedLength = source.readUInt32BE(entry + 8);
    const length = source.readUInt32BE(entry + 12);
    if (start + compressedLength > source.length || compressedLength > length || offset + length > output.length)
      throw new Error('Invalid bundled WOFF table.');
    const payload = source.subarray(start, start + compressedLength);
    const table = compressedLength < length ? inflateSync(payload, { maxOutputLength: length }) : payload;
    if (table.length !== length) throw new Error('Invalid expanded WOFF table length.');
    const target = 12 + index * 16;
    source.copy(output, target, entry, entry + 4);
    output.writeUInt32BE(source.readUInt32BE(entry + 16), target + 4);
    output.writeUInt32BE(offset, target + 8);
    output.writeUInt32BE(length, target + 12);
    table.copy(output, offset);
    if (tag === 'head') {
      headOffset = offset;
      output.writeUInt32BE(0, offset + 8);
    }
    offset += (length + 3) & ~3;
  }
  if (offset !== totalSize || headOffset === undefined) throw new Error('Invalid bundled sfnt size or missing head table.');
  let checksum = 0;
  for (let index = 0; index < output.length; index += 4) checksum = (checksum + output.readUInt32BE(index)) >>> 0;
  output.writeUInt32BE((0xb1b0afba - checksum) >>> 0, headOffset + 8);
  return output;
}
