import type { PackValidationIssue } from './packTypes';

export const MAX_IMPORT_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_ZIP_ENTRY_COUNT = 256;
export const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
export const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 12 * 1024 * 1024;
export const MAX_JSON_ENTRY_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_BACKUP_COLLECTION_ITEMS = 100_000;

function formatMiB(bytes: number): string {
  return `${Math.ceil(bytes / (1024 * 1024))} MiB`;
}

export function validateImportFileSize(file: File): PackValidationIssue[] {
  if (file.size <= MAX_IMPORT_FILE_BYTES) return [];
  return [{
    level: 'error',
    message: `Import file is too large. Maximum size is ${formatMiB(MAX_IMPORT_FILE_BYTES)}.`,
    path: file.name
  }];
}

export function estimateBase64DecodedBytes(value: string): number {
  const comma = value.indexOf(',');
  const encoded = comma >= 0 ? value.slice(comma + 1) : value;
  if (!encoded) return 0;
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  return Math.floor((encoded.length * 3) / 4) - padding;
}
