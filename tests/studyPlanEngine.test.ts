import { describe, expect, it } from 'vitest';
import type { Attempt, Question, ReviewCard } from '../src/core/models';
import { buildStudyPlan } from '../src/flow/studyPlanEngine';

function questions(count: number): Question[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `q${index + 1}`,
    moduleId: `m${(index % 3) + 1}`,
    type: 'input' as const,
    prompt: `Question ${index + 1}`,
    answer: `Answer ${index + 1}`
  }));
}

function wrong(questionId: string, minutesAgo: number): Attempt {
  return {
    attemptId: `a-${questionId}-${minutesAgo}`,
    questionId,
    moduleId: `m${((Number(questionId.slice(1)) - 1) % 3) + 1}`,
    answeredAt: new Date(Date.UTC(2026, 0, 1, 12, 0) - minutesAgo * 60000).toISOString(),
    result: 'wrong', input: 'x', answer: 'y', elapsedMs: 5000, mode: 'normal'
  };
}

function due(questionId: string): ReviewCard {
  return {
    questionId, moduleId: `m${((Number(questionId.slice(1)) - 1) % 3) + 1}`, state: 'review',
    dueAt: '2026-01-01T09:00:00.000Z', lastReviewedAt: '2025-12-31T09:00:00.000Z', firstReviewedAt: '2025-12-01T09:00:00.000Z',
    intervalDays: 1, ease: 2.5, totalReviews: 2, totalCorrect: 1, totalWrong: 1, correctStreak: 0, wrongStreak: 1,
    lapseCount: 1, leechLevel: 0, suspended: false, createdAt: '2025-12-01T09:00:00.000Z', updatedAt: '2025-12-31T09:00:00.000Z'
  };
}

describe('StudyPlanEngine', () => {
  it('composes due, weak and new without duplicating shared candidates', () => {
    const all = questions(30);
    const attempts = [wrong('q1', 90), wrong('q2', 90), wrong('q3', 90), wrong('q4', 90)];
    const plan = buildStudyPlan({ questions: all, attempts, reviewCards: [due('q1'), due('q5'), due('q6'), due('q7'), due('q8')], budgetMinutes: 5, now: new Date('2026-01-01T12:00:00.000Z'), idFactory: (() => { let i = 0; return () => `id-${++i}`; })() });
    expect(plan.queue).toHaveLength(12);
    expect(new Set(plan.queue.map((entry) => entry.questionId)).size).toBe(12);
    const shared = plan.queue.find((entry) => entry.questionId === 'q1');
    expect(shared?.primaryReason).toBe('due');
    expect(shared?.reasons.map((reason) => reason.kind)).toEqual(['due', 'weak']);
    expect(plan.segments.map((segment) => segment.candidates.length)).toEqual([5, 5, 2]);
  });

  it('suppresses recent weak/new but never suppresses a genuinely due card', () => {
    const all = questions(20);
    const attempts = [wrong('q1', 5), wrong('q2', 5)];
    const plan = buildStudyPlan({ questions: all, attempts, reviewCards: [due('q1')], budgetMinutes: 5, now: new Date('2026-01-01T12:00:00.000Z'), idFactory: () => 'id' });
    expect(plan.queue.some((entry) => entry.questionId === 'q1')).toBe(true);
    expect(plan.excludedRecentQuestionIds).toContain('q2');
  });

  it('uses only new questions for a zero-history user and never pads with duplicates', () => {
    const plan = buildStudyPlan({ questions: questions(7), attempts: [], reviewCards: [], budgetMinutes: 20, idFactory: () => 'id' });
    expect(plan.queue).toHaveLength(7);
    expect(plan.queue.every((entry) => entry.primaryReason === 'new')).toBe(true);
  });
});
