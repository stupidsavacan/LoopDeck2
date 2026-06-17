import type { LoopDeckPack, QuestionSamplePattern, StudySide, TwoSidedStudyData } from '../core/models';
import { extensionOf, isSafePackPath } from './assetSafety';
import { FORBIDDEN_EXTENSIONS, type PackValidationIssue, type PackValidationResult } from './packTypes';

const STUDY_MODE_VALUES = new Set(['front_to_back', 'back_to_front']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SAMPLE_PATTERNS = new Set<QuestionSamplePattern>([
  'solid',
  'vertical_stripes',
  'horizontal_stripes',
  'diagonal_stripes',
  'cross_hatch',
  'dots',
  'grid'
]);
const SAMPLE_PROMPT_WORDS = /(色|サンプル|塗|線|縦線|横線|斜線|水玉|模様|網掛け|格子)/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

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

function validateStudySide(side: unknown, questionId: unknown, sideName: 'front' | 'back'): PackValidationIssue[] {
  const issues: PackValidationIssue[] = [];
  if (!isObject(side)) {
    issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sides.${sideName} must be an object.` });
    return issues;
  }

  if (!isNonEmptyString(side.label)) issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sides.${sideName}.label is required.` });
  if (!isNonEmptyString(side.text)) issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sides.${sideName}.text is required.` });
  if (side.acceptableAnswers !== undefined && !isStringArray(side.acceptableAnswers)) {
    issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sides.${sideName}.acceptableAnswers must be a string array.` });
  }

  return issues;
}

function hasAcceptableAnswers(side: StudySide | undefined): boolean {
  return Array.isArray(side?.acceptableAnswers) && side.acceptableAnswers.some((answer) => answer.trim().length > 0);
}

function validateTwoSidedMetadata(question: Record<string, unknown>, questionId: unknown): PackValidationIssue[] {
  const issues: PackValidationIssue[] = [];
  const sides = question.sides;
  const supportedStudyModes = question.supportedStudyModes;
  let typedSides: TwoSidedStudyData | undefined;

  if (sides !== undefined) {
    if (!isObject(sides)) {
      issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sides must be an object.` });
    } else {
      if (!('front' in sides)) issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sides.front is required.` });
      if (!('back' in sides)) issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sides.back is required.` });
      issues.push(...validateStudySide(sides.front, questionId, 'front'));
      issues.push(...validateStudySide(sides.back, questionId, 'back'));
      typedSides = sides as unknown as TwoSidedStudyData;
    }
  }

  if (supportedStudyModes !== undefined) {
    if (!isStringArray(supportedStudyModes)) {
      issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} supportedStudyModes must be a string array.` });
    } else {
      for (const mode of supportedStudyModes) {
        if (!STUDY_MODE_VALUES.has(mode)) issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} has unsupported study mode: ${mode}` });
      }
    }
  }

  if (sides !== undefined && supportedStudyModes === undefined) {
    issues.push({ level: 'warning', message: `Question ${questionId || '(unknown)'} has sides but no supportedStudyModes.` });
  }

  if (typedSides && isStringArray(supportedStudyModes)) {
    if (supportedStudyModes.includes('back_to_front') && !hasAcceptableAnswers(typedSides.front)) {
      issues.push({ level: 'warning', message: `Question ${questionId || '(unknown)'} supports back_to_front but sides.front.acceptableAnswers is empty.` });
    }
    if (supportedStudyModes.includes('front_to_back') && !hasAcceptableAnswers(typedSides.back)) {
      issues.push({ level: 'warning', message: `Question ${questionId || '(unknown)'} supports front_to_back but sides.back.acceptableAnswers is empty.` });
    }
  }

  return issues;
}

function validateSampleMetadata(question: Record<string, unknown>, questionId: unknown): PackValidationIssue[] {
  const issues: PackValidationIssue[] = [];
  const sampleMarks = question.sampleMarks;
  const sampleColors = question.sampleColors;
  const hasSampleMarks = Array.isArray(sampleMarks) && sampleMarks.length > 0;
  const hasSampleColors = Array.isArray(sampleColors) && sampleColors.length > 0;

  if (sampleMarks !== undefined) {
    if (!Array.isArray(sampleMarks)) {
      issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleMarks must be an array.` });
    } else {
      for (const [index, mark] of sampleMarks.entries()) {
        if (!isObject(mark)) {
          issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleMarks[${index}] must be an object.` });
          continue;
        }
        if (!isNonEmptyString(mark.label)) issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleMarks[${index}].label is required.` });
        if (!isNonEmptyString(mark.color)) issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleMarks[${index}].color is required.` });
        else if (!HEX_COLOR.test(mark.color)) issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleMarks[${index}].color must be #RRGGBB.` });
        if (mark.pattern !== undefined && (typeof mark.pattern !== 'string' || !SAMPLE_PATTERNS.has(mark.pattern as QuestionSamplePattern))) {
          issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleMarks[${index}].pattern is not supported.` });
        }
        if (mark.patternColor !== undefined && (typeof mark.patternColor !== 'string' || !HEX_COLOR.test(mark.patternColor))) {
          issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleMarks[${index}].patternColor must be #RRGGBB.` });
        }
        if (mark.description !== undefined && typeof mark.description !== 'string') {
          issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleMarks[${index}].description must be a string.` });
        }
      }
    }
  }

  if (sampleColors !== undefined) {
    issues.push({ level: 'warning', message: `Question ${questionId || '(unknown)'} uses sampleColors; new packs should use sampleMarks.` });
    if (!Array.isArray(sampleColors)) {
      issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleColors must be an array.` });
    } else {
      for (const [index, sample] of sampleColors.entries()) {
        if (!isObject(sample)) {
          issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleColors[${index}] must be an object.` });
          continue;
        }
        if (typeof sample.color !== 'string' || !HEX_COLOR.test(sample.color)) {
          issues.push({ level: 'error', message: `Question ${questionId || '(unknown)'} sampleColors[${index}].color must be #RRGGBB.` });
        }
      }
    }
  }

  const promptLooksLikeSample = typeof question.prompt === 'string' && SAMPLE_PROMPT_WORDS.test(question.prompt);
  if (hasSampleMarks && !question.imageAsset) {
    issues.push({ level: 'warning', message: `Question ${questionId || '(unknown)'} has sampleMarks but no imageAsset.` });
  }
  if (promptLooksLikeSample && !hasSampleMarks && !hasSampleColors) {
    issues.push({ level: 'warning', message: `Question ${questionId || '(unknown)'} may need sampleMarks for color or pattern clues.` });
  }
  if (question.imageAsset && promptLooksLikeSample && !hasSampleMarks) {
    issues.push({ level: 'warning', message: `Question ${questionId || '(unknown)'} has imageAsset and color or pattern wording but no sampleMarks.` });
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

  issues.push(...validateTwoSidedMetadata(question, id));
  issues.push(...validateSampleMetadata(question, id));

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

export function collectAllQuestions(packs: LoopDeckPack[]): LoopDeckPack['questions'] {
  return packs.flatMap((pack) => pack.questions);
}
