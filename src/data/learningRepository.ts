import type { Attempt, ReviewCard, ReviewLog } from '../core/models';
import { applyReviewRating, createReviewCard, inferReviewRating } from '../core/scheduler';
import type { FlowSessionRecord } from '../flow/models';
import { db } from '../storage/db';

export interface LearningData {
  attempts: Attempt[];
  bookmarks: string[];
  reviewCards: ReviewCard[];
  reviewLogs: ReviewLog[];
}

export class LearningRepository {
  async readAll(): Promise<LearningData> {
    const [attempts, bookmarks, reviewCards, reviewLogs] = await Promise.all([
      db.getAttempts(), db.getBookmarks(), db.getReviewCards(), db.getReviewLogs()
    ]);
    return { attempts, bookmarks, reviewCards, reviewLogs };
  }

  async saveAttemptAndReview(attempt: Attempt): Promise<void> {
    await db.addAttempt(attempt);
    const base = (await db.getReviewCard(attempt.questionId)) ?? createReviewCard(attempt.questionId, attempt.moduleId);
    const rating = inferReviewRating(attempt.result, attempt.elapsedMs, attempt.answerMode ?? 'input');
    const { card, log } = applyReviewRating(base, rating, attempt.result, attempt.elapsedMs, { attemptId: attempt.attemptId });
    await db.putReviewCard(card);
    await db.putReviewLog(log);
  }

  async getBookmarks(): Promise<string[]> { return db.getBookmarks(); }
  async setBookmark(questionId: string, enabled: boolean): Promise<void> { await db.setBookmark(questionId, enabled); }

  async putSession(session: FlowSessionRecord): Promise<void> { await db.putFlowSession({ ...session, updatedAt: new Date().toISOString() }); }
  async getSession(sessionId: string): Promise<FlowSessionRecord | undefined> { return db.getFlowSession(sessionId); }
  async getSessions(): Promise<FlowSessionRecord[]> { return db.getFlowSessions(); }
  async latestPausedSession(): Promise<FlowSessionRecord | undefined> {
    const sessions = await db.getFlowSessions();
    return sessions
      .filter((session) => session.status !== 'completed' && session.index < session.entries.length)
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0];
  }
}

export const learningRepository = new LearningRepository();
