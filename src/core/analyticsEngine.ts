import type { Attempt, ModuleInfo, Question } from './models';

export interface DailyStudyStat {
  date: string;
  attempts: number;
  correct: number;
  wrong: number;
  revealed: number;
  accuracy: number;
}

export interface ModuleStudyStat {
  moduleId: string;
  title: string;
  attempts: number;
  correct: number;
  wrong: number;
  revealed: number;
  accuracy: number;
  averageElapsedMs: number;
}

export interface MistakeTrendPoint {
  date: string;
  mistakes: number;
}

export interface MistakeBreakdownItem {
  id: string;
  label: string;
  count: number;
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseAttemptDay(attempt: Attempt): string | undefined {
  const date = new Date(attempt.answeredAt);
  if (Number.isNaN(date.getTime())) return undefined;
  return dayKey(date);
}

function recentDayKeys(days: number, now: Date): string[] {
  const safeDays = Math.max(1, Math.floor(days));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Array.from({ length: safeDays }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (safeDays - index - 1));
    return dayKey(date);
  });
}

export function buildDailyStudyStats(attempts: Attempt[], days = 28, now = new Date()): DailyStudyStat[] {
  const byDay = new Map<string, DailyStudyStat>();
  for (const date of recentDayKeys(days, now)) {
    byDay.set(date, { date, attempts: 0, correct: 0, wrong: 0, revealed: 0, accuracy: 0 });
  }

  for (const attempt of attempts) {
    const date = parseAttemptDay(attempt);
    const item = date ? byDay.get(date) : undefined;
    if (!item) continue;

    item.attempts += 1;
    if (attempt.result === 'correct') item.correct += 1;
    if (attempt.result === 'wrong') item.wrong += 1;
    if (attempt.result === 'revealed') item.revealed += 1;
  }

  return [...byDay.values()].map((item) => ({
    ...item,
    accuracy: item.attempts ? item.correct / item.attempts : 0
  }));
}

export function buildModuleStudyStats(attempts: Attempt[], modules: ModuleInfo[]): ModuleStudyStat[] {
  const moduleTitles = new Map(modules.map((module) => [module.id, module.title]));
  const byModule = new Map<string, ModuleStudyStat & { elapsedTotal: number }>();

  for (const attempt of attempts) {
    const current = byModule.get(attempt.moduleId) ?? {
      moduleId: attempt.moduleId,
      title: moduleTitles.get(attempt.moduleId) ?? attempt.moduleId,
      attempts: 0,
      correct: 0,
      wrong: 0,
      revealed: 0,
      accuracy: 0,
      averageElapsedMs: 0,
      elapsedTotal: 0
    };

    current.attempts += 1;
    current.elapsedTotal += Math.max(0, attempt.elapsedMs);
    if (attempt.result === 'correct') current.correct += 1;
    if (attempt.result === 'wrong') current.wrong += 1;
    if (attempt.result === 'revealed') current.revealed += 1;
    byModule.set(attempt.moduleId, current);
  }

  return [...byModule.values()]
    .map(({ elapsedTotal, ...item }) => ({
      ...item,
      accuracy: item.attempts ? item.correct / item.attempts : 0,
      averageElapsedMs: item.attempts ? elapsedTotal / item.attempts : 0
    }))
    .sort((a, b) => b.attempts - a.attempts || a.title.localeCompare(b.title));
}

export function buildMistakeTrend(attempts: Attempt[], days = 14, now = new Date()): MistakeTrendPoint[] {
  const byDay = new Map(recentDayKeys(days, now).map((date) => [date, 0]));
  for (const attempt of attempts) {
    if (attempt.result === 'correct') continue;
    const date = parseAttemptDay(attempt);
    if (!date || !byDay.has(date)) continue;
    byDay.set(date, (byDay.get(date) ?? 0) + 1);
  }
  return [...byDay.entries()].map(([date, mistakes]) => ({ date, mistakes }));
}

export function buildMistakeBreakdown(attempts: Attempt[], questions: Question[], slowCorrectMs = 10000): MistakeBreakdownItem[] {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const counts = new Map<string, MistakeBreakdownItem>([
    ['wrong', { id: 'wrong', label: '不正解', count: 0 }],
    ['revealed', { id: 'revealed', label: '答え表示', count: 0 }],
    ['multi_select', { id: 'multi_select', label: '複数選択ミス', count: 0 }],
    ['slow_correct', { id: 'slow_correct', label: '時間がかかった正解', count: 0 }],
    ['repeated', { id: 'repeated', label: '繰り返しミス', count: 0 }]
  ]);

  const wrongByQuestion = new Map<string, number>();
  for (const attempt of attempts) {
    const question = questionsById.get(attempt.questionId);

    if (attempt.result === 'wrong') {
      counts.get('wrong')!.count += 1;
      wrongByQuestion.set(attempt.questionId, (wrongByQuestion.get(attempt.questionId) ?? 0) + 1);
      if (question?.type === 'multi_select') counts.get('multi_select')!.count += 1;
      continue;
    }

    if (attempt.result === 'revealed') {
      counts.get('revealed')!.count += 1;
      wrongByQuestion.set(attempt.questionId, (wrongByQuestion.get(attempt.questionId) ?? 0) + 1);
      continue;
    }

    if (attempt.result === 'correct' && attempt.elapsedMs >= slowCorrectMs) {
      counts.get('slow_correct')!.count += 1;
    }
  }

  counts.get('repeated')!.count = [...wrongByQuestion.values()].filter((count) => count >= 2).length;
  return [...counts.values()].filter((item) => item.count > 0);
}
