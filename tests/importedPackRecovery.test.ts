// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { resolveActivePacks } from '../src/packs/packResolver';
import { importLoopDeckJson } from '../src/packs/zipImporter';
import { renderHomeScreen } from '../src/screens/homeScreen';
import { db } from '../src/storage/db';

const DB_NAME = 'loopdeck-db';
const DB_VERSION = 3;

function minimalPack(packId: string) {
  return {
    packVersion: 1,
    packId,
    title: 'Minimal pack',
    folders: [],
    modules: [{ id: 'm', questionIds: ['q'] }],
    questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' }]
  };
}

function putRawStoredPack(pack: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('packs', 'readwrite');
      transaction.objectStore('packs').put(pack);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function expectHomeToRender(pack: LoopDeckPack): void {
  const root = document.createElement('div');
  expect(() => renderHomeScreen(root, resolveActivePacks([pack]), () => {}, () => {}, () => {}, () => {})).not.toThrow();
  expect(root.querySelector('.module-card')).toBeTruthy();
}

describe('imported pack startup recovery', () => {
  it('imports, persists, reloads, and renders a module with only documented required fields', async () => {
    const packId = 'minimal-module-contract';
    await db.deleteImportedPack(packId);

    const file = new File([JSON.stringify(minimalPack(packId))], 'minimal.loopdeck.json', { type: 'application/json' });
    const imported = await importLoopDeckJson(file);
    expect(imported.ok).toBe(true);
    expect(imported.pack).toBeTruthy();

    await db.saveImportedPack(imported.pack as LoopDeckPack);
    const reloaded = (await db.getImportedPacks()).find((pack) => pack.packId === packId);
    expect(reloaded?.modules[0]).toMatchObject({ title: 'm', subject: 'その他', folderId: '' });
    expectHomeToRender(reloaded as LoopDeckPack);

    await db.deleteImportedPack(packId);
  });

  it('recovers a previously persisted missing-subject pack without clearing unrelated user data', async () => {
    const packId = 'legacy-missing-subject-recovery';
    const attemptId = 'legacy-missing-subject-attempt';
    await db.deleteImportedPack(packId);
    await db.addAttempt({
      attemptId,
      questionId: 'q',
      moduleId: 'm',
      answeredAt: '2026-09-27T00:00:00.000Z',
      result: 'correct',
      input: 'A',
      answer: 'A',
      elapsedMs: 100,
      mode: 'normal'
    });

    await putRawStoredPack(minimalPack(packId));

    const recovered = (await db.getImportedPacks()).find((pack) => pack.packId === packId);
    expect(recovered?.modules[0]).toMatchObject({ title: 'm', subject: 'その他', folderId: '' });
    expectHomeToRender(recovered as LoopDeckPack);
    expect((await db.getAttempts()).some((attempt) => attempt.attemptId === attemptId)).toBe(true);

    await db.deleteImportedPack(packId);
    await db.clearAttempts();
  });
});
