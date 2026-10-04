import { recoverReviewRows } from './reviewRecovery';
import type { ReviewCard } from '../core/models';

const DB_NAME = 'loopdeck-db';
const DB_VERSION = 7;
export const USER_DATA_STORES = ['attempts', 'bookmarks', 'packs', 'packAssets', 'reviewCards', 'reviewLogs'] as const;

function ensureStore(database: IDBDatabase, transaction: IDBTransaction, name: string, keyPath: string): IDBObjectStore {
  return database.objectStoreNames.contains(name) ? transaction.objectStore(name) : database.createObjectStore(name, { keyPath });
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
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (database.objectStoreNames.contains('settings')) database.deleteObjectStore('settings');
      const upgradeTransaction = request.transaction;
      if (!upgradeTransaction) throw new Error('IndexedDB upgrade transaction is unavailable.');
      // Version 7 keeps a durable reset epoch separate from user backup data.
      ensureStore(database, upgradeTransaction, 'contentMetadata', 'key');

      const attempts = ensureStore(database, upgradeTransaction, 'attempts', 'attemptId');
      ensureIndex(attempts, 'byQuestionId', 'questionId');
      ensureIndex(attempts, 'byResult', 'result');

      ensureStore(database, upgradeTransaction, 'bookmarks', 'questionId');
      ensureStore(database, upgradeTransaction, 'packs', 'packId');

      const packAssets = ensureStore(database, upgradeTransaction, 'packAssets', 'assetId');
      ensureIndex(packAssets, 'byPackId', 'packId');

      const reviewCards = database.objectStoreNames.contains('reviewCards')
        ? upgradeTransaction.objectStore('reviewCards')
        : database.createObjectStore('reviewCards', { keyPath: ['questionId', 'questionMode'] });

      const reviewLogs = ensureStore(database, upgradeTransaction, 'reviewLogs', 'reviewLogId');
      ensureIndex(reviewLogs, 'byQuestionId', 'questionId');
      ensureIndex(reviewLogs, 'byReviewedAt', 'reviewedAt');
      // Version 5 repairs record shapes; version 6 also separates study directions.
      if (event.oldVersion < 6) {
        const cards: ReviewCard[] = [];
        recoverReviewRows(reviewCards, cards, reviewCards, undefined, () => {
          if (Array.isArray(reviewCards.keyPath)) return;
          database.deleteObjectStore('reviewCards');
          const directedCards = database.createObjectStore('reviewCards', { keyPath: ['questionId', 'questionMode'] });
          for (const card of cards) directedCards.put(card);
        });
        recoverReviewRows(reviewLogs, []);
        const request = packAssets.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const asset = cursor.value;
          if (typeof asset.packId === 'string' && typeof asset.path === 'string') {
            const assetId = JSON.stringify([asset.packId, asset.path]);
            if (cursor.primaryKey !== assetId) {
              cursor.delete();
              packAssets.put({ ...asset, assetId });
            }
          }
          cursor.continue();
        };
      }
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

export async function runTransaction<T>(
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
      try {
        tx.abort();
      } catch {
        /* already inactive */
      }
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

export async function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  const request = await runTransaction<IDBRequest<T> | void>(storeName, mode, (tx) => task(tx.objectStore(storeName)));
  return request ? request.result : undefined;
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  const result = await transaction<T[]>(storeName, 'readonly', (store) => store.getAll());
  return Array.isArray(result) ? result : [];
}
