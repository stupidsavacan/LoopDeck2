import type { LoopDeckPack } from '../core/models';
import type { ImportedPackAsset } from './packTypes';

export interface StagedPackAssets {
  assets: ImportedPackAsset[];
  replaceAssets: boolean;
}

const assetsByExactPack = new WeakMap<LoopDeckPack, ImportedPackAsset[]>();
const assetsByPackId = new Map<string, ImportedPackAsset[]>();

export function stageImportedPackAssets(pack: LoopDeckPack, assets: ImportedPackAsset[]): void {
  assetsByExactPack.set(pack, assets);
  assetsByPackId.set(pack.packId, assets);
}

export function takeStagedPackAssets(pack: LoopDeckPack): StagedPackAssets | undefined {
  const exactAssets = assetsByExactPack.get(pack);
  if (exactAssets) {
    assetsByExactPack.delete(pack);
    assetsByPackId.delete(pack.packId);
    return { assets: exactAssets, replaceAssets: true };
  }

  const mergedAssets = assetsByPackId.get(pack.packId);
  if (!mergedAssets) return undefined;
  assetsByPackId.delete(pack.packId);
  return { assets: mergedAssets, replaceAssets: false };
}
