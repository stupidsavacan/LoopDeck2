import type { Attempt, Question } from './models';

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
