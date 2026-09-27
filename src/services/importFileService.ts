import { importLoopDeckJson, importLoopDeckZip } from '../packs/zipImporter';
import type { PackValidationResult } from '../packs/packTypes';
import type { LoopDeckBackup } from '../storage/db';

export type ImportFileResult =
  | { kind: 'backup'; backup: LoopDeckBackup }
  | { kind: 'pack'; result: PackValidationResult };

export function isBackupPayload(value: unknown): value is LoopDeckBackup {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.loopDeckBackupVersion === 1
    && Array.isArray(record.attempts)
    && Array.isArray(record.bookmarks)
    && Array.isArray(record.importedPacks);
}

export async function readImportFile(file: File): Promise<ImportFileResult> {
  if (file.name.endsWith('.zip') || file.name.endsWith('.loopdeck.zip')) {
    return { kind: 'pack', result: await importLoopDeckZip(file) };
  }

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (isBackupPayload(parsed)) return { kind: 'backup', backup: parsed };

  const jsonFile = new File([text], file.name, { type: file.type || 'application/json' });
  return { kind: 'pack', result: await importLoopDeckJson(jsonFile) };
}
