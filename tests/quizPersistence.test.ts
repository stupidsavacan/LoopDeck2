import { describe, expect, it, vi } from 'vitest';
import type { Attempt, ReviewCard, ReviewLog } from '../src/core/models';
import { persistAttemptAndReview, type QuizPersistenceStore } from '../src/services/quizPersistence';

function attempt(): Attempt {
  return {
    attemptId: 'attempt-1',
    questionId: 'q1',
    moduleId: 'm1',
    answeredAt: '2026-09-27T00:00:00.000Z',
    result: 'wrong',
    input: 'x',
    answer: 'a',
    elapsedMs: 1200,
    mode: 'normal',
    answerMode: 'input'
  };
}

describe('quiz persistence service', () => {
  it('persists attempt, updated review card and review log without any DOM', async () => {
    const cards: ReviewCard[] = [];
    const logs: ReviewLog[] = [];
    const store: QuizPersistenceStore = {
      saveAttemptWithReview: vi.fn(async (_attempt: Attempt, card: ReviewCard, log: ReviewLog) => {
        cards.push(card);
        logs.push(log);
      }),
      getReviewCard: vi.fn(async () => undefined)
    };

    await persistAttemptAndReview(attempt(), store);

    expect(store.saveAttemptWithReview).toHaveBeenCalledOnce();
    expect(store.getReviewCard).toHaveBeenCalledWith('q1');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ questionId: 'q1', moduleId: 'm1', totalReviews: 1, totalWrong: 1 });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ questionId: 'q1', attemptId: 'attempt-1', result: 'wrong' });
    expect(logs[0].reviewedAt).toBe(attempt().answeredAt);
    expect(cards[0].createdAt).toBe(attempt().answeredAt);
    expect(cards[0].dueAt).toBe('2026-09-27T00:10:00.000Z');
  });
});
