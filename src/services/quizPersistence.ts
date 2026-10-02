import type { Attempt, ReviewCard, ReviewLog } from '../core/models';
import { applyReviewRating, createReviewCard, inferReviewRating } from '../core/scheduler';
import { answerModeFor } from '../core/reviewEngine';

export interface QuizPersistenceStore {
  saveAttemptWithReview(attempt: Attempt, card: ReviewCard, log: ReviewLog): Promise<void>;
  getReviewCard(questionId: string): Promise<ReviewCard | undefined>;
}

export function buildReviewPersistence(attempt: Attempt, existingCard?: ReviewCard): { card: ReviewCard; log: ReviewLog } {
  const answeredAt = new Date(attempt.answeredAt);
  const now = Number.isFinite(answeredAt.getTime()) ? answeredAt : new Date();
  const baseCard = existingCard ?? createReviewCard(attempt.questionId, attempt.moduleId, now);
  const rating = inferReviewRating(attempt.result, attempt.elapsedMs, answerModeFor(attempt));
  return applyReviewRating(baseCard, rating, attempt.result, attempt.elapsedMs, { attemptId: attempt.attemptId, now });
}

export async function persistAttemptAndReview(attempt: Attempt, store: QuizPersistenceStore): Promise<void> {
  const existingCard = await store.getReviewCard(attempt.questionId);
  const { card, log } = buildReviewPersistence(attempt, existingCard);
  await store.saveAttemptWithReview(attempt, card, log);
}
