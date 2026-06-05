import type { Attempt, LoopDeckPack, ReviewCard, ReviewLog } from '../core/models';

const DB_NAME = 'loopdeck-db';
const DB_VERSION = 2;

export interface LoopDeckBackup {
  loopDeckBackupVersion: 1;
  exportedAt: string;
  attempts: Attempt[];
  bookmarks: string[];
  importedPacks: LoopDeckPack[];
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
  getImportedPacks(): Promise<LoopDeckPack[]>;
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('attempts')) db.createObjectStore('attempts', { keyPath: 'attemptId' });
      if (!db.objectStoreNames.contains('bookmarks')) db.createObjectStore('bookmarks', { keyPath: 'questionId' });
      if (!db.objectStoreNames.contains('packs')) db.createObjectStore('packs', { keyPath: 'packId' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('reviewCards')) db.createObjectStore('reviewCards', { keyPath: 'questionId' });
      if (!db.objectStoreNames.contains('reviewLogs')) db.createObjectStore('reviewLogs', { keyPath: 'reviewLogId' });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction<T>(storeName: string, mode: IDBTransactionMode, task: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = task(store);

    tx.oncomplete = () => resolve(request ? (request.result as T) : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const result = await transaction<T[]>(storeName, 'readonly', (store) => store.getAll());
  return result ?? [];
}

async function deleteAttemptsWhere(predicate: (attempt: Attempt) => boolean): Promise<void> {
  const database = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('attempts', 'readwrite');
    const store = tx.objectStore('attempts');
    const request = store.getAll();
    request.onsuccess = () => {
      for (const attempt of request.result as Attempt[]) {
        if (predicate(attempt)) store.delete(attempt.attemptId);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function validateBackup(backup: LoopDeckBackup): void {
  if (backup.loopDeckBackupVersion !== 1) throw new Error('Unsupported LoopDeck backup version.');
  if (!Array.isArray(backup.attempts) || !Array.isArray(backup.bookmarks) || !Array.isArray(backup.importedPacks)) {
    throw new Error('LoopDeck backup is missing required arrays.');
  }
  if (backup.reviewCards !== undefined && !Array.isArray(backup.reviewCards)) {
    throw new Error('LoopDeck backup reviewCards must be an array when present.');
  }
  if (backup.reviewLogs !== undefined && !Array.isArray(backup.reviewLogs)) {
    throw new Error('LoopDeck backup reviewLogs must be an array when present.');
  }
}

export const db: LoopDeckDb = {
  async addAttempt(attempt) {
    await transaction('attempts', 'readwrite', (store) => store.put(attempt));
  },

  async getAttempts() {
    return getAll<Attempt>('attempts');
  },

  async clearAttempts() {
    await transaction('attempts', 'readwrite', (store) => store.clear());
  },

  async clearWrongAttempts() {
    await deleteAttemptsWhere((attempt) => attempt.result !== 'correct');
  },

  async setBookmark(questionId, enabled) {
    if (enabled) {
      await transaction('bookmarks', 'readwrite', (store) => store.put({ questionId, createdAt: new Date().toISOString() }));
      return;
    }
    await transaction('bookmarks', 'readwrite', (store) => store.delete(questionId));
  },

  async getBookmarks() {
    const rows = await getAll<{ questionId: string }>('bookmarks');
    return rows.map((row) => row.questionId);
  },

  async clearBookmarks() {
    await transaction('bookmarks', 'readwrite', (store) => store.clear());
  },

  async saveImportedPack(pack) {
    await transaction('packs', 'readwrite', (store) => store.put(pack));
  },

  async getImportedPacks() {
    return getAll<LoopDeckPack>('packs');
  },

  async deleteImportedPack(packId) {
    await transaction('packs', 'readwrite', (store) => store.delete(packId));
  },

  async getReviewCards() {
    return getAll<ReviewCard>('reviewCards');
  },

  async getReviewCard(questionId) {
    const result = await transaction<ReviewCard>('reviewCards', 'readonly', (store) => store.get(questionId));
    return result as ReviewCard | undefined;
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
    const logs = await this.getReviewLogs();
    return logs.filter((log) => log.questionId === questionId).sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt));
  },

  async clearReviewData() {
    await transaction('reviewCards', 'readwrite', (store) => store.clear());
    await transaction('reviewLogs', 'readwrite', (store) => store.clear());
  },

  async exportUserData() {
    return {
      loopDeckBackupVersion: 1,
      exportedAt: new Date().toISOString(),
      attempts: await this.getAttempts(),
      bookmarks: await this.getBookmarks(),
      importedPacks: await this.getImportedPacks(),
      reviewCards: await this.getReviewCards(),
      reviewLogs: await this.getReviewLogs()
    };
  },

  async importUserData(backup) {
    validateBackup(backup);
    for (const attempt of backup.attempts) await this.addAttempt(attempt);
    for (const questionId of backup.bookmarks) await this.setBookmark(questionId, true);
    for (const pack of backup.importedPacks) await this.saveImportedPack(pack);
    for (const card of backup.reviewCards ?? []) await this.putReviewCard(card);
    for (const log of backup.reviewLogs ?? []) await this.putReviewLog(log);
  }
};
