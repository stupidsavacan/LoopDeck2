import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Attempt, LoopDeckPack } from '../src/core/models';
import { applyReviewRating, createReviewCard } from '../src/core/scheduler';
import { packAssetId } from '../src/packs/packAssetIdentity';
import { readImportFile } from '../src/services/importFileService';
import { exportLoopDeck3MigrationBackup } from '../src/storage/backupExport';
import { normalizeLoopDeck3Backup, validateLoopDeck3MigrationBackup } from '../src/storage/backupValidator';
import { db, type LoopDeckBackup } from '../src/storage/db';

const stamp = '2026-10-04T00:00:00.000Z';
const dataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function emptyBackup(): LoopDeckBackup {
  return {
    loopDeckBackupVersion: 1,
    exportedAt: stamp,
    attempts: [],
    bookmarks: [],
    importedPacks: [],
    importedPackAssets: [],
    reviewCards: [],
    reviewLogs: []
  };
}

function pack(): LoopDeckPack {
  return {
    packVersion: 1,
    packId: 'l3-compat-pack',
    title: 'L3 compatibility',
    folders: [],
    modules: [{ id: 'l3-compat-module', folderId: '', title: 'Module', subject: 'test', questionIds: ['l3-compat-question'] }],
    questions: [
      {
        id: 'l3-compat-question',
        moduleId: 'l3-compat-module',
        type: 'input',
        prompt: 'Prompt',
        answer: 'Answer',
        imageAsset: 'images/pixel.png'
      }
    ]
  };
}

function attempt(): Attempt {
  return {
    attemptId: 'l3-compat-attempt',
    questionId: 'l3-compat-question',
    moduleId: 'l3-compat-module',
    answeredAt: stamp,
    result: 'correct',
    input: 'Answer',
    answer: 'Answer',
    elapsedMs: 500,
    mode: 'normal',
    questionMode: 'as_stored'
  };
}

beforeEach(async () => {
  await db.importUserData(emptyBackup(), 'replace');
});

describe('LoopDeck3 backup schema 1 compatibility', () => {
  it('exports schema 1 from the repaired LoopDeck2 snapshot with all supported collections', async () => {
    const importedPack = pack();
    const learningAttempt = attempt();
    const review = applyReviewRating(
      createReviewCard(learningAttempt.questionId, learningAttempt.moduleId, new Date(stamp)),
      'good',
      'correct',
      learningAttempt.elapsedMs,
      { now: new Date(stamp), attemptId: learningAttempt.attemptId }
    );
    await db.saveImportedPackWithAssets(
      importedPack,
      [{ packId: importedPack.packId, path: 'images/pixel.png', mimeType: 'image/png', dataUrl }],
      'replace'
    );
    await db.saveAttemptWithReview(learningAttempt, review.card, review.log);
    await db.setBookmark(learningAttempt.questionId, true);

    const exported = await exportLoopDeck3MigrationBackup();
    expect(exported).toMatchObject({
      format: 'loopdeck3.backup',
      schema: 1,
      attempts: [learningAttempt],
      bookmarks: [learningAttempt.questionId],
      importedPacks: [importedPack],
      reviewCards: [review.card],
      reviewLogs: [review.log]
    });
    expect(exported).not.toHaveProperty('loopDeckBackupVersion');
    expect(Number.isFinite(Date.parse(exported.exportedAt))).toBe(true);
    expect(exported.importedPackAssets).toEqual([
      {
        assetId: packAssetId(importedPack.packId, 'images/pixel.png'),
        packId: importedPack.packId,
        path: 'images/pixel.png',
        mimeType: 'image/png',
        dataUrl
      }
    ]);
    expect(validateLoopDeck3MigrationBackup(exported)).toEqual(exported);
  });

  it('normalizes schema 1 at the file boundary and reuses replace and merge restore paths', async () => {
    const importedPack = pack();
    const learningAttempt = attempt();
    const payload = {
      format: 'loopdeck3.backup',
      schema: 1,
      exportedAt: stamp,
      attempts: [learningAttempt],
      bookmarks: [learningAttempt.questionId],
      importedPacks: [importedPack],
      importedPackAssets: [
        {
          assetId: packAssetId(importedPack.packId, 'images/pixel.png'),
          packId: importedPack.packId,
          path: 'images/pixel.png',
          mimeType: 'image/png',
          dataUrl
        }
      ],
      reviewCards: [],
      reviewLogs: []
    } as const;

    const normalized = normalizeLoopDeck3Backup(payload);
    const file = new File([JSON.stringify(payload)], 'loopdeck3-backup.json', { type: 'application/json' });
    expect(await readImportFile(file)).toEqual({ kind: 'backup', backup: normalized, source: 'loopdeck3' });

    await db.importUserData(normalized, 'replace');
    expect(await db.getAttempts()).toEqual([learningAttempt]);
    expect(await db.getBookmarks()).toEqual([learningAttempt.questionId]);
    expect((await db.getImportedPacks()).map((item) => item.packId)).toEqual([importedPack.packId]);
    expect(await db.getImportedPackAssets()).toEqual(normalized.importedPackAssets);

    const mergePayload = normalizeLoopDeck3Backup({ ...payload, attempts: [], bookmarks: ['merged-bookmark'] });
    await db.importUserData(mergePayload, 'merge');
    expect(await db.getBookmarks()).toEqual(expect.arrayContaining([learningAttempt.questionId, 'merged-bookmark']));
  });

  it('rejects future or unsupported schema 1 semantics before any DB write', async () => {
    const base = {
      format: 'loopdeck3.backup',
      schema: 1,
      exportedAt: stamp,
      attempts: [],
      bookmarks: [],
      importedPacks: [],
      importedPackAssets: [],
      reviewCards: [],
      reviewLogs: []
    };

    expect(() => normalizeLoopDeck3Backup({ ...base, schema: 2 })).toThrow(/schema must be 1/);
    expect(() => normalizeLoopDeck3Backup({ ...base, attempts: [{ ...attempt(), answerMode: 'flashcard' }] })).toThrow(/answerMode/);
    expect(() => normalizeLoopDeck3Backup({ ...base, bookmarks: ['same', 'same'] })).toThrow(/duplicate/);

    await db.setBookmark('preserved', true);
    const malformed = {
      ...base,
      importedPacks: [pack()],
      importedPackAssets: [{ packId: 'missing', path: 'images/pixel.png', mimeType: 'image/png', dataUrl }]
    };
    expect(() => normalizeLoopDeck3Backup(malformed)).toThrow(/packId/);
    expect(await db.getBookmarks()).toEqual(['preserved']);
  });
});
