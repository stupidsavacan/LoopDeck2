import type { Attempt, ReviewCard, ReviewLog } from '../core/models';
import { applyReviewRating, createReviewCard, inferReviewRating } from '../core/scheduler';

export interface QuizPersistenceStore {
  addAttempt(attempt: Attempt): Promise<void>;
  getReviewCard(questionId: string): Promise<ReviewCard | undefined>;
  putReviewCard(card: ReviewCard): Promise<void>;
  putReviewLog(log: ReviewLog): Promise<void>;
}

export function buildReviewPersistence(attempt: Attempt, existingCard?: ReviewCard): { card: ReviewCard; log: ReviewLog } {
  const baseCard = existingCard ?? createReviewCard(attempt.questionId, attempt.moduleId);
  const rating = inferReviewRating(attempt.result, attempt.elapsedMs, attempt.answerMode ?? 'input');
  return applyReviewRating(baseCard, rating, attempt.result, attempt.elapsedMs, { attemptId: attempt.attemptId });
}

export async function persistAttemptAndReview(attempt: Attempt, store: QuizPersistenceStore): Promise<void> {
  await store.addAttempt(attempt);
  const existingCard = await store.getReviewCard(attempt.questionId);
  const { card, log } = buildReviewPersistence(attempt, existingCard);
  await store.putReviewCard(card);
  await store.putReviewLog(log);
}
