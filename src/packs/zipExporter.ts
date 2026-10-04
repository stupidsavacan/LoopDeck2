import JSZip from 'jszip';
import type { LoopDeckPack } from '../core/models';
import { db } from '../storage/db';
import { extensionOf, isSafeImageAssetRef, isSafeImageDataUrl } from './assetSafety';
import type { ImportedPackAsset } from './packTypes';

export interface LoopDeckZipFiles {
  manifest: {
    packVersion: LoopDeckPack['packVersion'];
    packId: LoopDeckPack['packId'];
    title: LoopDeckPack['title'];
    description?: LoopDeckPack['description'];
    folders: LoopDeckPack['folders'];
  };
  modules: LoopDeckPack['modules'];
  questions: LoopDeckPack['questions'];
}

function stringifyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assetBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function createZip(pack: LoopDeckPack, assets: ImportedPackAsset[] = []): JSZip {
  const zip = new JSZip();
  const files = createLoopDeckZipFiles(pack);

  zip.file('manifest.json', stringifyJson(files.manifest));
  zip.file('modules.json', stringifyJson(files.modules));
  zip.file('questions.json', stringifyJson(files.questions));

  const referencedPaths = new Set(pack.questions.map((question) => question.imageAsset).filter((path): path is string => Boolean(path)));
  for (const asset of assets) {
    if (asset.packId !== pack.packId || !referencedPaths.has(asset.path)) continue;
    if (!isSafeImageAssetRef(asset.path) || !isSafeImageDataUrl(asset.dataUrl)) continue;
    zip.file(asset.path.replace(/\\/g, '/'), assetBase64(asset.dataUrl), { base64: true });
  }

  return zip;
}

export function createLoopDeckZipFiles(pack: LoopDeckPack): LoopDeckZipFiles {
  const manifest: LoopDeckZipFiles['manifest'] = {
    packVersion: pack.packVersion,
    packId: pack.packId,
    title: pack.title,
    folders: pack.folders
  };

  if (pack.description) manifest.description = pack.description;

  return {
    manifest,
    modules: pack.modules,
    questions: pack.questions
  };
}

export function stringifyLoopDeckJson(pack: LoopDeckPack): string {
  if (pack.questions.some((question) => question.imageAsset))
    throw new Error('画像ファイルを含む教材はZIPで書き出してください。JSONでは画像を保存できません。');
  return stringifyJson(pack);
}

async function resolveExportAssets(pack: LoopDeckPack, assets?: ImportedPackAsset[]): Promise<ImportedPackAsset[]> {
  if (!pack.questions.some((question) => question.imageAsset)) return [];
  const available = assets ?? (await db.getImportedPackAssets());
  const resolved: ImportedPackAsset[] = [];
  const globalWithAssets = globalThis as typeof globalThis & { __LOOPDECK_EMBEDDED_ASSETS__?: Record<string, string> };
  const paths = new Set(pack.questions.map((question) => question.imageAsset).filter((path): path is string => Boolean(path)));
  for (const path of paths) {
    if (!isSafeImageAssetRef(path)) throw new Error(`Unsafe image reference: ${path}`);
    const stored = available.find((asset) => asset.packId === pack.packId && asset.path === path);
    let dataUrl = stored?.dataUrl;
    if (!dataUrl && pack.packId === 'loopdeck-builtin-v1') {
      dataUrl = globalWithAssets.__LOOPDECK_EMBEDDED_ASSETS__?.[path];
      if (!dataUrl) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Image could not be exported: ${path}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const mime = extensionOf(path) === '.png' ? 'image/png' : extensionOf(path) === '.webp' ? 'image/webp' : 'image/jpeg';
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        dataUrl = `data:${mime};base64,${btoa(binary)}`;
      }
    }
    if (!dataUrl || !isSafeImageDataUrl(dataUrl)) throw new Error(`画像ファイルがないか破損しています。ZIPを書き出せません: ${path}`);
    const expectedMime = extensionOf(path) === '.png' ? 'image/png' : extensionOf(path) === '.webp' ? 'image/webp' : 'image/jpeg';
    if (!dataUrl.toLowerCase().startsWith(`data:${expectedMime};base64,`))
      throw new Error(`Image type does not match its filename: ${path}`);
    resolved.push({ packId: pack.packId, path, mimeType: dataUrl.slice(5, dataUrl.indexOf(';')), dataUrl });
  }
  return resolved;
}

export async function createLoopDeckZipBlob(pack: LoopDeckPack, assets?: ImportedPackAsset[]): Promise<Blob> {
  const availableAssets = await resolveExportAssets(pack, assets);
  return createZip(pack, availableAssets).generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

export async function createLoopDeckZipBytes(pack: LoopDeckPack, assets?: ImportedPackAsset[]): Promise<Uint8Array> {
  return createZip(pack, await resolveExportAssets(pack, assets)).generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

export function makePackFileStem(pack: LoopDeckPack): string {
  const candidate = pack.packId || pack.title || 'loopdeck-pack';
  const stem = candidate
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return stem || 'loopdeck-pack';
}
