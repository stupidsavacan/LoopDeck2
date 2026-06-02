import type { Attempt, LoopDeckPack } from '../core/models';

const DB_NAME = 'loopdeck-db';
const DB_VERSION = 1;

export interface LoopDeckDb {
  addAttempt(attempt: Attempt): Promise<void>;
  getAttempts(): Promise<Attempt[]>;
  clearAttempts(): Promise<void>;
  setBookmark(questionId: string, enabled: boolean): Promise<void>;
  getBookmarks(): Promise<string[]>;
  saveImportedPack(pack: LoopDeckPack): Promise<void>;
  getImportedPacks(): Promise<LoopDeckPack[]>;
  deleteImportedPack(packId: string): Promise<void>;
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

  async saveImportedPack(pack) {
    await transaction('packs', 'readwrite', (store) => store.put(pack));
  },

  async getImportedPacks() {
    return getAll<LoopDeckPack>('packs');
  },

  async deleteImportedPack(packId) {
    await transaction('packs', 'readwrite', (store) => store.delete(packId));
  }
};
