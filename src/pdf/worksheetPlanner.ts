import { getCorrectAnswer } from '../core/answerJudge';
import type { ModuleInfo, Question } from '../core/models';

export const WORKSHEET_ROWS_PER_PAGE = 25;

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

export function isJapaneseToEnglishWorksheetQuestion(question: Question): boolean {
  if (question.type !== 'input' || question.imageAsset || question.direction === 'en_to_ja') return false;
  const answer = getCorrectAnswer(question);
  return typeof answer === 'string' && JAPANESE_TEXT.test(question.prompt) && ENGLISH_TEXT.test(answer);
}

export function createJapaneseToEnglishWorksheetPlan(
  module: ModuleInfo,
  questions: Question[],
  includeAnswerKey: boolean
): WorksheetPlan {
  const supported = questions.filter(isJapaneseToEnglishWorksheetQuestion);
  const rows = supported.map((question, index): WorksheetRow => ({
    number: question.number ?? index + 1,
    prompt: question.prompt,
    answer: getCorrectAnswer(question) as string
  }));
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

  return {
    moduleTitle: module.title,
    rangeLabel: rangeLabel(rows),
    rowsPerPage: WORKSHEET_ROWS_PER_PAGE,
    rows,
    questionPages,
    answerPages,
    pages: [...questionPages, ...answerPages],
    skippedQuestionCount: questions.length - supported.length
  };
}
