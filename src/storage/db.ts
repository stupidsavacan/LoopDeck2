import type { Attempt, LoopDeckPack, ReviewCard, ReviewLog } from '../core/models';
import { takeStagedPackAssets } from '../packs/importedAssetStaging';
import type { ImportedPackAsset } from '../packs/packTypes';

const DB_NAME = 'loopdeck-db';
const DB_VERSION = 4;

const USER_DATA_STORES = ['attempts', 'bookmarks', 'packs', 'packAssets', 'reviewCards', 'reviewLogs'] as const;
export type BackupImportMode = 'merge' | 'replace';

export interface StoredPackAsset extends ImportedPackAsset { assetId: string; }

export interface LoopDeckBackup {
  loopDeckBackupVersion: 1;
  exportedAt: string;
  attempts: Attempt[];
  bookmarks: string[];
  importedPacks: LoopDeckPack[];
  importedPackAssets?: StoredPackAsset[];
  reviewCards?: ReviewCard[];
  reviewLogs?: ReviewLog[];
}

export interface LoopDeckDb {
  addAttempt(attempt: Attempt): Promise<void>;
  saveAttemptWithReview(attempt: Attempt, card: ReviewCard, log: ReviewLog): Promise<void>;
  getAttempts(): Promise<Attempt[]>;
  clearAttempts(): Promise<void>;
  clearWrongAttempts(): Promise<void>;
  setBookmark(questionId: string, enabled: boolean): Promise<void>;
  getBookmarks(): Promise<string[]>;
  clearBookmarks(): Promise<void>;
  saveImportedPack(pack: LoopDeckPack): Promise<void>;
  saveImportedPackWithAssets(pack: LoopDeckPack, assets: ImportedPackAsset[], replaceAssets?: boolean): Promise<void>;
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
  importUserData(backup: LoopDeckBackup, mode: BackupImportMode): Promise<void>;
}

export function packAssetId(packId: string, path: string): string { return `${packId}:${path}`; }

function storedAsset(packId: string, asset: ImportedPackAsset): StoredPackAsset {
  return { assetId: packAssetId(packId, asset.path), packId, path: asset.path, mimeType: asset.mimeType, dataUrl: asset.dataUrl };
}

function ensureStore(database: IDBDatabase, transaction: IDBTransaction, name: string, keyPath: string): IDBObjectStore {
  return database.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : database.createObjectStore(name, { keyPath });
}

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string): void {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
}

let databaseConnection: IDBDatabase | undefined;
let databasePromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  if (databaseConnection) return Promise.resolve(databaseConnection);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const upgradeTransaction = request.transaction;
      if (!upgradeTransaction) throw new Error('IndexedDB upgrade transaction is unavailable.');

      const attempts = ensureStore(database, upgradeTransaction, 'attempts', 'attemptId');
      ensureIndex(attempts, 'byQuestionId', 'questionId');
      ensureIndex(attempts, 'byResult', 'result');

      ensureStore(database, upgradeTransaction, 'bookmarks', 'questionId');
      ensureStore(database, upgradeTransaction, 'packs', 'packId');

      const packAssets = ensureStore(database, upgradeTransaction, 'packAssets', 'assetId');
      ensureIndex(packAssets, 'byPackId', 'packId');

      ensureStore(database, upgradeTransaction, 'settings', 'key');
      ensureStore(database, upgradeTransaction, 'reviewCards', 'questionId');

      const reviewLogs = ensureStore(database, upgradeTransaction, 'reviewLogs', 'reviewLogId');
      ensureIndex(reviewLogs, 'byQuestionId', 'questionId');
      ensureIndex(reviewLogs, 'byReviewedAt', 'reviewedAt');
    };
    request.onsuccess = () => {
      const database = request.result;
      databaseConnection = database;
      databasePromise = undefined;
      database.onversionchange = () => {
        database.close();
        if (databaseConnection === database) databaseConnection = undefined;
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error('Failed to open LoopDeck IndexedDB.'));
    };
  });
  return databasePromise;
}

