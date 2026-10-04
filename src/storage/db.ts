import type { Attempt, ConcreteStudyQuestionMode, LoopDeckPack, QuizAnswerSource, ReviewCard, ReviewLog } from '../core/models';
import { loadBuiltinPacks } from '../packs/builtinLoader';
import { getQuestionsForModule, resolveActivePacks } from '../packs/packResolver';
import { questionIdentity } from './packLearningState';
import { readContentEpoch } from './packEpoch';
import type { ImportedPackAsset, PackAssetWriteStrategy } from '../packs/packTypes';

import { runTransaction, transaction, getAll } from './indexedDb';
import {
  installedOrder,
  installedRevision,
  savePackWithAssets,
  deletePackAndAssets,
  validatedPackForStorage,
  recoverStoredPacks,
  packAssetId
} from './packStorage';
import { importBackup } from './backupStorage';
import { exportBackup } from './backupExport';
import { recoverReviewCard, recoverReviewRows } from './reviewRecovery';
import type { BackupImportMode } from './storageTypes';
export type { BackupImportMode } from './storageTypes';
export { packAssetId } from './packStorage';

import type { LoopDeckBackup, StoredPackAsset } from './storageTypes';
export type { LoopDeckBackup, StoredPackAsset } from './storageTypes';

export interface LoopDeckDb {
  addAttempt(attempt: Attempt): Promise<void>;
  saveAttemptWithReview(
    attempt: Attempt,
    card: ReviewCard | ((existingCard?: ReviewCard) => { card: ReviewCard; log: ReviewLog }),
    log?: ReviewLog,
    source?: QuizAnswerSource
  ): Promise<void>;
  getAttempts(): Promise<Attempt[]>;
  clearAttempts(): Promise<void>;
  clearWrongAttempts(): Promise<void>;
  setBookmark(questionId: string, enabled: boolean): Promise<void>;
  getBookmarks(): Promise<string[]>;
  hasBookmark(questionId: string): Promise<boolean>;
  clearBookmarks(): Promise<void>;
  saveImportedPack(pack: LoopDeckPack): Promise<void>;
  saveImportedPackWithAssets(pack: LoopDeckPack, assets: ImportedPackAsset[], strategy: PackAssetWriteStrategy): Promise<void>;
  getImportedPacks(): Promise<LoopDeckPack[]>;
  getImportedPackRevisions(): Promise<ReadonlyMap<string, string>>;
  getImportedPackAssets(): Promise<StoredPackAsset[]>;
  getPackAsset(packId: string, path: string): Promise<StoredPackAsset | undefined>;
  deleteImportedPack(packId: string): Promise<void>;
  getReviewCards(): Promise<ReviewCard[]>;
  getReviewCard(questionId: string, questionMode?: ConcreteStudyQuestionMode): Promise<ReviewCard | undefined>;
  putReviewCard(card: ReviewCard): Promise<void>;
  putReviewLog(log: ReviewLog): Promise<void>;
  getReviewLogs(): Promise<ReviewLog[]>;
  getReviewLogsForQuestion(questionId: string): Promise<ReviewLog[]>;
  clearReviewData(): Promise<void>;
  exportUserData(): Promise<LoopDeckBackup>;
  importUserData(backup: unknown, mode: BackupImportMode): Promise<void>;
}

async function deleteAttemptsByResult(results: Attempt['result'][]): Promise<void> {
  await runTransaction('attempts', 'readwrite', (tx) => {
    const store = tx.objectStore('attempts');
    const index = store.index('byResult');
    for (const result of results) {
      const request = index.openKeyCursor(IDBKeyRange.only(result));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
    }
  });
}

