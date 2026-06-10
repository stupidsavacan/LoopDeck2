import type { Question } from '../core/models';
import { db, type StoredPackAsset } from '../storage/db';
import { getQuestionPackId, type ResolvedPackView } from './packResolver';

export interface PackAssetReader {
  getPackAsset(packId: string, path: string): Promise<StoredPackAsset | undefined>;
}

export type QuestionImageAssetResolver = (question: Question) => Promise<string | undefined>;

let activePackView: ResolvedPackView | undefined;

export function createQuestionImageAssetResolver(
  packView: ResolvedPackView,
  assetReader: PackAssetReader = db
): QuestionImageAssetResolver {
  return async (question) => {
    if (!question.imageAsset) return undefined;
    const packId = getQuestionPackId(packView, question.id);
    if (!packId) return undefined;
    return (await assetReader.getPackAsset(packId, question.imageAsset))?.dataUrl;
  };
}

export function setActivePackAssetView(packView: ResolvedPackView): void {
  activePackView = packView;
}

export const resolveActiveQuestionImageAsset: QuestionImageAssetResolver = async (question) => {
  if (!activePackView) return undefined;
  return createQuestionImageAssetResolver(activePackView)(question);
};
