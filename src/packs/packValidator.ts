import type { LoopDeckPack, ModuleInfo, Question } from '../core/models';
import { extensionOf, isSafePackPath } from './assetSafety';
import { FORBIDDEN_EXTENSIONS, type PackValidationIssue, type PackValidationResult } from './packTypes';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

function normalizedOptionalString(
  value: unknown,
  fallback: string | undefined,
  issues: PackValidationIssue[],
  label: string
): string | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') {
    issues.push({ level: 'warning', message: `${label} must be a string when present; using a safe default.` });
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizedOptionalStringArray(
  value: unknown,
  issues: PackValidationIssue[],
  label: string
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push({ level: 'warning', message: `${label} must be an array of strings when present; ignoring it.` });
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === 'string');
  if (strings.length !== value.length) {
    issues.push({ level: 'warning', message: `${label} contained non-string values; they were ignored.` });
  }
  return strings;
}

function normalizeModule(module: unknown, ids: Set<string>, issues: PackValidationIssue[]): ModuleInfo | undefined {
  if (!isObject(module)) {
    issues.push({ level: 'error', message: 'Module must be an object.' });
    return undefined;
  }

  const id = module.id;
  if (typeof id !== 'string' || !id.trim()) issues.push({ level: 'error', message: 'Module id is required.' });
  if (typeof id === 'string' && ids.has(id)) issues.push({ level: 'error', message: `Duplicate module id: ${id}` });
  if (typeof id === 'string') ids.add(id);
  if (!isStringArray(module.questionIds)) issues.push({ level: 'error', message: `Module ${String(id)} needs questionIds.` });

  if (typeof id !== 'string' || !id.trim() || !isStringArray(module.questionIds)) return undefined;

  const safeId = id.trim();
  const folderId = normalizedOptionalString(module.folderId, '', issues, `Module ${id} folderId`) ?? '';
  const title = normalizedOptionalString(module.title, safeId, issues, `Module ${id} title`) ?? safeId;
  const subject = normalizedOptionalString(module.subject, 'その他', issues, `Module ${id} subject`) ?? 'その他';
  const description = normalizedOptionalString(module.description, undefined, issues, `Module ${id} description`);
  const tags = normalizedOptionalStringArray(module.tags, issues, `Module ${id} tags`);
  const color = normalizedOptionalString(module.color, undefined, issues, `Module ${id} color`);
  const accent = normalizedOptionalString(module.accent, undefined, issues, `Module ${id} accent`);
  const accentColor = normalizedOptionalString(module.accentColor, undefined, issues, `Module ${id} accentColor`);

  return {
    ...module,
    id,
    folderId,
    title,
    subject,
    description,
    tags,
    color,
    accent,
    accentColor,
    questionIds: module.questionIds
  } as ModuleInfo;
}

export function validatePackFiles(paths: string[]): PackValidationIssue[] {
  const issues: PackValidationIssue[] = [];

  for (const path of paths) {
    if (!isSafePackPath(path)) {
      issues.push({ level: 'error', message: 'Unsafe path is not allowed.', path });
    }

    const ext = extensionOf(path);
    if (FORBIDDEN_EXTENSIONS.includes(ext)) {
      issues.push({ level: 'error', message: `Executable or renderable file is rejected: ${ext}`, path });
    }
  }

  return issues;
}

function validateQuestion(question: unknown, ids: Set<string>): PackValidationIssue[] {
  const issues: PackValidationIssue[] = [];
  if (!isObject(question)) return [{ level: 'error', message: 'Question must be an object.' }];

  const id = question.id;
  const moduleId = question.moduleId;
  const type = question.type;
  const prompt = question.prompt;

  if (typeof id !== 'string' || !id.trim()) issues.push({ level: 'error', message: 'Question id is required.' });
  if (typeof id === 'string' && ids.has(id)) issues.push({ level: 'error', message: `Duplicate question id: ${id}` });
  if (typeof id === 'string') ids.add(id);
  if (typeof moduleId !== 'string' || !moduleId.trim()) issues.push({ level: 'error', message: `Question ${id || '(unknown)'} needs moduleId.` });
  if (typeof prompt !== 'string' || !prompt.trim()) issues.push({ level: 'error', message: `Question ${id || '(unknown)'} needs prompt.` });

  if (type === 'input') {
    if (typeof question.answer !== 'string' || !question.answer.trim()) issues.push({ level: 'error', message: `Input question ${id} needs answer.` });
  } else if (type === 'choice') {
    if (!isStringArray(question.choices) || question.choices.length < 2) issues.push({ level: 'error', message: `Choice question ${id} needs at least two choices.` });
    if (typeof question.answer !== 'string' || !question.answer.trim()) issues.push({ level: 'error', message: `Choice question ${id} needs answer.` });
  } else if (type === 'multi_select') {
    if (!isStringArray(question.choices) || question.choices.length < 2) issues.push({ level: 'error', message: `Multi-select question ${id} needs choices.` });
    if (!isStringArray(question.correctChoices) || question.correctChoices.length < 1) issues.push({ level: 'error', message: `Multi-select question ${id} needs correctChoices.` });
  } else {
    issues.push({ level: 'error', message: `Unsupported question type: ${String(type)}` });
  }

  return issues;
}

export function validatePack(rawPack: unknown): PackValidationResult {
  const issues: PackValidationIssue[] = [];
  if (!isObject(rawPack)) return { ok: false, issues: [{ level: 'error', message: 'Pack must be an object.' }] };

  if (rawPack.packVersion !== 1) issues.push({ level: 'error', message: 'packVersion must be 1.' });
  if (typeof rawPack.packId !== 'string' || !rawPack.packId.trim()) issues.push({ level: 'error', message: 'packId is required.' });
  if (typeof rawPack.title !== 'string' || !rawPack.title.trim()) issues.push({ level: 'error', message: 'title is required.' });
  if (!Array.isArray(rawPack.folders)) issues.push({ level: 'error', message: 'folders must be an array.' });
  if (!Array.isArray(rawPack.modules)) issues.push({ level: 'error', message: 'modules must be an array.' });
  if (!Array.isArray(rawPack.questions)) issues.push({ level: 'error', message: 'questions must be an array.' });

  const questionIds = new Set<string>();
  if (Array.isArray(rawPack.questions)) {
    for (const question of rawPack.questions) issues.push(...validateQuestion(question, questionIds));
  }

  const modules: ModuleInfo[] = [];
  if (Array.isArray(rawPack.modules)) {
    const moduleIds = new Set<string>();
    for (const module of rawPack.modules) {
      const normalized = normalizeModule(module, moduleIds, issues);
      if (normalized) modules.push(normalized);
    }
  }

  const ok = !issues.some((issue) => issue.level === 'error');
  if (!ok) return { ok: false, issues };

  const pack: LoopDeckPack = {
    ...rawPack,
    packVersion: 1,
    packId: rawPack.packId as string,
    title: rawPack.title as string,
    description: normalizedOptionalString(rawPack.description, undefined, issues, 'Pack description'),
    folders: rawPack.folders as LoopDeckPack['folders'],
    modules,
    questions: rawPack.questions as Question[]
  } as LoopDeckPack;

  return { ok: true, issues, pack };
}

export function collectAllQuestions(packs: LoopDeckPack[]): Question[] {
  return packs.flatMap((pack) => pack.questions);
}
