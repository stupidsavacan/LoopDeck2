import { getCorrectAnswer } from '../core/answerJudge';
import type { InputQuestion, ModuleInfo, Question } from '../core/models';

export const WORKSHEET_ROWS_PER_PAGE = 25;
export const WORKSHEET_PDF_TITLE_MAX_CHARS = 72;

const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/;
const ENGLISH_TEXT = /[a-z]/i;

export interface WorksheetRow {
  number: number;
  prompt: string;
  answer: string;
}

export interface WorksheetPage {
  kind: 'questions' | 'answers';
  pageNumber: number;
  sectionPageNumber: number;
  rows: WorksheetRow[];
}

export interface WorksheetPlan {
  moduleTitle: string;
  pdfModuleTitle: string;
  warnings: string[];
  rangeLabel: string;
  rowsPerPage: 25;
  rows: WorksheetRow[];
  questionPages: WorksheetPage[];
  answerPages: WorksheetPage[];
  pages: WorksheetPage[];
  skippedQuestionCount: number;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function rangeLabel(rows: WorksheetRow[]): string {
  if (!rows.length) return '0 questions';
  const first = rows[0].number;
  const last = rows[rows.length - 1].number;
  return first === last ? `No.${first}` : `No.${first}-${last}`;
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function worksheetPdfModuleTitle(title: string): { text: string; shortened: boolean } {
  const characters = Array.from(clean(title));
  if (characters.length <= WORKSHEET_PDF_TITLE_MAX_CHARS) return { text: characters.join(''), shortened: false };
  return { text: `${characters.slice(0, WORKSHEET_PDF_TITLE_MAX_CHARS - 1).join('')}…`, shortened: true };
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map(clean).filter(Boolean)) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function japaneseMeanings(question: InputQuestion): string[] {
  return uniqueValues([question.answer, ...(question.acceptableAnswers ?? [])]).filter((value) => JAPANESE_TEXT.test(value));
}

function createWorksheetRow(question: Question, fallbackIndex: number): WorksheetRow | undefined {
  if (question.type !== 'input' || question.imageAsset || question.direction === 'en_to_ja') return undefined;
  const answer = getCorrectAnswer(question);
  if (typeof answer !== 'string') return undefined;

  const prompt = clean(question.prompt);
  const answerText = clean(answer);
  const number = question.number ?? fallbackIndex + 1;

  if (JAPANESE_TEXT.test(prompt) && ENGLISH_TEXT.test(answerText)) {
    return { number, prompt, answer: answerText };
  }

  const meanings = japaneseMeanings(question);
  if (ENGLISH_TEXT.test(prompt) && !JAPANESE_TEXT.test(prompt) && meanings.length) {
    return { number, prompt: meanings.join('；'), answer: prompt };
  }

  return undefined;
}

export function isJapaneseToEnglishWorksheetQuestion(question: Question): boolean {
  return Boolean(createWorksheetRow(question, 0));
}

export function createJapaneseToEnglishWorksheetPlan(
  module: ModuleInfo,
  questions: Question[],
  includeAnswerKey: boolean
): WorksheetPlan {
  const rows: WorksheetRow[] = [];
  for (const question of questions) {
    const row = createWorksheetRow(question, rows.length);
    if (row) rows.push(row);
  }
  const questionChunks = chunks(rows, WORKSHEET_ROWS_PER_PAGE);
  const questionPages = questionChunks.map((pageRows, index): WorksheetPage => ({
    kind: 'questions',
    pageNumber: index + 1,
    sectionPageNumber: index + 1,
    rows: pageRows
  }));
  const answerPages = includeAnswerKey
    ? questionChunks.map((pageRows, index): WorksheetPage => ({
        kind: 'answers',
        pageNumber: questionPages.length + index + 1,
        sectionPageNumber: index + 1,
        rows: pageRows
      }))
    : [];

  const pdfTitle = worksheetPdfModuleTitle(module.title);
  const warnings = pdfTitle.shortened
    ? [`教材名が長いため、PDF見出しでは${WORKSHEET_PDF_TITLE_MAX_CHARS}文字以内に短縮します。問題文と解答本文は省略しません。`]
    : [];

  return {
    moduleTitle: module.title,
    pdfModuleTitle: pdfTitle.text,
    warnings,
    rangeLabel: rangeLabel(rows),
    rowsPerPage: WORKSHEET_ROWS_PER_PAGE,
    rows,
    questionPages,
    answerPages,
    pages: [...questionPages, ...answerPages],
    skippedQuestionCount: questions.length - rows.length
  };
}
