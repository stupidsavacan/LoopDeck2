import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { db, type LoopDeckBackup } from '../src/storage/db';
import { resolveActivePacks } from '../src/packs/packResolver';
import { validatePack } from '../src/packs/packValidator';

function pack(packId: string): LoopDeckPack {
  return {
    packVersion: 1,
    packId,
    title: packId,
    folders: [],
    modules: [{ id: 'm', title: packId, subject: 'Test', folderId: '', questionIds: [packId + '-q'] }],
    questions: [{ id: packId + '-q', moduleId: 'm', type: 'input', prompt: 'Q', answer: 'A' }]
  };
}
const empty: LoopDeckBackup = {
  loopDeckBackupVersion: 1,
  exportedAt: '2026-10-02T00:00:00Z',
  attempts: [],
  bookmarks: [],
  importedPacks: [],
  importedPackAssets: [],
  reviewCards: [],
  reviewLogs: []
};
beforeEach(async () => {
  await db.importUserData(empty, 'replace');
});
afterEach(() => {
  vi.restoreAllMocks();
});
async function winner() {
  return resolveActivePacks(await db.getImportedPacks()).modulePackIdById.get('m');
}

describe('pack priority persistence', () => {
  it('assigns transaction-ordered priorities to concurrent imports', async () => {
    await Promise.all([db.saveImportedPack(pack('z-first')), db.saveImportedPack(pack('a-second'))]);
    expect(await winner()).toBe('a-second');
  });
  it('promotes an updated pack and preserves priority through both asset strategies', async () => {
    await db.saveImportedPack(pack('a-first'));
    await db.saveImportedPackWithAssets(pack('z-second'), [], 'replace');
    expect(await winner()).toBe('z-second');
    await db.saveImportedPackWithAssets(pack('a-first'), [], 'upsert');
    expect(await winner()).toBe('a-first');
  });
  it.each(['replace', 'merge'] as const)('round trips priority through a %s backup restore', async (mode) => {
    await db.saveImportedPack(pack('z-first'));
    await db.saveImportedPack(pack('a-second'));
    const backup = await db.exportUserData();
    expect(backup.importedPacks.map((p) => p.packId)).toEqual(['z-first', 'a-second']);
    expect(backup.importedPacks.every((p) => !('installedOrder' in p))).toBe(true);
    await db.saveImportedPack(pack('zz-newer'));
    await db.importUserData(backup, mode);
    expect(await winner()).toBe('a-second');
    expect((await db.getImportedPacks()).some((p) => p.packId === 'zz-newer')).toBe(mode === 'merge');
  });
  it('rejects an asynchronous pack write failure and rolls back the asset transaction', async () => {
    await db.saveImportedPack(pack('old'));
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'packs') throw new DOMException('Disk full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    await expect(
      db.saveImportedPackWithAssets(
        pack('incoming'),
        [
          {
            packId: 'incoming',
            path: 'images/a.png',
            mimeType: 'image/png',
            dataUrl: 'data:image/png;base64,YQ=='
          }
        ],
        'upsert'
      )
    ).rejects.toBeTruthy();
    expect(await db.getPackAsset('incoming', 'images/a.png')).toBeUndefined();
    expect(await winner()).toBe('old');
  });
  it('retains legacy installed and backup content while rejecting it as a new authoring import', async () => {
    const legacy = pack('legacy');
    legacy.questions[0].number = 1.5;
    expect(validatePack(legacy).ok).toBe(false);
    expect(validatePack(legacy, 'stored').ok).toBe(true);
    await db.importUserData({ ...empty, importedPacks: [legacy] }, 'replace');
    expect((await db.getImportedPacks())[0].questions[0].number).toBe(1.5);
    await db.importUserData(await db.exportUserData(), 'replace');
    expect(await winner()).toBe('legacy');
  });
});
