import type { LoopDeckPack } from '../core/models';
import type { ImportedPackAsset } from './packTypes';

export interface StagedPackAssets {
  assets: ImportedPackAsset[];
  replaceAssets: boolean;
}

const assetsByExactPack = new WeakMap<LoopDeckPack, StagedPackAssets>();
const assetsByPackId = new Map<string, ImportedPackAsset[]>();

export function stageImportedPackAssets(pack: LoopDeckPack, assets: ImportedPackAsset[]): void {
  assetsByExactPack.set(pack, { assets, replaceAssets: true });
  assetsByPackId.set(pack.packId, assets);
}

export function stageMergedPackAssets(sourcePack: LoopDeckPack, mergedPack: LoopDeckPack): void {
  const sourceAssets = assetsByExactPack.get(sourcePack)?.assets ?? assetsByPackId.get(sourcePack.packId);
  if (!sourceAssets) return;

  const assets = sourceAssets.map((asset) => ({ ...asset, packId: mergedPack.packId }));
  assetsByExactPack.set(mergedPack, { assets, replaceAssets: false });
}

export function takeStagedPackAssets(pack: LoopDeckPack): StagedPackAssets | undefined {
  const exact = assetsByExactPack.get(pack);
  if (exact) {
    assetsByExactPack.delete(pack);
    assetsByPackId.delete(pack.packId);
    return exact;
  }

  const mergedAssets = assetsByPackId.get(pack.packId);
  if (!mergedAssets) return undefined;
  assetsByPackId.delete(pack.packId);
  return { assets: mergedAssets, replaceAssets: false };
}
