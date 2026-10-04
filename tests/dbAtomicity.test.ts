import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attempt, ReviewCard, ReviewLog } from '../src/core/models';
import { db, type LoopDeckBackup } from '../src/storage/db';
import { persistAttemptAndReview, buildReviewPersistence } from '../src/services/quizPersistence';
import { validateBackupPayload } from '../src/storage/backupValidator';

function attempt(id: string): Attempt {
  return {
    attemptId: id,
    questionId: `q-${id}`,
    moduleId: 'atomic-module',
    answeredAt: '2026-09-27T00:00:00.000Z',
    result: 'correct',
    input: 'a',
    answer: 'a',
    elapsedMs: 1000,
    mode: 'normal'
  };
}

function card(id: string): ReviewCard {
  return {
    questionId: `q-${id}`,
    moduleId: 'atomic-module',
    state: 'learning',
    dueAt: '2026-09-28T00:00:00.000Z',
    lastReviewedAt: '2026-09-27T00:00:00.000Z',
    firstReviewedAt: '2026-09-27T00:00:00.000Z',
    intervalDays: 1,
    ease: 2.5,
    totalReviews: 1,
    totalCorrect: 1,
    totalWrong: 0,
    correctStreak: 1,
    wrongStreak: 0,
    lapseCount: 0,
    leechLevel: 0,
    suspended: false,
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z'
  };
}

function log(id: string): ReviewLog {
  return {
    reviewLogId: `log-${id}`,
    questionId: `q-${id}`,
    moduleId: 'atomic-module',
    reviewedAt: '2026-09-27T00:00:00.000Z',
    rating: 'good',
    result: 'correct',
    previousState: 'new',
    nextState: 'learning',
    previousDueAt: null,
    nextDueAt: '2026-09-28T00:00:00.000Z',
    previousIntervalDays: 0,
    nextIntervalDays: 1,
    previousEase: 2.5,
    nextEase: 2.5,
    elapsedMs: 1000,
    attemptId: id
  };
}

function emptyBackup(): LoopDeckBackup {
  return {
    loopDeckBackupVersion: 1,
    exportedAt: '2026-09-27T00:00:00.000Z',
    attempts: [],
    bookmarks: [],
    importedPacks: [],
    importedPackAssets: [],
    reviewCards: [],
    reviewLogs: []
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.importUserData(emptyBackup(), 'replace');
});

describe('IndexedDB atomic persistence', () => {
  it('serializes concurrent answers without losing review increments', async () => {
    const first = attempt('concurrent-1');
    const second = { ...attempt('concurrent-2'), questionId: first.questionId };
    await Promise.all([persistAttemptAndReview(first, db), persistAttemptAndReview(second, db)]);
    expect((await db.getReviewCard(first.questionId))?.totalReviews).toBe(2);
    expect(await db.getReviewLogsForQuestion(first.questionId)).toHaveLength(2);
    expect(await db.getAttempts()).toHaveLength(2);
    await persistAttemptAndReview(first, db);
    expect((await db.getReviewCard(first.questionId))?.totalReviews).toBe(2);
    expect(await db.getReviewLogsForQuestion(first.questionId)).toHaveLength(2);
  });

  it('keeps opposite directions independent through persistence and backup restore', async () => {
    const forward: Attempt = { ...attempt('forward'), questionMode: 'front_to_back' };
    const reverse: Attempt = { ...attempt('reverse'), questionId: forward.questionId, questionMode: 'back_to_front', result: 'wrong' };
    await Promise.all([persistAttemptAndReview(forward, db), persistAttemptAndReview(reverse, db)]);
    expect(await db.getReviewCard(forward.questionId, 'front_to_back')).toMatchObject({ totalReviews: 1, totalCorrect: 1 });
    expect(await db.getReviewCard(forward.questionId, 'back_to_front')).toMatchObject({ totalReviews: 1, totalWrong: 1 });
    expect(await db.getReviewCard(forward.questionId)).toBeUndefined();
    const backup = validateBackupPayload(await db.exportUserData());
    expect(backup.reviewCards).toHaveLength(2);
    expect(backup.reviewLogs?.map((log) => log.questionMode).sort()).toEqual(['back_to_front', 'front_to_back']);
    await db.importUserData(backup, 'replace');
    expect(await db.getReviewCard(forward.questionId, 'back_to_front')).toMatchObject({ totalReviews: 1, totalWrong: 1 });
  });

  it('uses the answer timestamp on delayed persistence and rejects invalid timestamps atomically', async () => {
    const delayed: Attempt = { ...attempt('delayed'), result: 'wrong', answeredAt: '2026-01-01T00:00:00.000Z' };
    await persistAttemptAndReview(delayed, db);
    expect(await db.getReviewCard(delayed.questionId)).toMatchObject({ createdAt: delayed.answeredAt, dueAt: '2026-01-01T00:10:00.000Z' });
    expect((await db.getReviewLogsForQuestion(delayed.questionId))[0].reviewedAt).toBe(delayed.answeredAt);
    const invalid = { ...attempt('invalid-date'), answeredAt: 'invalid' };
    expect(() => buildReviewPersistence(invalid)).toThrow(/timestamp/);
    await expect(persistAttemptAndReview(invalid, db)).rejects.toBeTruthy();
    expect(await db.getReviewCard(invalid.questionId)).toBeUndefined();
    expect((await db.getAttempts()).some((row) => row.attemptId === invalid.attemptId)).toBe(false);
  });

  it('rolls back attempt/card/log together when one write cannot be cloned', async () => {
    const badCard = { ...card('atomic-fail'), nonCloneable: () => undefined } as unknown as ReviewCard;

    await expect(db.saveAttemptWithReview(attempt('atomic-fail'), badCard, log('atomic-fail'))).rejects.toBeTruthy();

    expect((await db.getAttempts()).some((row) => row.attemptId === 'atomic-fail')).toBe(false);
    expect(await db.getReviewCard('q-atomic-fail')).toBeUndefined();
    expect(await db.getReviewLogsForQuestion('q-atomic-fail')).toEqual([]);
  });

  it('rolls back a replace restore completely when a later backup row fails', async () => {
    await db.addAttempt(attempt('existing'));
    await db.setBookmark('existing-bookmark', true);
    const backup = emptyBackup();
    backup.attempts = [attempt('incoming')];
    backup.reviewLogs = [log('incoming')];
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'reviewLogs') throw new DOMException('Disk full', 'QuotaExceededError');
      return originalPut.call(this, value, key);
    });

    await expect(db.importUserData(backup, 'replace')).rejects.toBeTruthy();

    expect((await db.getAttempts()).map((row) => row.attemptId)).toContain('existing');
    expect((await db.getAttempts()).map((row) => row.attemptId)).not.toContain('incoming');
    expect(await db.getBookmarks()).toContain('existing-bookmark');
  });

  it('keeps unrelated current rows in merge mode and removes them in replace mode', async () => {
    await db.addAttempt(attempt('current'));
    await db.setBookmark('current-bookmark', true);
    const backup = emptyBackup();
    backup.attempts = [attempt('backup')];
    backup.bookmarks = ['backup-bookmark'];

    await db.importUserData(backup, 'merge');
    expect(new Set((await db.getAttempts()).map((row) => row.attemptId))).toEqual(new Set(['current', 'backup']));
    expect(new Set(await db.getBookmarks())).toEqual(new Set(['current-bookmark', 'backup-bookmark']));

    await db.importUserData(backup, 'replace');
    expect((await db.getAttempts()).map((row) => row.attemptId)).toEqual(['backup']);
    expect(await db.getBookmarks()).toEqual(['backup-bookmark']);
  });
});