async function runTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  task: (transaction: IDBTransaction) => T
): Promise<T> {
  const database = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(storeNames, mode);
    let result: T;
    try {
      result = task(tx);
    } catch (error) {
      try { tx.abort(); } catch { /* already inactive */ }
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  const request = await runTransaction<IDBRequest<T> | void>(storeName, mode, (tx) => task(tx.objectStore(storeName)));
  return request ? request.result : undefined;
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const result = await transaction<T[]>(storeName, 'readonly', (store) => store.getAll());
  return Array.isArray(result) ? result : [];
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

async function savePackWithAssets(pack: LoopDeckPack, assets: ImportedPackAsset[], replaceAssets: boolean): Promise<void> {
  await runTransaction(['packs', 'packAssets'], 'readwrite', (tx) => {
    tx.objectStore('packs').put(pack);
    const assetStore = tx.objectStore('packAssets');
    const writeAssets = () => {
      for (const asset of assets) assetStore.put(storedAsset(pack.packId, asset));
    };

    if (!replaceAssets) {
      const index = assetStore.index('byPackId');
      const request = index.getAllKeys(pack.packId);
      request.onsuccess = () => {
        const existingIds = new Set(request.result.map(String));
        for (const asset of assets) {
          const stored = storedAsset(pack.packId, asset);
          if (!existingIds.has(stored.assetId)) assetStore.put(stored);
        }
      };
      return;
    }

    const request = assetStore.index('byPackId').openKeyCursor(IDBKeyRange.only(pack.packId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        assetStore.delete(cursor.primaryKey);
        cursor.continue();
        return;
      }
      writeAssets();
    };
  });
}

async function deletePackAndAssets(packId: string): Promise<void> {
  await runTransaction(['packs', 'packAssets'], 'readwrite', (tx) => {
    tx.objectStore('packs').delete(packId);
    const assetStore = tx.objectStore('packAssets');
    const request = assetStore.index('byPackId').openKeyCursor(IDBKeyRange.only(packId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      assetStore.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

function validateBackup(backup: LoopDeckBackup): void {
  if (backup.loopDeckBackupVersion !== 1) throw new Error('Unsupported LoopDeck backup version.');
  if (!Array.isArray(backup.attempts) || !Array.isArray(backup.bookmarks) || !Array.isArray(backup.importedPacks)) throw new Error('LoopDeck backup is missing required arrays.');
  if (backup.importedPackAssets !== undefined && !Array.isArray(backup.importedPackAssets)) throw new Error('LoopDeck backup importedPackAssets must be an array when present.');
  if (backup.reviewCards !== undefined && !Array.isArray(backup.reviewCards)) throw new Error('LoopDeck backup reviewCards must be an array when present.');
  if (backup.reviewLogs !== undefined && !Array.isArray(backup.reviewLogs)) throw new Error('LoopDeck backup reviewLogs must be an array when present.');
}

async function importBackup(backup: LoopDeckBackup, mode: BackupImportMode): Promise<void> {
  validateBackup(backup);
  await runTransaction([...USER_DATA_STORES], 'readwrite', (tx) => {
    if (mode === 'replace') {
      for (const storeName of USER_DATA_STORES) tx.objectStore(storeName).clear();
    }

    const attempts = tx.objectStore('attempts');
    for (const attempt of backup.attempts) attempts.put(attempt);

    const bookmarks = tx.objectStore('bookmarks');
    const importedAt = new Date().toISOString();
    for (const questionId of backup.bookmarks) bookmarks.put({ questionId, createdAt: importedAt });

    const packs = tx.objectStore('packs');
    for (const pack of backup.importedPacks) packs.put(pack);

    const packAssets = tx.objectStore('packAssets');
    for (const asset of backup.importedPackAssets ?? []) packAssets.put(asset);

    const reviewCards = tx.objectStore('reviewCards');
    for (const card of backup.reviewCards ?? []) reviewCards.put(card);

    const reviewLogs = tx.objectStore('reviewLogs');
    for (const log of backup.reviewLogs ?? []) reviewLogs.put(log);
  });
}

export const db: LoopDeckDb = {
  async addAttempt(attempt) { await transaction('attempts', 'readwrite', (store) => store.put(attempt)); },
  async saveAttemptWithReview(attempt, card, log) {
    await runTransaction(['attempts', 'reviewCards', 'reviewLogs'], 'readwrite', (tx) => {
      tx.objectStore('attempts').put(attempt);
      tx.objectStore('reviewCards').put(card);
      tx.objectStore('reviewLogs').put(log);
    });
  },
  async getAttempts() { return getAll<Attempt>('attempts'); },
  async clearAttempts() { await transaction('attempts', 'readwrite', (store) => store.clear()); },
  async clearWrongAttempts() { await deleteAttemptsByResult(['wrong', 'revealed']); },
  async setBookmark(questionId, enabled) {
    if (enabled) await transaction('bookmarks', 'readwrite', (store) => store.put({ questionId, createdAt: new Date().toISOString() }));
    else await transaction('bookmarks', 'readwrite', (store) => store.delete(questionId));
  },
  async getBookmarks() { return (await getAll<{ questionId: string }>('bookmarks')).map((row) => row.questionId); },
  async clearBookmarks() { await transaction('bookmarks', 'readwrite', (store) => store.clear()); },
  async saveImportedPack(pack) {
    const staged = takeStagedPackAssets(pack);
    if (staged) await savePackWithAssets(pack, staged.assets, staged.replaceAssets);
    else await transaction('packs', 'readwrite', (store) => store.put(pack));
  },
  async saveImportedPackWithAssets(pack, assets, replaceAssets = true) { await savePackWithAssets(pack, assets, replaceAssets); },
  async getImportedPacks() { return getAll<LoopDeckPack>('packs'); },
  async getImportedPackAssets() { return getAll<StoredPackAsset>('packAssets'); },
  async getPackAsset(packId, path) {
    return await transaction<StoredPackAsset>('packAssets', 'readonly', (store) => store.get(packAssetId(packId, path))) as StoredPackAsset | undefined;
  },
  async deleteImportedPack(packId) { await deletePackAndAssets(packId); },
  async getReviewCards() { return getAll<ReviewCard>('reviewCards'); },
  async getReviewCard(questionId) { return await transaction<ReviewCard>('reviewCards', 'readonly', (store) => store.get(questionId)) as ReviewCard | undefined; },
  async putReviewCard(card) { await transaction('reviewCards', 'readwrite', (store) => store.put(card)); },
  async putReviewLog(log) { await transaction('reviewLogs', 'readwrite', (store) => store.put(log)); },
  async getReviewLogs() { return getAll<ReviewLog>('reviewLogs'); },
  async getReviewLogsForQuestion(questionId) {
    const request = await runTransaction<IDBRequest<ReviewLog[]>>('reviewLogs', 'readonly', (tx) => tx.objectStore('reviewLogs').index('byQuestionId').getAll(questionId));
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
      loopDeckBackupVersion: 1, exportedAt: new Date().toISOString(), attempts: await this.getAttempts(), bookmarks: await this.getBookmarks(),
      importedPacks: await this.getImportedPacks(), importedPackAssets: await this.getImportedPackAssets(), reviewCards: await this.getReviewCards(), reviewLogs: await this.getReviewLogs()
    };
  },
  async importUserData(backup, mode) { await importBackup(backup, mode); }
};
