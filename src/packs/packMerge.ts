import type { FolderInfo, LoopDeckPack, ModuleInfo, Question } from '../core/models';

export interface RenamedQuestion {
  from: string;
  to: string;
  moduleId: string;
}

export interface PackMergeSummary {
  newModules: number;
  mergedModules: number;
  newQuestions: number;
  duplicateQuestionsSkipped: number;
  conflictingQuestionsRenamed: number;
  renamedQuestions: RenamedQuestion[];
}

export interface PackMergeResult {
  pack: LoopDeckPack;
  summary: PackMergeSummary;
}

export type MergeQuestionIdGenerator = (baseId: string, takenIds: ReadonlySet<string>) => string;

export interface PackMergeOptions {
  generateQuestionId?: MergeQuestionIdGenerator;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function cloneQuestion<T extends Question>(question: T): T {
  return { ...question };
}

function cloneModule(module: ModuleInfo): ModuleInfo {
  return {
    ...module,
    tags: module.tags ? [...module.tags] : undefined,
    questionIds: [...module.questionIds]
  };
}

function cloneFolder(folder: FolderInfo): FolderInfo {
  return { ...folder };
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function mergeUnique<T>(left: T[], right: T[]): T[] {
  const result = [...left];
  const seen = new Set(result);
  for (const item of right) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function defaultQuestionIdGenerator(baseId: string, takenIds: ReadonlySet<string>): string {
  const safeBase = baseId.trim() || 'question';
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${safeBase}__merged_${String(index).padStart(3, '0')}`;
    if (!takenIds.has(candidate)) return candidate;
  }
  throw new Error(`Could not generate a unique merged question ID for ${safeBase}.`);
}

function stripMergeOnlyFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMergeOnlyFields);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (key === 'originalId') continue;
      const item = record[key];
      if (item !== undefined) output[key] = stripMergeOnlyFields(item);
    }
    return output;
  }
  return value;
}

function canonicalString(value: unknown): string {
  return JSON.stringify(stripMergeOnlyFields(value) as JsonValue);
}

export function questionsAreEquivalent(left: Question, right: Question): boolean {
  return canonicalString(left) === canonicalString(right);
}

function mergeModuleMetadata(existing: ModuleInfo, incoming: ModuleInfo, questionIds: string[]): ModuleInfo {
  return {
    ...existing,
    title: nonEmpty(incoming.title) ? incoming.title : existing.title,
    subject: nonEmpty(incoming.subject) ? incoming.subject : existing.subject,
    folderId: nonEmpty(incoming.folderId) ? incoming.folderId : existing.folderId,
    description: nonEmpty(incoming.description) ? incoming.description : existing.description,
    tags: incoming.tags && incoming.tags.length > 0 ? [...incoming.tags] : existing.tags ? [...existing.tags] : undefined,
    questionIds
  };
}

function mergeFolders(existingFolders: FolderInfo[], incomingFolders: FolderInfo[]): FolderInfo[] {
  const foldersById = new Map(existingFolders.map((folder) => [folder.id, cloneFolder(folder)]));
  const order = existingFolders.map((folder) => folder.id);

  for (const incoming of incomingFolders) {
    const existing = foldersById.get(incoming.id);
    if (existing) {
      foldersById.set(incoming.id, { ...existing, title: nonEmpty(incoming.title) ? incoming.title : existing.title });
      continue;
    }
    foldersById.set(incoming.id, cloneFolder(incoming));
    order.push(incoming.id);
  }

  return order.map((id) => foldersById.get(id)).filter((folder): folder is FolderInfo => Boolean(folder));
}

function resolveIncomingQuestionIds(questionIds: string[], questionIdMap: ReadonlyMap<string, string>, knownQuestionIds: ReadonlySet<string>): string[] {
  return questionIds
    .map((questionId) => questionIdMap.get(questionId) ?? questionId)
    .filter((questionId) => knownQuestionIds.has(questionId));
}

export function mergeLoopDeckPack(existingPack: LoopDeckPack, incomingPack: LoopDeckPack, options: PackMergeOptions = {}): PackMergeResult {
  if (existingPack.packId !== incomingPack.packId) {
    throw new Error(`Cannot merge different packIds: ${existingPack.packId} !== ${incomingPack.packId}`);
  }

  const generateQuestionId = options.generateQuestionId ?? defaultQuestionIdGenerator;
  const summary: PackMergeSummary = {
    newModules: 0,
    mergedModules: 0,
    newQuestions: 0,
    duplicateQuestionsSkipped: 0,
    conflictingQuestionsRenamed: 0,
    renamedQuestions: []
  };

  const existingQuestions = existingPack.questions.map(cloneQuestion);
  const questionsById = new Map<string, Question>();
  const takenQuestionIds = new Set<string>();
  for (const question of existingQuestions) {
    questionsById.set(question.id, question);
    takenQuestionIds.add(question.id);
  }

  const incomingQuestionIdMap = new Map<string, string>();
  const appendedQuestions: Question[] = [];

  for (const incomingQuestion of incomingPack.questions) {
    const existingQuestion = questionsById.get(incomingQuestion.id);
    if (!existingQuestion) {
      const addedQuestion = cloneQuestion(incomingQuestion);
      appendedQuestions.push(addedQuestion);
      questionsById.set(addedQuestion.id, addedQuestion);
      takenQuestionIds.add(addedQuestion.id);
      incomingQuestionIdMap.set(incomingQuestion.id, addedQuestion.id);
      summary.newQuestions += 1;
      continue;
    }

    if (questionsAreEquivalent(existingQuestion, incomingQuestion)) {
      incomingQuestionIdMap.set(incomingQuestion.id, existingQuestion.id);
      summary.duplicateQuestionsSkipped += 1;
      continue;
    }

    const nextId = generateQuestionId(incomingQuestion.id, takenQuestionIds);
    if (takenQuestionIds.has(nextId)) throw new Error(`Generated merged question ID already exists: ${nextId}`);
    const renamedQuestion = {
      ...cloneQuestion(incomingQuestion),
      id: nextId,
      originalId: incomingQuestion.originalId ?? incomingQuestion.id
    } as Question;
    appendedQuestions.push(renamedQuestion);
    questionsById.set(nextId, renamedQuestion);
    takenQuestionIds.add(nextId);
    incomingQuestionIdMap.set(incomingQuestion.id, nextId);
    summary.newQuestions += 1;
    summary.conflictingQuestionsRenamed += 1;
    summary.renamedQuestions.push({ from: incomingQuestion.id, to: nextId, moduleId: incomingQuestion.moduleId });
  }

  const modulesById = new Map(existingPack.modules.map((module) => [module.id, cloneModule(module)]));
  const moduleOrder = existingPack.modules.map((module) => module.id);

  for (const incomingModule of incomingPack.modules) {
    const incomingQuestionIds = resolveIncomingQuestionIds(incomingModule.questionIds, incomingQuestionIdMap, takenQuestionIds);
    const existingModule = modulesById.get(incomingModule.id);
    if (!existingModule) {
      modulesById.set(incomingModule.id, { ...cloneModule(incomingModule), questionIds: incomingQuestionIds });
      moduleOrder.push(incomingModule.id);
      summary.newModules += 1;
      continue;
    }

    const mergedQuestionIds = mergeUnique(existingModule.questionIds, incomingQuestionIds);
    modulesById.set(incomingModule.id, mergeModuleMetadata(existingModule, incomingModule, mergedQuestionIds));
    summary.mergedModules += 1;
  }

  const mergedPack: LoopDeckPack = {
    ...existingPack,
    packVersion: incomingPack.packVersion || existingPack.packVersion,
    title: nonEmpty(incomingPack.title) ? incomingPack.title : existingPack.title,
    description: nonEmpty(incomingPack.description) ? incomingPack.description : existingPack.description,
    folders: mergeFolders(existingPack.folders, incomingPack.folders),
    modules: moduleOrder.map((id) => modulesById.get(id)).filter((module): module is ModuleInfo => Boolean(module)),
    questions: [...existingQuestions, ...appendedQuestions]
  };

  return { pack: mergedPack, summary };
}
