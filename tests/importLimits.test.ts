import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_FILE_BYTES, MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES, validateImportFileSize } from '../src/packs/importLimits';
import { inspectZipSafety } from '../src/packs/zipSafety';

function findCentralEntry(buffer: ArrayBuffer): number {
  const view = new DataView(buffer);
  for (let offset = 0; offset <= view.byteLength - 4; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) return offset;
  }
  throw new Error('central entry not found');
}

describe('import resource limits', () => {
  it('rejects oversized container files before reading them', () => {
    const fakeFile = { name: 'huge.loopdeck.json', size: MAX_IMPORT_FILE_BYTES + 1 } as File;
    expect(validateImportFileSize(fakeFile).some((issue) => issue.level === 'error')).toBe(true);
  });

  it('rejects a ZIP whose central directory declares an oversized expanded entry', async () => {
    const zip = new JSZip();
    zip.file('manifest.json', '{}');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const view = new DataView(buffer);
    const centralOffset = findCentralEntry(buffer);
    view.setUint32(centralOffset + 24, MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES + 1, true);

    const result = inspectZipSafety(buffer);
    expect(result.issues.some((issue) => issue.message.includes('too large after expansion'))).toBe(true);
  });

  it('rejects pathological ZIP entry counts', async () => {
    const zip = new JSZip();
    for (let index = 0; index < 257; index += 1) zip.file(`f${index}.txt`, 'x');
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const result = inspectZipSafety(buffer);
    expect(result.issues.some((issue) => issue.message.includes('too many entries'))).toBe(true);
  });
});
