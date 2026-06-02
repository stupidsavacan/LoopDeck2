import type { LoopDeckPack, Question } from '../core/models';
import { extensionOf, isSafePackPath } from './assetSafety';
import { FORBIDDEN_EXTENSIONS, type PackValidationIssue, type PackValidationResult } from './packTypes';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

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

  if (Array.isArray(rawPack.modules)) {
    const moduleIds = new Set<string>();
    for (const module of rawPack.modules) {
      if (!isObject(module)) {
        issues.push({ level: 'error', message: 'Module must be an object.' });
        continue;
      }
      if (typeof module.id !== 'string' || !module.id.trim()) issues.push({ level: 'error', message: 'Module id is required.' });
      if (typeof module.id === 'string' && moduleIds.has(module.id)) issues.push({ level: 'error', message: `Duplicate module id: ${module.id}` });
      if (typeof module.id === 'string') moduleIds.add(module.id);
      if (!isStringArray(module.questionIds)) issues.push({ level: 'error', message: `Module ${String(module.id)} needs questionIds.` });
    }
  }

  const ok = !issues.some((issue) => issue.level === 'error');
  return { ok, issues, pack: ok ? (rawPack as unknown as LoopDeckPack) : undefined };
}

export function collectAllQuestions(packs: LoopDeckPack[]): Question[] {
  return packs.flatMap((pack) => pack.questions);
}