export const db: LoopDeckDb = {
  async addAttempt(attempt) {
    await transaction('attempts', 'readwrite', (store) => store.put(attempt));
  },
  async saveAttemptWithReview(attempt, cardOrUpdate, log, source) {
    let sourceError: Error | undefined;
    try {
      await runTransaction(
        ['attempts', 'reviewCards', 'reviewLogs', ...(source ? ['packs', 'packAssets', 'contentMetadata'] : [])],
        'readwrite',
        (tx) => {
          const attempts = tx.objectStore('attempts');
          const cards = tx.objectStore('reviewCards');
          const logs = tx.objectStore('reviewLogs');
          const write = (card: ReviewCard, reviewLog: ReviewLog) => {
            attempts.put(attempt);
            cards.put({ ...card, questionMode: card.questionMode ?? 'as_stored' });
            logs.put({ ...reviewLog, questionMode: reviewLog.questionMode ?? 'as_stored' });
          };
          function saveAnswer(): void {
            if (typeof cardOrUpdate !== 'function') {
              if (!log) throw new Error('A review log is required for an explicit card update.');
              write(cardOrUpdate, log);
              return;
            }
            // IndexedDB serializes overlapping write transactions across tabs. Read the
            // previous card inside this transaction to avoid lost concurrent increments.
            const existingAttempt = attempts.get(attempt.attemptId);
            existingAttempt.onsuccess = () => {
              if (existingAttempt.result) return; // Retrying a committed answer is idempotent.
              const request = cards.get([attempt.questionId, attempt.questionMode ?? 'as_stored']);
              request.onsuccess = () => {
                try {
                  let existing: ReviewCard | undefined;
                  if (request.result !== undefined) {
                    try {
                      existing = recoverReviewCard(request.result);
                    } catch (error) {
                      console.warn('Replacing an unrecoverable stored LoopDeck reviewCards record.', attempt.questionId, error);
                    }
                  }
                  const next = cardOrUpdate(existing);
                  write(next.card, next.log);
                } catch {
                  tx.abort();
                }
              };
            };
          }
          if (!source) {
            saveAnswer();
            return;
          }
          const rejectStaleSource = () => {
            sourceError = new Error('教材が変更されたため、この回答を保存できません。教材を開き直してください。');
            tx.abort();
          };
          const packs = tx.objectStore('packs').getAll();
          const epoch = tx.objectStore('contentMetadata').get('contentEpoch');
          epoch.onsuccess = () => {
            try {
              const rows = [...packs.result].sort((left, right) => installedOrder(left) - installedOrder(right));
              const active = resolveActivePacks([...loadBuiltinPacks(), ...recoverStoredPacks(rows)]);
              const current = getQuestionsForModule(active, source.question.moduleId).find(
                (question) => question.id === source.question.id
              );
              const owner = active.modulePackIdById.get(source.question.moduleId);
              const installed = rows.find((row) => row.packId === source.packId);
              if (
                !current ||
                owner !== source.packId ||
                attempt.questionId !== source.question.id ||
                attempt.moduleId !== source.question.moduleId ||
                questionIdentity(current) !== questionIdentity(source.question) ||
                (source.packRevision !== undefined && installedRevision(installed) !== source.packRevision) ||
                (source.resetEpoch !== undefined && readContentEpoch(epoch.result) !== source.resetEpoch)
              ) {
                rejectStaleSource();
                return;
              }
              if (source.imageDataUrl === undefined) {
                saveAnswer();
                return;
              }
              const image = tx.objectStore('packAssets').get(packAssetId(source.packId, source.question.imageAsset ?? ''));
              image.onsuccess = () => {
                if ((image.result?.dataUrl ?? null) !== source.imageDataUrl) {
                  rejectStaleSource();
                  return;
                }
                saveAnswer();
              };
            } catch (error) {
              sourceError = error instanceof Error ? error : new Error(String(error));
              tx.abort();
            }
          };
        }
      );
    } catch (error) {
      throw sourceError ?? error;
    }
  },
  async getAttempts() {
    return (await getAll<Attempt>('attempts')).filter((attempt) => !attempt.contentRetired);
  },
  async clearAttempts() {
    await transaction('attempts', 'readwrite', (store) => store.clear());
  },
  async clearWrongAttempts() {
    await deleteAttemptsByResult(['wrong', 'revealed']);
  },
  async setBookmark(questionId, enabled) {
    if (enabled) await transaction('bookmarks', 'readwrite', (store) => store.put({ questionId, createdAt: new Date().toISOString() }));
    else await transaction('bookmarks', 'readwrite', (store) => store.delete(questionId));
  },
  async getBookmarks() {
    return (await getAll<{ questionId: string }>('bookmarks')).map((row) => row.questionId);
  },
  async hasBookmark(questionId) {
    return Boolean(await transaction<{ questionId: string }>('bookmarks', 'readonly', (store) => store.get(questionId)));
  },
  async clearBookmarks() {
    await transaction('bookmarks', 'readwrite', (store) => store.clear());
  },
  async saveImportedPack(pack) {
    const normalized = validatedPackForStorage(pack);
    await savePackWithAssets(normalized, [], 'upsert');
  },
  async saveImportedPackWithAssets(pack, assets, strategy) {
    await savePackWithAssets(validatedPackForStorage(pack), assets, strategy);
  },
  async getImportedPacks() {
    const rows = await getAll<unknown>('packs');
    return recoverStoredPacks(rows.sort((left, right) => installedOrder(left) - installedOrder(right)));
  },
  async getImportedPackRevisions() {
    const snapshot = await runTransaction(['packs', 'contentMetadata'], 'readonly', (tx) => ({
      packs: tx.objectStore('packs').getAll() as IDBRequest<{ packId: string }[]>,
      epoch: tx.objectStore('contentMetadata').get('contentEpoch')
    }));
    return new Map([
      ...snapshot.packs.result.map((row) => [row.packId, installedRevision(row)] as const),
      ['', readContentEpoch(snapshot.epoch.result)]
    ]);
  },
  async getImportedPackAssets() {
    return getAll<StoredPackAsset>('packAssets');
  },
  async getPackAsset(packId, path) {
    return (await transaction<StoredPackAsset>('packAssets', 'readonly', (store) => store.get(packAssetId(packId, path)))) as
      StoredPackAsset | undefined;
  },
  async deleteImportedPack(packId) {
    await deletePackAndAssets(packId);
  },
  async getReviewCards() {
    return runTransaction('reviewCards', 'readwrite', (tx) => {
      const rows: ReviewCard[] = [];
      recoverReviewRows(tx.objectStore('reviewCards'), rows);
      return rows;
    });
  },
  async getReviewCard(questionId, questionMode = 'as_stored') {
    const rows = await runTransaction('reviewCards', 'readwrite', (tx) => {
      const rows: ReviewCard[] = [];
      const store = tx.objectStore('reviewCards');
      recoverReviewRows(store, rows, store, IDBKeyRange.only([questionId, questionMode]));
      return rows;
    });
    return rows[0];
  },
  async putReviewCard(card) {
    await transaction('reviewCards', 'readwrite', (store) => store.put({ ...card, questionMode: card.questionMode ?? 'as_stored' }));
  },
  async putReviewLog(log) {
    await transaction('reviewLogs', 'readwrite', (store) => store.put({ ...log, questionMode: log.questionMode ?? 'as_stored' }));
  },
  async getReviewLogs() {
    return runTransaction('reviewLogs', 'readwrite', (tx) => {
      const rows: ReviewLog[] = [];
      recoverReviewRows(tx.objectStore('reviewLogs'), rows);
      return rows;
    });
  },
  async getReviewLogsForQuestion(questionId) {
    const rows = await runTransaction('reviewLogs', 'readwrite', (tx) => {
      const rows: ReviewLog[] = [];
      const store = tx.objectStore('reviewLogs');
      recoverReviewRows(store, rows, store.index('byQuestionId'), IDBKeyRange.only(questionId));
      return rows;
    });
    return rows.sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt));
  },
  async clearReviewData() {
    await runTransaction(['reviewCards', 'reviewLogs'], 'readwrite', (tx) => {
      tx.objectStore('reviewCards').clear();
      tx.objectStore('reviewLogs').clear();
    });
  },
  async exportUserData() {
    return exportBackup();
  },
  async importUserData(backup, mode) {
    await importBackup(backup, mode);
  }
};
