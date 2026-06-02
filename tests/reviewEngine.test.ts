import { describe, expect, it } from 'vitest';
import { buildMistakeQuestions, getWrongQuestionIds, summarizeWeakModules } from '../src/core/reviewEngine';
import type { Attempt, Question } from '../src/core/models';

const attempts: Attempt[] = [
  { attemptId: 'a1', questionId: 'q1', moduleId: 'm1', answeredAt: '2026-06-02T00:00:00.000Z', result: 'wrong', input: 'x', answer: 'a', elapsedMs: 100, mode: 'normal' },
  { attemptId: 'a2', questionId: 'q2', moduleId: 'm1', answeredAt: '2026-06-02T00:01:00.000Z', result: 'correct', input: 'b', answer: 'b', elapsedMs: 100, mode: 'normal' },
  { attemptId: 'a3', questionId: 'q3', moduleId: 'm2', answeredAt: '2026-06-02T00:02:00.000Z', result: 'revealed', input: '', answer: 'c', elapsedMs: 100, mode: 'review' }
];

const questions: Question[] = [
  { id: 'q1', moduleId: 'm1', type: 'input', prompt: 'A?', answer: 'a' },
  { id: 'q2', moduleId: 'm1', type: 'input', prompt: 'B?', answer: 'b' },
  { id: 'q3', moduleId: 'm2', type: 'choice', prompt: 'C?', choices: ['c', 'd'], answer: 'c' }
];

describe('review engine', () => {
  it('collects wrong and revealed questions for mistake review', () => {
    expect(getWrongQuestionIds(attempts)).toEqual(['q3', 'q1']);
    expect(buildMistakeQuestions(questions, attempts).map((question) => question.id)).toEqual(['q1', 'q3']);
  });

  it('summarizes weak modules by non-correct attempts', () => {
    expect(summarizeWeakModules(attempts)).toEqual({ m1: 1, m2: 1 });
  });
});
