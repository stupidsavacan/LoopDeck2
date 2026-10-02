import type { Attempt, LoopDeckPack, ReviewCard, ReviewLog } from '../core/models';
import type { ImportedPackAsset, PackAssetWriteStrategy } from '../packs/packTypes';

import { runTransaction, transaction, getAll } from './indexedDb';
import { installedOrder, putPacksInInstallOrder, savePackWithAssets, deletePackAndAssets, validatedPackForStorage, recoverStoredPacks, packAssetId } from './packStorage';
import { importBackup } from './backupStorage';
import type { BackupImportMode } from './storageTypes';
export type { BackupImportMode } from './storageTypes';
export { packAssetId } from './packStorage';

import type { LoopDeckBackup, StoredPackAsset } from './storageTypes';
export type { LoopDeckBackup, StoredPackAsset } from './storageTypes';

export interface LoopDeckDb {
  addAttempt(attempt: Attempt): Promise<void>;
  saveAttemptWithReview(attempt: Attempt, card: ReviewCard, log: ReviewLog): Promise<void>;
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
  getImportedPackAssets(): Promise<StoredPackAsset[]>;
  getPackAsset(packId: string, path: string): Promise<StoredPackAsset | undefined>;
  deleteImportedPack(packId: string): Promise<void>;
  getReviewCards(): Promise<ReviewCard[]>;
  getReviewCard(questionId: string): Promise<ReviewCard | undefined>;
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
  async saveAttemptWithReview(attempt, card, log) {
    await runTransaction(['attempts', 'reviewCards', 'reviewLogs'], 'readwrite', (tx) => {
      tx.objectStore('attempts').put(attempt);
      tx.objectStore('reviewCards').put(card);
      tx.objectStore('reviewLogs').put(log);
    });
  },
  async getAttempts() {
    return getAll<Attempt>('attempts');
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
    await runTransaction('packs', 'readwrite', (tx) => putPacksInInstallOrder(tx.objectStore('packs'), [normalized]));
  },
  async saveImportedPackWithAssets(pack, assets, strategy) {
    await savePackWithAssets(validatedPackForStorage(pack), assets, strategy);
  },
  async getImportedPacks() {
    const rows = await getAll<unknown>('packs');
    return recoverStoredPacks(rows.sort((left, right) => installedOrder(left) - installedOrder(right)));
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
    return getAll<ReviewCard>('reviewCards');
  },
  async getReviewCard(questionId) {
    return (await transaction<ReviewCard>('reviewCards', 'readonly', (store) => store.get(questionId))) as ReviewCard | undefined;
  },
  async putReviewCard(card) {
    await transaction('reviewCards', 'readwrite', (store) => store.put(card));
  },
  async putReviewLog(log) {
    await transaction('reviewLogs', 'readwrite', (store) => store.put(log));
  },
  async getReviewLogs() {
    return getAll<ReviewLog>('reviewLogs');
  },
  async getReviewLogsForQuestion(questionId) {
    const request = await runTransaction<IDBRequest<ReviewLog[]>>('reviewLogs', 'readonly', (tx) =>
      tx.objectStore('reviewLogs').index('byQuestionId').getAll(questionId)
    );
    return request.result.sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt));
  },
  async clearReviewData() {
    await runTransaction(['reviewCards', 'reviewLogs'], 'readwrite', (tx) => {
      tx.objectStore('reviewCards').clear();
      tx.objectStore('reviewLogs').clear();
    });
  },
  async exportUserData() {
    return {
      loopDeckBackupVersion: 1,
      exportedAt: new Date().toISOString(),
      attempts: await this.getAttempts(),
      bookmarks: await this.getBookmarks(),
      importedPacks: await this.getImportedPacks(),
      importedPackAssets: await this.getImportedPackAssets(),
      reviewCards: await this.getReviewCards(),
      reviewLogs: await this.getReviewLogs()
    };
  },
  async importUserData(backup, mode) {
    await importBackup(backup, mode);
  }
};
