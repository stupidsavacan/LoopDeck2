import type { Attempt, ModuleInfo, Question, StudySettings } from './models';
import { getSupportedStudyQuestionModes, presentQuestionForStudy, resolveConcreteStudyQuestionMode } from './questionPresentation';

export interface QuizSession {
  module: ModuleInfo;
  queue: Question[];
  choicePool: Question[];
  index: number;
  settings: StudySettings;
  startedAt: number;
  currentStartedAt: number;
  mode: 'normal' | 'review';
  attempts: Attempt[];
}

export interface StudyRangeOption { value: string; label: string; }
export interface StudySelectionContext { wrongQuestionIds?: Iterable<string>; bookmarkedQuestionIds?: Iterable<string>; }

function shuffle<T>(items: T[]): T[] {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function idSet(values?: Iterable<string>): Set<string> | undefined { return values ? new Set(values) : undefined; }
function questionOrdinal(question: Question, index: number): number {
  return typeof question.number === 'number' && Number.isFinite(question.number) && question.number > 0 ? question.number : index + 1;
}
function parseRange(value?: string): [number, number] | undefined {
  if (!value || value === 'all' || value === 'wrong' || value === 'bookmarked') return undefined;
  const [left, right, extra] = value.split('-');
  if (extra !== undefined || !left || !right) return undefined;
  const start = Number(left);
  const end = Number(right);
  return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start ? [start, end] : undefined;
}

export function buildRangeOptions(questions: Question[], step = 25): StudyRangeOption[] {
  const options: StudyRangeOption[] = [{ value: 'all', label: `全範囲 (${questions.length}問)` }];
  if (!questions.length) return options;
  const ordinals = questions.map(questionOrdinal);
  const first = Math.min(...ordinals);
  const last = Math.max(...ordinals);
  if (last - first + 1 <= step) return options;
  for (let start = first; start <= last; start += step) {
    const end = Math.min(last, start + step - 1);
    options.push({ value: `${start}-${end}`, label: `${String(start).padStart(3, '0')}〜${String(end).padStart(3, '0')}` });
  }
  return options;
}

export function listQuestionCategories(questions: Question[]): string[] {
  const categories = questions.map((question) => question.category?.trim()).filter((category): category is string => Boolean(category));
  return [...new Set(categories)].sort((a, b) => a.localeCompare(b, 'ja'));
}

export function filterStudyQuestions(questions: Question[], settings: StudySettings, context: StudySelectionContext = {}): Question[] {
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
  return category && category !== 'all' ? selected.filter((question) => question.category === category) : selected;
}

export function selectSessionQuestions(questions: Question[], settings: StudySettings, context: StudySelectionContext = {}): Question[] {
  const filtered = filterStudyQuestions(questions, settings, context);
  const requestedMode = settings.questionMode ?? 'as_stored';
  const modeCompatible = filtered.filter((question) => {
    if (requestedMode === 'as_stored') return true;
    const supported = getSupportedStudyQuestionModes(question);
    if (requestedMode === 'mixed') return supported.some((mode) => mode === 'front_to_back' || mode === 'back_to_front');
    return supported.includes(requestedMode);
  });
  const ordered = settings.shuffle ? shuffle(modeCompatible) : [...modeCompatible];
  return settings.questionLimit === 'all' ? ordered : ordered.slice(0, settings.questionLimit);
}

export function createSession(module: ModuleInfo, questions: Question[], settings: StudySettings, mode: 'normal' | 'review' = 'normal', choicePool: Question[] = questions): QuizSession {
  const requestedMode = settings.questionMode ?? 'as_stored';
  const queue = selectSessionQuestions(questions, settings).map((question) =>
    presentQuestionForStudy(question, resolveConcreteStudyQuestionMode(question, requestedMode))
  );
  const now = Date.now();
  return { module, queue, choicePool: [...choicePool], index: 0, settings, startedAt: now, currentStartedAt: now, mode, attempts: [] };
}

export function currentQuestion(session: QuizSession): Question | undefined { return session.queue[session.index]; }
export function elapsedForCurrent(session: QuizSession): number { return Math.max(0, Date.now() - session.currentStartedAt); }
export function advanceSession(session: QuizSession, attempt?: Attempt): QuizSession {
  return {
    ...session,
    index: session.index + 1,
    currentStartedAt: Date.now(),
    attempts: attempt ? [...session.attempts, attempt] : session.attempts
  };
}
export function isSessionComplete(session: QuizSession): boolean { return session.index >= session.queue.length; }
