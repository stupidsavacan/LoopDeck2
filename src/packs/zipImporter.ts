import JSZip from 'jszip';
import type { LoopDeckPack } from '../core/models';
import { extensionOf, isSafeImageAssetRef } from './assetSafety';
import { stageImportedPackAssets } from './importedAssetStaging';
import type { ImportedPackAsset, PackValidationIssue, PackValidationResult } from './packTypes';
import { validatePack, validatePackFiles } from './packValidator';

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function validateContainerFile(file: File): PackValidationIssue[] {
  return validatePackFiles([file.name]);
}

async function readJson<T>(zip: JSZip, path: string): Promise<T | undefined> {
  const file = zip.file(path);
  if (!file) return undefined;
  const text = await file.async('string');
  return JSON.parse(text) as T;
}

function zipLookupPath(path: string): string {
  return path.replace(/\\/g, '/');
}

async function readReferencedAssets(zip: JSZip, pack: LoopDeckPack, issues: PackValidationIssue[]): Promise<ImportedPackAsset[]> {
  const assets: ImportedPackAsset[] = [];
  const referencedPaths = new Set(pack.questions.map((question) => question.imageAsset).filter((path): path is string => Boolean(path)));

  for (const path of referencedPaths) {
    if (!isSafeImageAssetRef(path)) {
      issues.push({ level: 'warning', message: 'Unsafe or unsupported image asset reference was not imported.', path });
      continue;
    }

    const zipFile = zip.file(zipLookupPath(path));
    if (!zipFile || zipFile.dir) {
      issues.push({ level: 'warning', message: 'Referenced image asset was not found in the ZIP.', path });
      continue;
    }

    const mimeType = IMAGE_MIME_TYPES[extensionOf(path)];
    if (!mimeType) {
      issues.push({ level: 'warning', message: 'Referenced image asset type is not supported.', path });
      continue;
    }

    const base64 = await zipFile.async('base64');
    assets.push({
      packId: pack.packId,
      path,
      mimeType,
      dataUrl: `data:${mimeType};base64,${base64}`
    });
  }

  return assets;
}

export async function importLoopDeckZip(file: File): Promise<PackValidationResult> {
  const fileIssues = validateContainerFile(file);
  if (fileIssues.some((issue) => issue.level === 'error')) return { ok: false, issues: fileIssues };

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = Object.values(zip.files).filter((entry) => !entry.dir).map((entry) => entry.name);
  const issues: PackValidationIssue[] = [...fileIssues, ...validatePackFiles(paths)];

  const manifest = await readJson<Record<string, unknown>>(zip, 'manifest.json');
  const modules = await readJson<unknown[]>(zip, 'modules.json');
  const questions = await readJson<unknown[]>(zip, 'questions.json');

  if (!manifest) issues.push({ level: 'error', message: 'manifest.json is required.' });
  if (!modules) issues.push({ level: 'error', message: 'modules.json is required.' });
  if (!questions) issues.push({ level: 'error', message: 'questions.json is required.' });

  if (issues.some((issue) => issue.level === 'error') || !manifest || !modules || !questions) return { ok: false, issues };

  const pack: LoopDeckPack = {
    packVersion: Number(manifest.packVersion),
    packId: String(manifest.packId ?? ''),
    title: String(manifest.title ?? ''),
    description: typeof manifest.description === 'string' ? manifest.description : undefined,
    folders: Array.isArray(manifest.folders) ? (manifest.folders as LoopDeckPack['folders']) : [],
    modules: modules as LoopDeckPack['modules'],
    questions: questions as LoopDeckPack['questions']
  };

  const packResult = validatePack(pack);
  if (!packResult.ok || !packResult.pack) return { ok: false, issues: [...issues, ...packResult.issues] };

  const assets = await readReferencedAssets(zip, packResult.pack, issues);
  stageImportedPackAssets(packResult.pack, assets);
  return {
    ok: !issues.some((issue) => issue.level === 'error'),
    issues: [...issues, ...packResult.issues],
    pack: packResult.pack,
    assets
  };
}

export async function importLoopDeckJson(file: File): Promise<PackValidationResult> {
  const issues = validateContainerFile(file);
  if (issues.some((issue) => issue.level === 'error')) return { ok: false, issues };

  const text = await file.text();
  const json = JSON.parse(text) as unknown;
  const packResult = validatePack(json);
  if (packResult.pack) stageImportedPackAssets(packResult.pack, []);
  return {
    ok: packResult.ok && !issues.some((issue) => issue.level === 'error'),
    issues: [...issues, ...packResult.issues],
    pack: packResult.pack
  };
}
