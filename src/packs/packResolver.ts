import type { LoopDeckPack, ModuleInfo, Question } from '../core/models';

export interface ResolvedPackView {
  packs: LoopDeckPack[];
  modules: ModuleInfo[];
  questions: Question[];
  packById: ReadonlyMap<string, LoopDeckPack>;
  moduleById: ReadonlyMap<string, ModuleInfo>;
  questionById: ReadonlyMap<string, Question>;
  modulePackIdById: ReadonlyMap<string, string>;
  questionPackIdById: ReadonlyMap<string, string>;
  moduleQuestionsById: ReadonlyMap<string, readonly Question[]>;
}

/**
 * Builds the single active runtime view for LoopDeck packs.
 *
 * Input order is weak-to-strong. Later packs replace the same packId, and later
 * active packs replace the same moduleId. Question IDs are contractually global
 * across different active packIds because learning history is keyed by question
 * ID. The resolver still scopes module question lookup to the module-owning pack
 * so legacy/corrupt collisions can never make a module display another pack's
 * same-ID question.
 */
export function resolveActivePacks(packs: LoopDeckPack[]): ResolvedPackView {
  const packById = new Map<string, LoopDeckPack>();
  for (const pack of packs) packById.set(pack.packId, pack);
  const activePacks = Array.from(packById.values());

  const moduleById = new Map<string, ModuleInfo>();
  const modulePackIdById = new Map<string, string>();
  const questionsByPackId = new Map<string, ReadonlyMap<string, Question>>();

  for (const pack of activePacks) {
    questionsByPackId.set(pack.packId, new Map(pack.questions.map((question) => [question.id, question])));
    for (const module of pack.modules) {
      moduleById.set(module.id, module);
      modulePackIdById.set(module.id, pack.packId);
    }
  }

  const activeModules = Array.from(moduleById.values());
  const activeQuestionById = new Map<string, Question>();
  const questionPackIdById = new Map<string, string>();
  const moduleQuestionsById = new Map<string, readonly Question[]>();

  // Iterate by pack priority so the global question map keeps the same
  // deterministic later-wins rule even when reading legacy conflicting data.
  for (const pack of activePacks) {
    const packQuestions = questionsByPackId.get(pack.packId);
    if (!packQuestions) continue;

    for (const module of pack.modules) {
      if (moduleById.get(module.id) !== module || modulePackIdById.get(module.id) !== pack.packId) continue;

      const questions: Question[] = [];
      for (const questionId of module.questionIds) {
        const question = packQuestions.get(questionId);
        if (!question || question.moduleId !== module.id) continue;
        questions.push(question);
        activeQuestionById.set(question.id, question);
        questionPackIdById.set(question.id, pack.packId);
      }
      moduleQuestionsById.set(module.id, questions);
    }
  }

  return {
    packs: activePacks,
    modules: activeModules,
    questions: Array.from(activeQuestionById.values()),
    packById,
    moduleById,
    questionById: activeQuestionById,
    modulePackIdById,
    questionPackIdById,
    moduleQuestionsById
  };
}

export function getActivePacks(view: ResolvedPackView): LoopDeckPack[] {
  return view.packs;
}

export function getActiveModules(view: ResolvedPackView): ModuleInfo[] {
  return view.modules;
}

export function getActiveQuestions(view: ResolvedPackView): Question[] {
  return view.questions;
}

export function getModuleById(view: ResolvedPackView, moduleId: string): ModuleInfo | undefined {
  return view.moduleById.get(moduleId);
}

export function getQuestionById(view: ResolvedPackView, questionId: string): Question | undefined {
  return view.questionById.get(questionId);
}

export function getQuestionPackId(view: ResolvedPackView, questionId: string): string | undefined {
  return view.questionPackIdById.get(questionId);
}

export function getQuestionsForModule(view: ResolvedPackView, moduleOrId: ModuleInfo | string | undefined): Question[] {
  const module = typeof moduleOrId === 'string' ? getModuleById(view, moduleOrId) : moduleOrId;
  if (!module) return [];
  return [...(view.moduleQuestionsById.get(module.id) ?? [])];
}
