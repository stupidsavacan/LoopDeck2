import { importLoopDeckJson, importLoopDeckZip } from '../packs/zipImporter';
import { validateImportFileSize } from '../packs/importLimits';
import type { PackValidationResult } from '../packs/packTypes';
import { looksLikeLoopDeckBackup, validateBackupPayload } from '../storage/backupValidator';
import type { LoopDeckBackup } from '../storage/db';

export type ImportFileResult =
  | { kind: 'backup'; backup: LoopDeckBackup }
  | { kind: 'pack'; result: PackValidationResult };

export async function readImportFile(file: File): Promise<ImportFileResult> {
  validateImportFileSize(file);
  if (file.name.endsWith('.zip')) return { kind: 'pack', result: await importLoopDeckZip(file) };
  const text = await file.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }
  if (looksLikeLoopDeckBackup(parsed)) return { kind: 'backup', backup: validateBackupPayload(parsed) };
  const jsonFile = new File([text], file.name, { type: file.type || 'application/json' });
  return { kind: 'pack', result: await importLoopDeckJson(jsonFile) };
}
