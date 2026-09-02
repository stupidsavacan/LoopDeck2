import type { LoopDeckPack, ModuleInfo, Question } from '../core/models';
import { loadBuiltinPacks } from '../packs/builtinLoader';
import { setActivePackAssetView } from '../packs/packAssetResolver';
import { resolveActiveQuestionImageAsset } from '../packs/packAssetResolver';
import { resolveBuiltinImageAsset } from '../packs/builtinImageAssets';
import {
  getModuleById,
  getQuestionsForModule,
  resolveActivePacks,
  type ResolvedPackView
} from '../packs/packResolver';
import type { ImportedPackAsset } from '../packs/packTypes';
import { db } from '../storage/db';

export class PackGateway {
  private view: ResolvedPackView = resolveActivePacks([]);
  private builtinPackIds = new Set<string>();

  async load(): Promise<ResolvedPackView> {
    const builtin = loadBuiltinPacks();
    this.builtinPackIds = new Set(builtin.map((pack) => pack.packId));
    const packs = [...builtin, ...(await db.getImportedPacks())];
    this.view = resolveActivePacks(packs);
    setActivePackAssetView(this.view);
    return this.view;
  }

  get activeView(): ResolvedPackView { return this.view; }
  get packs(): LoopDeckPack[] { return this.view.packs; }
  get modules(): ModuleInfo[] { return this.view.modules; }
  get questions(): Question[] { return this.view.questions; }
  getModule(moduleId: string): ModuleInfo | undefined { return getModuleById(this.view, moduleId); }
  getQuestion(questionId: string): Question | undefined { return this.view.questionById.get(questionId); }
  getModuleQuestions(moduleId: string): Question[] { return getQuestionsForModule(this.view, moduleId); }
  async resolveQuestionImage(question: Question): Promise<string | undefined> {
    const stored = await resolveActiveQuestionImageAsset(question);
    if (stored) return stored;
    const packId = this.view.questionPackIdById.get(question.id);
    return packId && this.builtinPackIds.has(packId) && question.imageAsset ? resolveBuiltinImageAsset(question.imageAsset) : undefined;
  }

  async saveImportedPack(pack: LoopDeckPack): Promise<void> {
    await db.saveImportedPack(pack);
    await this.load();
  }

  async saveImportedPackWithAssets(pack: LoopDeckPack, assets: ImportedPackAsset[], replaceAssets = true): Promise<void> {
    await db.saveImportedPackWithAssets(pack, assets, replaceAssets);
    await this.load();
  }

  async deleteImportedPack(packId: string): Promise<void> {
    await db.deleteImportedPack(packId);
    await this.load();
  }
}

export const packGateway = new PackGateway();
