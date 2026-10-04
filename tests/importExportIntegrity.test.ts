import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { isSafeImageDataUrl } from '../src/packs/assetSafety';
import { createQuestionImageAssetResolver } from '../src/packs/packAssetResolver';
import { packAssetId } from '../src/packs/packAssetIdentity';
import { resolveActivePacks } from '../src/packs/packResolver';
import { createLoopDeckZipBytes, stringifyLoopDeckJson } from '../src/packs/zipExporter';
import { importLoopDeckJson, importLoopDeckZip } from '../src/packs/zipImporter';
import { readImportFile } from '../src/services/importFileService';
import { validateBackupPayload } from '../src/storage/backupValidator';
import { db } from '../src/storage/db';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const dataUrl = `data:image/png;base64,${png}`;
function pack(packId = 'integrity', questionId = 'integrity-q', moduleId = 'integrity-m'): LoopDeckPack {
  return {
    packVersion: 1,
    packId,
    title: packId,
    folders: [],
    modules: [{ id: moduleId, folderId: '', title: 'Module', subject: 'test', questionIds: [questionId] }],
    questions: [{ id: questionId, moduleId, type: 'input', prompt: 'Q', answer: 'A', imageAsset: 'images/pixel.png' }]
  };
}
afterEach(() => vi.restoreAllMocks());

describe('pack import/export integrity', () => {
  it.each(['', 'AAAA', 'iVBORw0KGgo=', png.slice(0, -16)])('rejects empty, arbitrary and truncated PNG bytes %s', (payload) => {
    expect(isSafeImageDataUrl(`data:image/png;base64,${payload}`)).toBe(false);
  });
  it('accepts a complete PNG and rejects MIME/image mismatches', () => {
    expect(isSafeImageDataUrl(dataUrl)).toBe(true);
    expect(isSafeImageDataUrl(`data:image/jpeg;base64,${png}`)).toBe(false);
    expect(isSafeImageDataUrl(`data:image/webp;base64,${png}`)).toBe(false);
  });
  it('returns structured errors for malformed JSON, corrupt ZIP and malformed ZIP JSON', async () => {
    expect(await importLoopDeckJson(new File(['{'], 'broken.json'))).toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ level: 'error' })]
    });
    expect(await importLoopDeckZip(new File(['not zip'], 'broken.zip'))).toMatchObject({ ok: false });
    const zip = new JSZip();
    zip.file('manifest.json', '{');
    expect(await importLoopDeckZip(new File([await zip.generateAsync({ type: 'arraybuffer' })], 'broken.zip'))).toMatchObject({
      ok: false
    });
  });
  it('routes mixed-case ZIP extensions and rejects unsupported top-level filenames', async () => {
    const value = pack();
    const bytes = await createLoopDeckZipBytes(value, [{ packId: value.packId, path: 'images/pixel.png', mimeType: 'image/png', dataUrl }]);
    expect(await readImportFile(new File([Uint8Array.from(bytes).buffer], 'PACK.LoOpDeCk.ZIP'))).toMatchObject({
      kind: 'pack',
      result: { ok: true }
    });
    expect(await readImportFile(new File([JSON.stringify(value)], 'pack.txt'))).toMatchObject({ kind: 'pack', result: { ok: false } });
  });
  it('rejects zero-byte/non-image ZIP assets before persistence', async () => {
    const value = pack();
    const bytes = await createLoopDeckZipBytes(value, [{ packId: value.packId, path: 'images/pixel.png', mimeType: 'image/png', dataUrl }]);
    for (const payload of ['', 'not an image']) {
      const zip = await JSZip.loadAsync(bytes);
      zip.file('images/pixel.png', payload);
      const result = await importLoopDeckZip(new File([await zip.generateAsync({ type: 'arraybuffer' })], 'pack.zip'));
      expect(result).toMatchObject({ ok: false });
      expect(result.issues.some((issue) => issue.level === 'error' && issue.path === 'images/pixel.png')).toBe(true);
    }
  });
  it('exports bundled builtin bytes and embedded single-HTML bytes into complete ZIPs', async () => {
    const value = pack('loopdeck-builtin-v1');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(Uint8Array.from(atob(png), (c) => c.charCodeAt(0))));
    const bytes = await createLoopDeckZipBytes(value, []);
    expect(fetchMock).toHaveBeenCalledWith('images/pixel.png');
    expect(await (await JSZip.loadAsync(bytes)).file('images/pixel.png')!.async('base64')).toBe(png);
    const globals = globalThis as typeof globalThis & { __LOOPDECK_EMBEDDED_ASSETS__?: Record<string, string> };
    globals.__LOOPDECK_EMBEDDED_ASSETS__ = { 'images/pixel.png': dataUrl };
    try {
      fetchMock.mockClear();
      const embedded = await createLoopDeckZipBytes(value, []);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(await (await JSZip.loadAsync(embedded)).file('images/pixel.png')!.async('base64')).toBe(png);
    } finally {
      delete globals.__LOOPDECK_EMBEDDED_ASSETS__;
    }
  });
  it('blocks lossy JSON export and ZIP export missing referenced bytes', async () => {
    expect(() => stringifyLoopDeckJson(pack())).toThrow('ZIP');
    await expect(createLoopDeckZipBytes(pack(), [])).rejects.toThrow('画像');
  });
  it('validates backup image bytes and upgrades legacy asset identities without collisions', () => {
    const value = pack();
    const backup = {
      loopDeckBackupVersion: 1,
      exportedAt: new Date().toISOString(),
      importedPacks: [value],
      attempts: [],
      bookmarks: [],
      importedPackAssets: [
        { assetId: 'integrity:images/pixel.png', packId: 'integrity', path: 'images/pixel.png', mimeType: 'image/png', dataUrl }
      ]
    };
    expect(validateBackupPayload(backup).importedPackAssets?.[0].assetId).toBe(packAssetId('integrity', 'images/pixel.png'));
    expect(() =>
      validateBackupPayload({ ...backup, importedPackAssets: [{ ...backup.importedPackAssets[0], dataUrl: 'data:image/png;base64,' }] })
    ).toThrow();
    expect(packAssetId('a:1', 'dir/c.png')).not.toBe(packAssetId('a', '1:dir/c.png'));
  });
  it('resolves a module-owned image despite legacy duplicate global question IDs', async () => {
    const left = pack('a', 'same-q', 'ma');
    const right = pack('b', 'same-q', 'mb');
    const getPackAsset = vi.fn(async (packId: string, path: string) => ({
      assetId: packAssetId(packId, path),
      packId,
      path,
      mimeType: 'image/png',
      dataUrl
    }));
    const resolver = createQuestionImageAssetResolver(resolveActivePacks([left, right]), { getPackAsset });
    expect(await resolver(left.questions[0])).toBe(dataUrl);
    expect(getPackAsset).toHaveBeenLastCalledWith('a', 'images/pixel.png');
    expect(await resolver(right.questions[0])).toBe(dataUrl);
    expect(getPackAsset).toHaveBeenLastCalledWith('b', 'images/pixel.png');
  });
  it('rejects concurrent cross-pack question identity collisions within the install transaction', async () => {
    const left = pack('concurrent-a', 'concurrent-q', 'concurrent-ma');
    const right = pack('concurrent-b', 'concurrent-q', 'concurrent-mb');
    const result = await Promise.allSettled([db.saveImportedPack(left), db.saveImportedPack(right)]);
    expect(result.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(result.filter((item) => item.status === 'rejected')).toHaveLength(1);
    await db.deleteImportedPack(left.packId);
    await db.deleteImportedPack(right.packId);
  });
});
