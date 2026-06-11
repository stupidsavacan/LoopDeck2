import type { Attempt, LoopDeckPack, ReviewCard, ReviewLog } from '../core/models';
import { takeStagedPackAssets } from '../packs/importedAssetStaging';
import type { ImportedPackAsset } from '../packs/packTypes';

const DB_NAME = 'loopdeck-db';
const DB_VERSION = 3;

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
  importUserData(backup: LoopDeckBackup): Promise<void>;
}

export function packAssetId(packId: string, path: string): string { return `${packId}:${path}`; }

function storedAsset(packId: string, asset: ImportedPackAsset): StoredPackAsset {
  return { assetId: packAssetId(packId, asset.path), packId, path: asset.path, mimeType: asset.mimeType, dataUrl: asset.dataUrl };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('attempts')) database.createObjectStore('attempts', { keyPath: 'attemptId' });
      if (!database.objectStoreNames.contains('bookmarks')) database.createObjectStore('bookmarks', { keyPath: 'questionId' });
      if (!database.objectStoreNames.contains('packs')) database.createObjectStore('packs', { keyPath: 'packId' });
      if (!database.objectStoreNames.contains('packAssets')) database.createObjectStore('packAssets', { keyPath: 'assetId' });
      if (!database.objectStoreNames.contains('settings')) database.createObjectStore('settings', { keyPath: 'key' });
      if (!database.objectStoreNames.contains('reviewCards')) database.createObjectStore('reviewCards', { keyPath: 'questionId' });
      if (!database.objectStoreNames.contains('reviewLogs')) database.createObjectStore('reviewLogs', { keyPath: 'reviewLogId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  const database = await openDb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const request = task(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request ? (request.result as T) : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  return (await transaction<T[]>(storeName, 'readonly', (store) => store.getAll())) ?? [];
}

async function deleteAttemptsWhere(predicate: (attempt: Attempt) => boolean): Promise<void> {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('attempts', 'readwrite');
    const store = tx.objectStore('attempts');
    const request = store.getAll();
    request.onsuccess = () => {
      for (const attempt of request.result as Attempt[]) if (predicate(attempt)) store.delete(attempt.attemptId);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function savePackWithAssets(pack: LoopDeckPack, assets: ImportedPackAsset[], replaceAssets: boolean): Promise<void> {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['packs', 'packAssets'], 'readwrite');
    tx.objectStore('packs').put(pack);
    const assetStore = tx.objectStore('packAssets');
    const request = assetStore.getAll();
    request.onsuccess = () => {
      const existing = request.result as StoredPackAsset[];
      if (replaceAssets) {
        for (const asset of existing) if (asset.packId === pack.packId) assetStore.delete(asset.assetId);
        for (const asset of assets) assetStore.put(storedAsset(pack.packId, asset));
        return;
      }

      const existingIds = new Set(existing.map((asset) => asset.assetId));
      for (const asset of assets) {
        const stored = storedAsset(pack.packId, asset);
        if (existingIds.has(stored.assetId)) continue;
        assetStore.put(stored);
        existingIds.add(stored.assetId);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function deletePackAndAssets(packId: string): Promise<void> {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(['packs', 'packAssets'], 'readwrite');
    tx.objectStore('packs').delete(packId);
    const assetStore = tx.objectStore('packAssets');
    const request = assetStore.getAll();
    request.onsuccess = () => {
      for (const asset of request.result as StoredPackAsset[]) if (asset.packId === packId) assetStore.delete(asset.assetId);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function validateBackup(backup: LoopDeckBackup): void {
  if (backup.loopDeckBackupVersion !== 1) throw new Error('Unsupported LoopDeck backup version.');
  if (!Array.isArray(backup.attempts) || !Array.isArray(backup.bookmarks) || !Array.isArray(backup.importedPacks)) throw new Error('LoopDeck backup is missing required arrays.');
  if (backup.importedPackAssets !== undefined && !Array.isArray(backup.importedPackAssets)) throw new Error('LoopDeck backup importedPackAssets must be an array when present.');
  if (backup.reviewCards !== undefined && !Array.isArray(backup.reviewCards)) throw new Error('LoopDeck backup reviewCards must be an array when present.');
  if (backup.reviewLogs !== undefined && !Array.isArray(backup.reviewLogs)) throw new Error('LoopDeck backup reviewLogs must be an array when present.');
}

export const db: LoopDeckDb = {
  async addAttempt(attempt) { await transaction('attempts', 'readwrite', (store) => store.put(attempt)); },
  async getAttempts() { return getAll<Attempt>('attempts'); },
  async clearAttempts() { await transaction('attempts', 'readwrite', (store) => store.clear()); },
  async clearWrongAttempts() { await deleteAttemptsWhere((attempt) => attempt.result !== 'correct'); },
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
  async getReviewLogsForQuestion(questionId) { return (await this.getReviewLogs()).filter((log) => log.questionId === questionId).sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt)); },
  async clearReviewData() {
    await transaction('reviewCards', 'readwrite', (store) => store.clear());
    await transaction('reviewLogs', 'readwrite', (store) => store.clear());
  },
  async exportUserData() {
    return {
      loopDeckBackupVersion: 1, exportedAt: new Date().toISOString(), attempts: await this.getAttempts(), bookmarks: await this.getBookmarks(),
      importedPacks: await this.getImportedPacks(), importedPackAssets: await this.getImportedPackAssets(), reviewCards: await this.getReviewCards(), reviewLogs: await this.getReviewLogs()
    };
  },
  async importUserData(backup) {
    validateBackup(backup);
    for (const attempt of backup.attempts) await this.addAttempt(attempt);
    for (const questionId of backup.bookmarks) await this.setBookmark(questionId, true);
    for (const pack of backup.importedPacks) {
      const assets = (backup.importedPackAssets ?? []).filter((asset) => asset.packId === pack.packId);
      await this.saveImportedPackWithAssets(pack, assets, Boolean(backup.importedPackAssets));
    }
    for (const card of backup.reviewCards ?? []) await this.putReviewCard(card);
    for (const log of backup.reviewLogs ?? []) await this.putReviewLog(log);
  }
};
