import type { FolderInfo, LoopDeckPack, ModuleInfo, Question } from '../core/models';
import { stageMergedPackAssets } from './importedAssetStaging';

export interface MergePackReport {
  addedFolders: number;
  updatedFolders: number;
  addedModules: number;
  mergedModules: number;
  addedQuestions: number;
  renamedQuestions: number;
  skippedIdenticalQuestions: number;
}

export interface MergePackResult {
  pack: LoopDeckPack;
  report: MergePackReport;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${entries.join(',')}}`;
}

function areQuestionsDeeplyIdentical(left: Question, right: Question): boolean {
  return stableStringify(left) === stableStringify(right);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function nextMergedQuestionId(originalId: string, usedQuestionIds: Set<string>): string {
  let index = 1;
  let candidate = `${originalId}__merge_${index}`;
  while (usedQuestionIds.has(candidate)) {
    index += 1;
    candidate = `${originalId}__merge_${index}`;
  }
  usedQuestionIds.add(candidate);
  return candidate;
}

function mergeFolders(existingFolders: FolderInfo[], incomingFolders: FolderInfo[], report: MergePackReport): FolderInfo[] {
  const folderById = new Map(existingFolders.map((folder) => [folder.id, folder]));

  for (const incomingFolder of incomingFolders) {
    if (folderById.has(incomingFolder.id)) {
      report.updatedFolders += 1;
    } else {
      report.addedFolders += 1;
    }
    folderById.set(incomingFolder.id, incomingFolder);
  }

  return Array.from(folderById.values());
}

function mergeQuestions(
  existingQuestions: Question[],
  incomingQuestions: Question[],
  report: MergePackReport
): { questions: Question[]; incomingQuestionIdMap: ReadonlyMap<string, string> } {
  const existingQuestionById = new Map(existingQuestions.map((question) => [question.id, question]));
  const usedQuestionIds = new Set<string>([
    ...existingQuestions.map((question) => question.id),
    ...incomingQuestions.map((question) => question.id)
  ]);
  const incomingQuestionIdMap = new Map<string, string>();
  const questions: Question[] = [...existingQuestions];

  for (const incomingQuestion of incomingQuestions) {
    const existingQuestion = existingQuestionById.get(incomingQuestion.id);
    if (!existingQuestion) {
      incomingQuestionIdMap.set(incomingQuestion.id, incomingQuestion.id);
      questions.push(incomingQuestion);
      report.addedQuestions += 1;
      continue;
    }

    if (areQuestionsDeeplyIdentical(existingQuestion, incomingQuestion)) {
      incomingQuestionIdMap.set(incomingQuestion.id, existingQuestion.id);
      report.skippedIdenticalQuestions += 1;
      continue;
    }

    const renamedId = nextMergedQuestionId(incomingQuestion.id, usedQuestionIds);
    const renamedQuestion: Question = {
      ...incomingQuestion,
      id: renamedId,
      moduleId: incomingQuestion.moduleId
    };
    incomingQuestionIdMap.set(incomingQuestion.id, renamedId);
    questions.push(renamedQuestion);
    report.renamedQuestions += 1;
  }

  return { questions, incomingQuestionIdMap };
}

function remapQuestionIds(questionIds: string[], incomingQuestionIdMap: ReadonlyMap<string, string>): string[] {
  return questionIds.map((questionId) => incomingQuestionIdMap.get(questionId) ?? questionId);
}

function mergeModules(
  existingModules: ModuleInfo[],
  incomingModules: ModuleInfo[],
  incomingQuestionIdMap: ReadonlyMap<string, string>,
  report: MergePackReport
): ModuleInfo[] {
  const moduleById = new Map(existingModules.map((module) => [module.id, module]));

  for (const incomingModule of incomingModules) {
    const incomingQuestionIds = remapQuestionIds(incomingModule.questionIds, incomingQuestionIdMap);
    const existingModule = moduleById.get(incomingModule.id);

    if (!existingModule) {
      moduleById.set(incomingModule.id, {
        ...incomingModule,
        questionIds: uniqueStrings(incomingQuestionIds)
      });
      report.addedModules += 1;
      continue;
    }

    moduleById.set(incomingModule.id, {
      ...existingModule,
      ...incomingModule,
      questionIds: uniqueStrings([...existingModule.questionIds, ...incomingQuestionIds])
    });
    report.mergedModules += 1;
  }

  return Array.from(moduleById.values());
}

function emptyMergeReport(): MergePackReport {
  return {
    addedFolders: 0,
    updatedFolders: 0,
    addedModules: 0,
    mergedModules: 0,
    addedQuestions: 0,
    renamedQuestions: 0,
    skippedIdenticalQuestions: 0
  };
}

export function mergeLoopDeckPacksIntoExisting(existingPack: LoopDeckPack, incomingPack: LoopDeckPack): MergePackResult {
  const report = emptyMergeReport();
  const folders = mergeFolders(existingPack.folders, incomingPack.folders, report);
  const { questions, incomingQuestionIdMap } = mergeQuestions(existingPack.questions, incomingPack.questions, report);
  const modules = mergeModules(existingPack.modules, incomingPack.modules, incomingQuestionIdMap, report);
  const pack: LoopDeckPack = {
    packVersion: Math.max(existingPack.packVersion, incomingPack.packVersion),
    packId: existingPack.packId,
    title: existingPack.title,
    description: existingPack.description !== undefined ? existingPack.description : incomingPack.description,
    folders,
    modules,
    questions
  };

  stageMergedPackAssets(incomingPack, pack);
  return { pack, report };
}

export function mergeLoopDeckPacks(existingPack: LoopDeckPack, incomingPack: LoopDeckPack): MergePackResult {
  if (existingPack.packId !== incomingPack.packId) {
    throw new Error(`Cannot merge different packIds: ${existingPack.packId} !== ${incomingPack.packId}`);
  }

  return mergeLoopDeckPacksIntoExisting({
    ...existingPack,
    title: incomingPack.title,
    description: incomingPack.description !== undefined ? incomingPack.description : existingPack.description
  }, incomingPack);
}
