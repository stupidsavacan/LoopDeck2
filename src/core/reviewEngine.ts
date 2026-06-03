import type { AnswerFormat, AnswerResult, Attempt, Question } from './models';

export interface ReviewItem {
  question: Question;
  score: number;
  label: '最優先' | '要復習' | '確認';
  attempts: number;
  lastAttemptAt: number;
}

export interface WrongAnswerPattern {
  answer: string;
  count: number;
}

export interface ProblemAnalysis {
  question: Question;
  total: number;
  correct: number;
  wrong: number;
  revealed: number;
  accuracy: number;
  averageElapsedMs: number;
  reviewScore: number;
  priorityLabel: ReviewItem['label'] | '安定';
  mistakeTags: string[];
  wrongAnswerPatterns: WrongAnswerPattern[];
  lastAttemptAt: number;
  needsAttention: boolean;
}

type TimingBand = 'fast' | 'normal' | 'slow';

function attemptTime(attempt: Attempt): number {
  const parsed = Date.parse(attempt.answeredAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function answerModeFor(attempt: Pick<Attempt, 'answerMode' | 'input'>): AnswerFormat {
  if (attempt.answerMode === 'choice' || attempt.answerMode === 'input') return attempt.answerMode;
  return Array.isArray(attempt.input) ? 'choice' : 'input';
}

export function timingBand(elapsedMs: number, answerMode: AnswerFormat = 'input'): TimingBand {
  const [fast, slow] = answerMode === 'choice' ? [4500, 12000] : [7000, 20000];
  if (elapsedMs <= fast) return 'fast';
  if (elapsedMs >= slow) return 'slow';
  return 'normal';
}

export function scoreAttemptDelta(
  result: AnswerResult,
  nearMiss: boolean,
  elapsedMs: number,
  answerMode: AnswerFormat = 'input'
): number {
  if (result === 'revealed') return 10;
  if (result === 'wrong' && nearMiss) return 4;
  if (result === 'wrong') return timingBand(elapsedMs, answerMode) === 'fast' ? 8 : 6;
  if (timingBand(elapsedMs, answerMode) === 'fast') return -4;
  if (timingBand(elapsedMs, answerMode) === 'slow') return 3;
  return -2;
}

function attemptDelta(attempt: Attempt): number {
  return attempt.priorityDelta ?? scoreAttemptDelta(attempt.result, Boolean(attempt.nearMiss), attempt.elapsedMs, answerModeFor(attempt));
}

function reviewLabel(score: number): ReviewItem['label'] {
  if (score >= 12) return '最優先';
  if (score >= 5) return '要復習';
  return '確認';
}

function stringifyAnswer(input: string | string[]): string {
  return Array.isArray(input) ? input.join(' / ') : input;
}

export function getWrongQuestionIds(attempts: Attempt[]): string[] {
  const wrong = attempts
    .filter((attempt) => attempt.result === 'wrong' || attempt.result === 'revealed')
    .map((attempt) => attempt.questionId);
  return [...new Set(wrong)].reverse();
}

export function buildMistakeQuestions(allQuestions: Question[], attempts: Attempt[]): Question[] {
  const wrongIds = new Set(getWrongQuestionIds(attempts));
  return allQuestions.filter((question) => wrongIds.has(question.id));
}

export function summarizeWeakModules(attempts: Attempt[]): Record<string, number> {
  return attempts.reduce<Record<string, number>>((acc, attempt) => {
    if (attempt.result === 'correct') return acc;
    acc[attempt.moduleId] = (acc[attempt.moduleId] ?? 0) + 1;
    return acc;
  }, {});
}

export function buildReviewQueue(attempts: Attempt[], questions: Question[]): ReviewItem[] {
  const byQuestion = new Map(questions.map((question) => [question.id, question]));
  const groups = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const records = groups.get(attempt.questionId) ?? [];
    records.push(attempt);
    groups.set(attempt.questionId, records);
  }

  return [...groups.entries()]
    .map(([questionId, records]) => {
      const question = byQuestion.get(questionId);
      if (!question) return undefined;
      const score = records.reduce((total, attempt) => total + attemptDelta(attempt), 0);
      if (score <= 0) return undefined;
      return {
        question,
        score,
        label: reviewLabel(score),
        attempts: records.length,
        lastAttemptAt: Math.max(...records.map(attemptTime))
      } satisfies ReviewItem;
    })
    .filter((item): item is ReviewItem => Boolean(item))
    .sort((a, b) => b.score - a.score || b.lastAttemptAt - a.lastAttemptAt);
}

export function analyzeProblems(attempts: Attempt[], questions: Question[]): ProblemAnalysis[] {
  const queueScores = new Map(buildReviewQueue(attempts, questions).map((item) => [item.question.id, item.score]));
  const byQuestion = new Map(questions.map((question) => [question.id, question]));
  const groups = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const records = groups.get(attempt.questionId) ?? [];
    records.push(attempt);
    groups.set(attempt.questionId, records);
  }

  return [...groups.entries()]
    .map(([questionId, rawRecords]) => {
      const question = byQuestion.get(questionId);
      if (!question) return undefined;
      const records = rawRecords.sort((a, b) => attemptTime(a) - attemptTime(b));
      const wrongRecords = records.filter((attempt) => attempt.result === 'wrong');
      const correctRecords = records.filter((attempt) => attempt.result === 'correct');
      const revealedRecords = records.filter((attempt) => attempt.result === 'revealed');
      const tags: string[] = [];

      if (revealedRecords.length) tags.push(`答え表示 ${revealedRecords.length}回`);
      const nearMissCount = wrongRecords.filter((attempt) => attempt.nearMiss).length;
      if (nearMissCount) tags.push(`ニアミス ${nearMissCount}回`);
      if (wrongRecords.some((attempt) => timingBand(attempt.elapsedMs, answerModeFor(attempt)) === 'fast')) tags.push('即答ミス');
      if (wrongRecords.some((attempt) => timingBand(attempt.elapsedMs, answerModeFor(attempt)) === 'slow')) tags.push('長考して誤答');
      if (correctRecords.some((attempt) => timingBand(attempt.elapsedMs, answerModeFor(attempt)) === 'slow')) tags.push('正解だが想起が遅い');

      const wrongAnswerPatterns = [...wrongRecords
        .map((attempt) => stringifyAnswer(attempt.input).trim())
        .filter(Boolean)
        .reduce<Map<string, number>>((acc, answer) => acc.set(answer, (acc.get(answer) ?? 0) + 1), new Map())
        .entries()]
        .map(([answer, count]) => ({ answer, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
      if (wrongAnswerPatterns.some((pattern) => pattern.count >= 2)) tags.push('同じ誤答を反復');

      const firstCorrectIndex = records.findIndex((attempt) => attempt.result === 'correct');
      if (firstCorrectIndex >= 0 && records.slice(firstCorrectIndex + 1).some((attempt) => attempt.result !== 'correct')) {
        tags.push('正解後に再失敗');
      }
      if (!tags.length && wrongRecords.length) tags.push('単発の誤答');

      const reviewScore = queueScores.get(questionId) ?? 0;
      const lastAttemptAt = Math.max(...records.map(attemptTime));
      const averageElapsedMs = records.reduce((total, attempt) => total + Math.max(0, attempt.elapsedMs), 0) / records.length;
      const failures = wrongRecords.length + revealedRecords.length;

      return {
        question,
        total: records.length,
        correct: correctRecords.length,
        wrong: wrongRecords.length,
        revealed: revealedRecords.length,
        accuracy: records.length ? correctRecords.length / records.length : 0,
        averageElapsedMs,
        reviewScore,
        priorityLabel: reviewScore > 0 ? reviewLabel(reviewScore) : '安定',
        mistakeTags: tags,
        wrongAnswerPatterns,
        lastAttemptAt,
        needsAttention: reviewScore > 0 || failures > 0 || tags.includes('正解だが想起が遅い')
      } satisfies ProblemAnalysis;
    })
    .filter((item): item is ProblemAnalysis => Boolean(item))
    .sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention) || b.reviewScore - a.reviewScore || b.lastAttemptAt - a.lastAttemptAt);
}
