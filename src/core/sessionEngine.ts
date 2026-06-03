import type { ModuleInfo, Question, StudySettings } from './models';

export interface QuizSession {
  module: ModuleInfo;
  queue: Question[];
  index: number;
  settings: StudySettings;
  startedAt: number;
  currentStartedAt: number;
  mode: 'normal' | 'review';
}

export interface StudyRangeOption {
  value: string;
  label: string;
}

export interface StudySelectionContext {
  wrongQuestionIds?: Iterable<string>;
  bookmarkedQuestionIds?: Iterable<string>;
}

function shuffle<T>(items: T[]): T[] {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function idSet(values?: Iterable<string>): Set<string> | undefined {
  if (!values) return undefined;
  return values instanceof Set ? values : new Set(values);
}

function questionOrdinal(question: Question, index: number): number {
  const number = question.number;
  return typeof number === 'number' && Number.isFinite(number) && number > 0 ? number : index + 1;
}

function parseRange(value: string | undefined): [number, number] | undefined {
  if (!value || value === 'all' || value === 'wrong' || value === 'bookmarked') return undefined;
  const match = /^(\d+)-(\d+)$/.exec(value);
  if (!match) return undefined;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return undefined;
  return [start, end];
}

export function buildRangeOptions(questions: Question[], step = 25): StudyRangeOption[] {
  const count = questions.length;
  const options: StudyRangeOption[] = [{ value: 'all', label: `全範囲 (${count}問)` }];
  if (count <= step) return options;

  for (let start = 1; start <= count; start += step) {
    const end = Math.min(count, start + step - 1);
    options.push({ value: `${start}-${end}`, label: `${String(start).padStart(3, '0')}〜${String(end).padStart(3, '0')}` });
  }
  return options;
}

export function listQuestionCategories(questions: Question[]): string[] {
  return [...new Set(questions.map((question) => question.category?.trim()).filter((category): category is string => Boolean(category)))].sort((a, b) => a.localeCompare(b, 'ja'));
}

export function filterStudyQuestions(
  questions: Question[],
  settings: StudySettings,
  context: StudySelectionContext = {}
): Question[] {
  let selected = [...questions];
  const wrong = idSet(context.wrongQuestionIds);
  const bookmarked = idSet(context.bookmarkedQuestionIds);
  const activeFilter = settings.filter ?? 'all';
  const range = settings.selectedRange ?? 'all';

  if (activeFilter === 'wrong' && wrong) selected = selected.filter((question) => wrong.has(question.id));
  if (activeFilter === 'bookmarked' && bookmarked) selected = selected.filter((question) => bookmarked.has(question.id));
  if (range === 'wrong' && wrong) selected = selected.filter((question) => wrong.has(question.id));
  if (range === 'bookmarked' && bookmarked) selected = selected.filter((question) => bookmarked.has(question.id));

  const parsed = parseRange(range);
  if (parsed) {
    const [start, end] = parsed;
    selected = selected.filter((question, index) => {
      const ordinal = questionOrdinal(question, index);
      return ordinal >= start && ordinal <= end;
    });
  }

  const category = settings.selectedCategory?.trim();
  if (category && category !== 'all') {
    selected = selected.filter((question) => question.category === category);
  }

  return selected;
}

export function selectSessionQuestions(
  questions: Question[],
  settings: StudySettings,
  context: StudySelectionContext = {}
): Question[] {
  const filtered = filterStudyQuestions(questions, settings, context);
  const ordered = settings.shuffle ? shuffle(filtered) : [...filtered];
  return settings.questionLimit === 'all' ? ordered : ordered.slice(0, settings.questionLimit);
}

export function createSession(
  module: ModuleInfo,
  questions: Question[],
  settings: StudySettings,
  mode: 'normal' | 'review' = 'normal'
): QuizSession {
  const queue = selectSessionQuestions(questions, settings);
  const now = Date.now();
  return {
    module,
    queue,
    index: 0,
    settings,
    startedAt: now,
    currentStartedAt: now,
    mode
  };
}

export function currentQuestion(session: QuizSession): Question | undefined {
  return session.queue[session.index];
}

export function elapsedForCurrent(session: QuizSession): number {
  return Math.max(0, Date.now() - session.currentStartedAt);
}

export function advanceSession(session: QuizSession): QuizSession {
  return {
    ...session,
    index: session.index + 1,
    currentStartedAt: Date.now()
  };
}

export function isSessionComplete(session: QuizSession): boolean {
  return session.index >= session.queue.length;
}
