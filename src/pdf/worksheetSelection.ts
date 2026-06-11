import type { ModuleInfo, Question } from '../core/models';

export interface WorksheetRangeOption {
  value: string;
  label: string;
}

export interface WorksheetQuestionRange {
  count: number;
  first: number;
  last: number;
  continuous: boolean;
}

export function worksheetQuestionOrdinal(question: Question, index: number): number {
  const number = question.number;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : index + 1;
}

function sortedOrdinals(questions: Question[]): number[] {
  return questions.map(worksheetQuestionOrdinal).sort((a, b) => a - b);
}

export function describeWorksheetQuestionRange(questions: Question[]): WorksheetQuestionRange | undefined {
  if (!questions.length) return undefined;
  const ordinals = sortedOrdinals(questions);
  const first = ordinals[0];
  const last = ordinals[ordinals.length - 1];
  const uniqueCount = new Set(ordinals).size;
  return {
    count: questions.length,
    first,
    last,
    continuous: uniqueCount === questions.length && last - first + 1 === questions.length
  };
}

export function worksheetBaseTitle(title: string): string {
  const stripped = title
    .normalize('NFKC')
    .replace(/(?:No\.)?\s*\d{1,4}\s*[〜~～\-–—]\s*(?:No\.)?\s*\d{1,4}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || title.trim() || '教材';
}

export function formatWorksheetModuleLabel(module: ModuleInfo, questions: Question[]): string {
  const range = describeWorksheetQuestionRange(questions);
  if (!range) return `${module.title} (0問)`;
  const baseTitle = worksheetBaseTitle(module.title);
  if (range.count === 1) return `${baseTitle} No.${range.first} (1問)`;
  if (range.continuous) return `${baseTitle} ${range.first}〜${range.last} (${range.count}問)`;
  return `${baseTitle} ${range.count}問（No.${range.first}〜${range.last}の一部）`;
}

function formatRangeLabel(questions: Question[], prefix: string): string {
  const range = describeWorksheetQuestionRange(questions);
  if (!range) return `${prefix} (0問)`;
  if (range.count === 1) return `${prefix} No.${range.first} (1問)`;
  if (range.continuous) return `${prefix} ${range.first}〜${range.last} (${range.count}問)`;
  return `${prefix} (${range.count}問 / No.${range.first}〜${range.last}の一部)`;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export function buildWorksheetRangeOptions(questions: Question[], step = 25): WorksheetRangeOption[] {
  const options: WorksheetRangeOption[] = [{ value: 'all', label: formatRangeLabel(questions, '全範囲') }];
  if (questions.length <= step) return options;

  const indexed = questions
    .map((question, index) => ({ question, ordinal: worksheetQuestionOrdinal(question, index), sourceIndex: index }))
    .sort((a, b) => a.ordinal - b.ordinal || a.sourceIndex - b.sourceIndex);

  for (const chunk of chunks(indexed, step)) {
    const chunkQuestions = chunk.map((item) => item.question);
    const range = describeWorksheetQuestionRange(chunkQuestions);
    if (!range) continue;
    options.push({ value: `${range.first}-${range.last}`, label: formatRangeLabel(chunkQuestions, '') });
  }

  return options;
}

function parseRange(value: string | undefined): [number, number] | undefined {
  if (!value || value === 'all') return undefined;
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return undefined;
  return [start, end];
}

export function filterWorksheetQuestionsByRange(questions: Question[], selectedRange: string): Question[] {
  const parsed = parseRange(selectedRange);
  if (!parsed) return [...questions];
  const [start, end] = parsed;
  return questions.filter((question, index) => {
    const ordinal = worksheetQuestionOrdinal(question, index);
    return ordinal >= start && ordinal <= end;
  });
}
