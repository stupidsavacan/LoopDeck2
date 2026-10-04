import type { Attempt, LoopDeckPack, ReviewCard, ReviewLog } from '../core/models';
import type { ImportedPackAsset } from '../packs/packTypes';

export interface StoredPackAsset extends ImportedPackAsset {
  assetId: string;
}

export interface BackupSnapshot {
  exportedAt: string;
  attempts: Attempt[];
  bookmarks: string[];
  importedPacks: LoopDeckPack[];
  importedPackAssets?: StoredPackAsset[];
  reviewCards?: ReviewCard[];
  reviewLogs?: ReviewLog[];
}

export interface LoopDeckBackup extends BackupSnapshot {
  loopDeckBackupVersion: 1;
}

export interface LoopDeck3MigrationBackup extends BackupSnapshot {
  format: 'loopdeck3.backup';
  schema: 1;
}

export type BackupImportMode = 'merge' | 'replace';
