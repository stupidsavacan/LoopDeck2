import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { applyReviewRating, createReviewCard, summarizeReviewSchedule } from '../src/core/scheduler';
import { validateBackupPayload } from '../src/storage/backupValidator';

const DB_NAME = 'loopdeck-db';

function openLegacyDatabase(version = 2): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore('attempts', { keyPath: 'attemptId' });
      database.createObjectStore('bookmarks', { keyPath: 'questionId' });
      database.createObjectStore('packs', { keyPath: 'packId' });
      database.createObjectStore('settings', { keyPath: 'key' });
      database.createObjectStore('reviewCards', { keyPath: 'questionId' });
      database.createObjectStore('reviewLogs', { keyPath: 'reviewLogId' });
      if (version >= 4) database.createObjectStore('packAssets', { keyPath: 'assetId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

describe('IndexedDB migration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('indexedDB', new IDBFactory());
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([1, 2, 3, 4, 5])('migrates v%i data into valid, schedulable, exportable review records', async (version) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scheduled = applyReviewRating(createReviewCard('scheduled', 'm', new Date('2026-01-01T00:00:00.000Z')), 'good', 'correct', 1000, {
      now: new Date('2026-01-01T00:00:00.000Z')
    });
    const legacy = await openLegacyDatabase(version);
    const transaction = legacy.transaction(['attempts', 'bookmarks', 'packs', 'reviewCards', 'reviewLogs'], 'readwrite');
    transaction.objectStore('attempts').put({
      attemptId: 'legacy-attempt',
      questionId: 'q',
      moduleId: 'm',
      answeredAt: '2026-01-01T00:00:00.000Z',
      result: 'wrong',
      input: 'x',
      answer: 'y',
      elapsedMs: 1000,
      mode: 'normal'
    });
    transaction.objectStore('bookmarks').put({ questionId: 'q', createdAt: '2026-01-01T00:00:00.000Z' });
    transaction.objectStore('packs').put({
      packVersion: 1,
      packId: 'legacy-pack',
      title: 'Legacy',
      folders: [],
      modules: [],
      questions: []
    });
    transaction.objectStore('reviewCards').put({ questionId: 'q', moduleId: 'm' });
    transaction.objectStore('reviewCards').put(scheduled.card);
    transaction.objectStore('reviewCards').put({ questionId: 'invalid', moduleId: 'm', state: 'review' });
    transaction.objectStore('reviewLogs').put({ reviewLogId: 'legacy-log', questionId: 'q', moduleId: 'm' });
    transaction.objectStore('reviewLogs').put(scheduled.log);
    await completeTransaction(transaction);
    legacy.close();

    const { db } = await import('../src/storage/db');
    expect((await db.getAttempts()).map((attempt) => attempt.attemptId)).toContain('legacy-attempt');
    expect(await db.getBookmarks()).toContain('q');
    expect(await db.hasBookmark('q')).toBe(true);
    expect(await db.hasBookmark('missing')).toBe(false);
    expect((await db.getImportedPacks()).map((pack) => pack.packId)).toContain('legacy-pack');
    const cards = await db.getReviewCards();
    expect(cards.find((card) => card.questionId === 'q')).toEqual(createReviewCard('q', 'm', new Date('1970-01-01T00:00:00.000Z')));
    expect(cards.find((card) => card.questionId === 'scheduled')).toEqual(scheduled.card);
    expect(cards.some((card) => card.questionId === 'invalid')).toBe(false);
    expect(summarizeReviewSchedule(cards, new Date('2026-01-03T12:00:00.000Z'))).toMatchObject({ total: 2, dueToday: 1, overdue: 1 });
    expect(await db.getReviewLogs()).toEqual([scheduled.log]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(validateBackupPayload(await db.exportUserData()).reviewCards).toEqual(cards);
    expect(await db.getReviewLogsForQuestion('scheduled')).toEqual([scheduled.log]);
    expect(await db.getImportedPackAssets()).toEqual([]);

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(upgraded.objectStoreNames.contains('settings')).toBe(false);
    upgraded.close();
    const current = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 7);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const indexTx = current.transaction(['attempts', 'packAssets', 'reviewLogs'], 'readonly');
    expect(current.transaction('reviewCards').objectStore('reviewCards').keyPath).toEqual(['questionId', 'questionMode']);
    expect(current.objectStoreNames.contains('contentMetadata')).toBe(true);
    expect([...indexTx.objectStore('attempts').indexNames]).toEqual(expect.arrayContaining(['byQuestionId', 'byResult']));
    expect([...indexTx.objectStore('packAssets').indexNames]).toContain('byPackId');
    expect([...indexTx.objectStore('reviewLogs').indexNames]).toEqual(expect.arrayContaining(['byQuestionId', 'byReviewedAt']));
    const indexedLogs = indexTx.objectStore('reviewLogs').index('byReviewedAt').getAll();
    const storedCards = current.transaction('reviewCards', 'readonly').objectStore('reviewCards').getAll();
    await completeTransaction(indexTx);
    expect(indexedLogs.result).toEqual([scheduled.log]);
    await new Promise<void>((resolve, reject) => {
      if (storedCards.readyState === 'done') resolve();
      else {
        storedCards.onsuccess = () => resolve();
        storedCards.onerror = () => reject(storedCards.error);
      }
    });
    expect(storedCards.result).toEqual(cards);
    current.close();
  });

  it('repairs malformed rows written after upgrade on single, indexed and collection reads', async () => {
    const { db } = await import('../src/storage/db');
    const { runTransaction, getAll } = await import('../src/storage/indexedDb');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reviewed = applyReviewRating(createReviewCard('q', 'm'), 'again', 'wrong', 500, { now: new Date('2026-01-01T00:00:00.000Z') });
    await runTransaction(['reviewCards', 'reviewLogs'], 'readwrite', (tx) => {
      const cards = tx.objectStore('reviewCards');
      cards.put({ questionId: 'q', questionMode: 'as_stored', moduleId: 'm' });
      cards.put({ questionId: 'collection', questionMode: 'as_stored', moduleId: 'm' });
      cards.put({ questionId: 'invalid', questionMode: 'as_stored', moduleId: 'm', ease: -1 });
      cards.put({ questionId: 'invalid-progress', questionMode: 'as_stored', moduleId: 'm', totalReviews: 2 });
      const logs = tx.objectStore('reviewLogs');
      logs.put({ reviewLogId: 'missing-date', questionId: 'q', moduleId: 'm' });
      logs.put({ ...reviewed.log, reviewLogId: 'invalid-date', reviewedAt: 'not a date' });
      logs.put(reviewed.log);
      logs.put({ reviewLogId: 'unindexed' });
    });

    expect(await db.getReviewCard('q')).toEqual(createReviewCard('q', 'm', new Date('1970-01-01T00:00:00.000Z')));
    expect(await db.getReviewCard('invalid')).toBeUndefined();
    expect(await db.getReviewCard('missing')).toBeUndefined();
    expect(await db.getReviewLogsForQuestion('q')).toEqual([reviewed.log]);
    expect(await db.getReviewCards()).toHaveLength(2);
    expect(await db.getReviewLogs()).toEqual([reviewed.log]);
    expect(warn).toHaveBeenCalledTimes(5);
    expect(await getAll('reviewLogs')).toEqual([reviewed.log]);
    expect((await getAll('reviewCards')).every((row) => typeof row === 'object' && row !== null && 'state' in row)).toBe(true);
    const backup = await db.exportUserData();
    expect(validateBackupPayload(backup)).toEqual(backup);
    await db.importUserData(backup, 'replace');
    expect(await db.getReviewLogs()).toEqual([reviewed.log]);
  });

  it('rekeys legacy pack assets to collision-free compound identities in v6', async () => {
    const legacy = await openLegacyDatabase(4);
    const tx = legacy.transaction('packAssets', 'readwrite');
    tx.objectStore('packAssets').put({
      assetId: 'legacy-pack:images/map.png',
      packId: 'legacy-pack',
      path: 'images/map.png',
      mimeType: 'image/png',
      dataUrl: 'legacy-payload'
    });
    await completeTransaction(tx);
    legacy.close();
    const { db } = await import('../src/storage/db');
    const expected = {
      assetId: JSON.stringify(['legacy-pack', 'images/map.png']),
      packId: 'legacy-pack',
      path: 'images/map.png',
      mimeType: 'image/png',
      dataUrl: 'legacy-payload'
    };
    expect(await db.getImportedPackAssets()).toEqual([expected]);
    expect(await db.getPackAsset('legacy-pack', 'images/map.png')).toEqual(expected);
  });

  it('preserves known legacy scheduling and suspension while filling absent baseline fields', async () => {
    const { db } = await import('../src/storage/db');
    const { runTransaction } = await import('../src/storage/indexedDb');
    const scheduledAt = '2026-01-02T00:00:00.000Z';
    await runTransaction('reviewCards', 'readwrite', (tx) => {
      const store = tx.objectStore('reviewCards');
      store.put({
        questionId: 'scheduled',
        questionMode: 'as_stored',
        moduleId: 'm',
        state: 'learning',
        dueAt: scheduledAt,
        totalReviews: 1,
        totalCorrect: 1
      });
      store.put({ questionId: 'suspended', questionMode: 'as_stored', moduleId: 'm', state: 'suspended' });
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      store.put({ ...createReviewCard('extra-metadata', 'm', new Date(scheduledAt)), extra: cyclic });
    });

    const cards = await db.getReviewCards();
    expect(cards.find((card) => card.questionId === 'scheduled')).toMatchObject({
      state: 'learning',
      dueAt: scheduledAt,
      totalReviews: 1,
      ease: 2.5,
      intervalDays: 0
    });
    expect(cards.find((card) => card.questionId === 'suspended')).toMatchObject({ state: 'suspended', suspended: true });
    expect(cards.find((card) => card.questionId === 'extra-metadata')).not.toHaveProperty('extra');
    expect(summarizeReviewSchedule(cards, new Date('2026-01-03T12:00:00.000Z'))).toMatchObject({ total: 2, dueToday: 1, relearning: 1 });
    const backup = await db.exportUserData();
    expect(validateBackupPayload(backup)).toEqual(backup);
  });
});
