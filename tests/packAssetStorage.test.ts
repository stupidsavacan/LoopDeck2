import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Attempt, LoopDeckPack } from '../src/core/models';
import type { ImportedPackAsset } from '../src/packs/packTypes';
import { db } from '../src/storage/db';

function pack(packId: string): LoopDeckPack {
  return {
    packVersion: 1,
    packId,
    title: 'Image Pack',
    folders: [{ id: 'f', title: 'Folder' }],
    modules: [{ id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: ['q'] }],
    questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'Question', answer: 'Answer', imageAsset: 'images/map.png' }]
  };
}

function asset(packId: string, path: string, data = 'iVBORw0KGgo='): ImportedPackAsset {
  return { packId, path, mimeType: 'image/png', dataUrl: `data:image/png;base64,${data}` };
}

describe('imported pack asset storage', () => {
  it('saves, reads, merges, overwrites, and deletes assets without deleting learning history', async () => {
    const packId = 'storage-image-pack';
    const savedPack = pack(packId);
    const attempt: Attempt = {
      attemptId: 'asset-storage-attempt',
      questionId: 'q',
      moduleId: 'm',
      answeredAt: '2026-06-10T00:00:00.000Z',
      result: 'wrong',
      input: 'Wrong',
      answer: 'Answer',
      elapsedMs: 1000,
      mode: 'normal'
    };

    await db.addAttempt(attempt);
    await db.saveImportedPackWithAssets(savedPack, [asset(packId, 'images/map.png')]);
    expect(await db.getPackAsset(packId, 'images/map.png')).toMatchObject({ packId, path: 'images/map.png' });

    await db.saveImportedPackWithAssets(savedPack, [asset(packId, 'images/new.png')], false);
    expect(await db.getPackAsset(packId, 'images/map.png')).toBeDefined();
    expect(await db.getPackAsset(packId, 'images/new.png')).toBeDefined();

    await db.saveImportedPackWithAssets(savedPack, [asset(packId, 'images/new.png', 'bmV3')], true);
    expect(await db.getPackAsset(packId, 'images/map.png')).toBeUndefined();
    expect((await db.getPackAsset(packId, 'images/new.png'))?.dataUrl).toBe('data:image/png;base64,bmV3');
    expect(await db.getAttempts()).toContainEqual(attempt);

    await db.deleteImportedPack(packId);
    expect(await db.getPackAsset(packId, 'images/new.png')).toBeUndefined();
    expect((await db.getImportedPacks()).some((item) => item.packId === packId)).toBe(false);
    expect(await db.getAttempts()).toContainEqual(attempt);
  });

  it('does not overwrite an existing same-path asset during additive merge', async () => {
    const packId = 'storage-image-path-collision';
    const savedPack = pack(packId);
    await db.deleteImportedPack(packId);
    await db.saveImportedPackWithAssets(savedPack, [asset(packId, 'images/map.png', 'b2xk')]);

    await db.saveImportedPackWithAssets(savedPack, [asset(packId, 'images/map.png', 'bmV3')], false);

    expect((await db.getPackAsset(packId, 'images/map.png'))?.dataUrl).toBe('data:image/png;base64,b2xk');
    await db.deleteImportedPack(packId);
  });
});
