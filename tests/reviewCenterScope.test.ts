// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Attempt, LoopDeckPack, ReviewCard } from '../src/core/models';
import { resolveActivePacks } from '../src/packs/packResolver';
import { renderReviewCenter } from '../src/screens/reviewCenter';
import { db } from '../src/storage/db';

const pack: LoopDeckPack = {
  packVersion: 1,
  packId: 'review-scope-pack',
  title: 'Review scope',
  folders: [{ id: 'f', title: 'Folder' }],
  modules: [
    { id: 'recent-module', folderId: 'f', title: 'Recent module', subject: 'test', questionIds: ['recent-q'] },
    { id: 'old-module', folderId: 'f', title: 'Old module', subject: 'test', questionIds: ['old-q'] }
  ],
  questions: [
    { id: 'recent-q', moduleId: 'recent-module', type: 'input', prompt: 'RECENT QUESTION', answer: 'a' },
    { id: 'old-q', moduleId: 'old-module', type: 'input', prompt: 'OLD QUESTION', answer: 'b' }
  ]
};

function attempt(id: string, questionId: string, moduleId: string, ageDays: number): Attempt {
  return {
    attemptId: id,
    questionId,
    moduleId,
    answeredAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString(),
    result: 'wrong',
    input: 'x',
    answer: 'a',
    elapsedMs: 1000,
    mode: 'normal',
    answerMode: 'input'
  };
}

function dueCard(questionId: string, moduleId: string): ReviewCard {
  const now = new Date().toISOString();
  return {
    questionId,
    moduleId,
    state: 'review',
    dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    lastReviewedAt: now,
    firstReviewedAt: now,
    intervalDays: 1,
    ease: 2.5,
    totalReviews: 1,
    totalCorrect: 0,
    totalWrong: 1,
    correctStreak: 0,
    wrongStreak: 1,
    lapseCount: 0,
    leechLevel: 0,
    suspended: false,
    createdAt: now,
    updatedAt: now
  };
}

describe('Review Center scope', () => {
  beforeEach(async () => {
    sessionStorage.removeItem('loopdeck_review_scope_session_v1');
    await db.clearAttempts();
    await db.clearReviewData();
    await db.addAttempt(attempt('recent-attempt', 'recent-q', 'recent-module', 1));
    await db.addAttempt(attempt('old-attempt', 'old-q', 'old-module', 8));
    await db.putReviewCard(dueCard('recent-q', 'recent-module'));
    await db.putReviewCard(dueCard('old-q', 'old-module'));
  });

  it('hides stale module questions by default and restores them in all-history scope', async () => {
    const root = document.createElement('div');
    const view = resolveActivePacks([pack]);

    await renderReviewCenter(root, view, () => {}, () => {});

    expect(root.textContent).toContain('RECENT QUESTION');
    expect(root.textContent).not.toContain('OLD QUESTION');
    expect(root.textContent).toContain('過去教材の復習予定 1問は非表示です。');

    const toggle = [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '過去の教材も表示');
    expect(toggle).toBeDefined();

    toggle!.click();
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    expect(root.textContent).toContain('OLD QUESTION');
    expect(sessionStorage.getItem('loopdeck_review_scope_session_v1')).toBe('all');
  });
});
