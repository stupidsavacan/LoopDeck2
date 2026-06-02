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

function shuffle<T>(items: T[]): T[] {
  const copied = [...items];
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

export function createSession(
  module: ModuleInfo,
  questions: Question[],
  settings: StudySettings,
  mode: 'normal' | 'review' = 'normal'
): QuizSession {
  const selected = settings.shuffle ? shuffle(questions) : [...questions];
  const limited = settings.questionLimit === 'all' ? selected : selected.slice(0, settings.questionLimit);
  const now = Date.now();
  return {
    module,
    queue: limited,
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
