import type { Attempt, LoopDeckPack, ReviewCard, ReviewLog } from '../core/models';
import type { ImportedPackAsset } from '../packs/packTypes';

export interface StoredPackAsset extends ImportedPackAsset {
  assetId: string;
}

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

export type BackupImportMode = 'merge' | 'replace';
