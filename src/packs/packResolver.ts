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
}

function isQuestion(question: Question | undefined): question is Question {
  return Boolean(question);
}

/**
 * Builds the single active runtime view for LoopDeck packs.
 *
 * The input order is priority order from weakest to strongest. main.ts passes
 * built-in packs first and imported packs later, so imported user data wins for
 * duplicate pack/module/question IDs while the built-in data remains bundled.
 *
 * Question resolution is intentionally based on the resolved active modules'
 * questionIds. This prevents stale questions from an overridden module from
 * staying available in Review/Graphs after Home and Module have switched to the
 * replacement module.
 */
export function resolveActivePacks(packs: LoopDeckPack[]): ResolvedPackView {
  const packById = new Map<string, LoopDeckPack>();
  for (const pack of packs) {
    packById.set(pack.packId, pack);
  }

  const activePacks = Array.from(packById.values());

  const moduleById = new Map<string, ModuleInfo>();
  const modulePackIdById = new Map<string, string>();
  const availableQuestionById = new Map<string, Question>();
  const availableQuestionPackIdById = new Map<string, string>();

  for (const pack of activePacks) {
    for (const module of pack.modules) {
      moduleById.set(module.id, module);
      modulePackIdById.set(module.id, pack.packId);
    }
    for (const question of pack.questions) {
      availableQuestionById.set(question.id, question);
      availableQuestionPackIdById.set(question.id, pack.packId);
    }
  }

  const activeModules = Array.from(moduleById.values());
  const activeQuestionById = new Map<string, Question>();
  const questionPackIdById = new Map<string, string>();

  for (const module of activeModules) {
    for (const questionId of module.questionIds) {
      const question = availableQuestionById.get(questionId);
      const packId = availableQuestionPackIdById.get(questionId);
      if (question) activeQuestionById.set(question.id, question);
      if (question && packId) questionPackIdById.set(question.id, packId);
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
    questionPackIdById
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
  return module.questionIds.map((questionId) => getQuestionById(view, questionId)).filter(isQuestion);
}
