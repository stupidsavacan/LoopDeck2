import { describe, expect, it } from 'vitest';
import { analyzeProblems, buildMistakeQuestions, buildReviewQueue, getWrongQuestionIds, scoreAttemptDelta, summarizeWeakModules } from '../src/core/reviewEngine';
import type { Attempt, Question } from '../src/core/models';

const attempts: Attempt[] = [
  { attemptId: 'a1', questionId: 'q1', moduleId: 'm1', answeredAt: '2026-06-02T00:00:00.000Z', result: 'wrong', input: 'x', answer: 'a', elapsedMs: 100, mode: 'normal', answerMode: 'input' },
  { attemptId: 'a2', questionId: 'q2', moduleId: 'm1', answeredAt: '2026-06-02T00:01:00.000Z', result: 'correct', input: 'b', answer: 'b', elapsedMs: 100, mode: 'normal', answerMode: 'input' },
  { attemptId: 'a3', questionId: 'q3', moduleId: 'm2', answeredAt: '2026-06-02T00:02:00.000Z', result: 'revealed', input: '', answer: 'c', elapsedMs: 100, mode: 'review', answerMode: 'choice' },
  { attemptId: 'a4', questionId: 'q1', moduleId: 'm1', answeredAt: '2026-06-02T00:03:00.000Z', result: 'wrong', input: 'x', answer: 'a', elapsedMs: 500, mode: 'review', answerMode: 'input' },
  { attemptId: 'a5', questionId: 'q4', moduleId: 'm2', answeredAt: '2026-06-02T00:04:00.000Z', result: 'wrong', input: 'appl', answer: 'apple', elapsedMs: 5000, mode: 'normal', nearMiss: true, answerMode: 'input' }
];

const questions: Question[] = [
  { id: 'q1', moduleId: 'm1', type: 'input', prompt: 'A?', answer: 'a' },
  { id: 'q2', moduleId: 'm1', type: 'input', prompt: 'B?', answer: 'b' },
  { id: 'q3', moduleId: 'm2', type: 'choice', prompt: 'C?', choices: ['c', 'd'], answer: 'c' },
  { id: 'q4', moduleId: 'm2', type: 'input', prompt: 'Apple?', answer: 'apple' }
];

describe('review engine', () => {
  it('collects wrong and revealed questions for mistake review', () => {
    expect(getWrongQuestionIds(attempts)).toEqual(['q4', 'q3', 'q1']);
    expect(buildMistakeQuestions(questions, attempts).map((question) => question.id)).toEqual(['q1', 'q3', 'q4']);
  });

  it('summarizes weak modules by non-correct attempts', () => {
    expect(summarizeWeakModules(attempts)).toEqual({ m1: 2, m2: 2 });
  });

  it('scores StudyHome-Next style review priority', () => {
    expect(scoreAttemptDelta('revealed', false, 100, 'input')).toBe(10);
    expect(scoreAttemptDelta('wrong', true, 5000, 'input')).toBe(4);
    expect(scoreAttemptDelta('wrong', false, 100, 'choice')).toBe(8);
    expect(scoreAttemptDelta('correct', false, 25000, 'input')).toBe(3);
  });

  it('builds a sorted priority queue', () => {
    const queue = buildReviewQueue(attempts, questions);

    expect(queue[0]).toMatchObject({ question: questions[0], score: 16, label: '最優先', attempts: 2 });
    expect(queue.map((item) => item.question.id)).toEqual(['q1', 'q3', 'q4']);
  });

  it('analyzes repeated wrong input and near misses', () => {
    const analysis = analyzeProblems(attempts, questions);
    const q1 = analysis.find((item) => item.question.id === 'q1');
    const q4 = analysis.find((item) => item.question.id === 'q4');

    expect(q1?.mistakeTags).toContain('同じ誤答を反復');
    expect(q1?.wrongAnswerPatterns).toEqual([{ answer: 'x', count: 2 }]);
    expect(q4?.mistakeTags).toContain('ニアミス 1回');
  });
});
