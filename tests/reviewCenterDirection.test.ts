// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Attempt, LoopDeckPack } from '../src/core/models';
import { createReviewCard } from '../src/core/scheduler';
import { resolveActivePacks } from '../src/packs/packResolver';
import { renderReviewCenter } from '../src/screens/reviewCenter';
import * as inlineQuiz from '../src/screens/inlineQuiz';
import { db } from '../src/storage/db';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('SRS Review Center presentation', () => {
  it('starts both directions of one question with the stored card-specific prompts and answers', async () => {
    const now = new Date();
    const pack: LoopDeckPack = {
      packVersion: 1,
      packId: 'directions',
      title: 'Directions',
      folders: [],
      modules: [{ id: 'm', folderId: '', title: 'Vocabulary', subject: 'English', questionIds: ['q'] }],
      questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'apple', answer: 'りんご' }]
    };
    const attempt: Attempt = {
      attemptId: 'a',
      questionId: 'q',
      moduleId: 'm',
      answeredAt: now.toISOString(),
      result: 'wrong',
      input: '',
      answer: 'りんご',
      elapsedMs: 1000,
      mode: 'normal',
      questionMode: 'front_to_back'
    };
    vi.spyOn(db, 'getAttempts').mockResolvedValue([attempt]);
    vi.spyOn(db, 'getImportedPackAssets').mockResolvedValue([]);
    vi.spyOn(db, 'getImportedPackRevisions').mockResolvedValue(new Map());
    vi.spyOn(db, 'getReviewCards').mockResolvedValue(
      ['front_to_back', 'back_to_front'].map((mode) => ({
        ...createReviewCard('q', 'm', now, mode as 'front_to_back' | 'back_to_front'),
        state: 'review',
        dueAt: new Date(now.getTime() - 1000).toISOString()
      }))
    );
    const render = vi.spyOn(inlineQuiz, 'renderInlineQuiz').mockImplementation(() => {});
    const root = document.createElement('div');
    await renderReviewCenter(
      root,
      resolveActivePacks([pack]),
      () => {},
      () => {}
    );
    const start = [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '今日の復習を始める');
    start?.click();
    expect(render).toHaveBeenCalledOnce();
    const session = render.mock.calls[0][1];
    expect(session.queue).toHaveLength(2);
    expect(session.sourceByQuestionId?.get('q')?.question.prompt).toBe('apple');
    expect(session.sourceByQuestionId?.get('q')?.packId).toBe('directions');
    expect(
      session.queue.map((question) => [question.activeStudyMode, question.prompt, question.type === 'input' ? question.answer : ''])
    ).toEqual([
      ['front_to_back', 'apple', 'りんご'],
      ['back_to_front', 'りんご', 'apple']
    ]);
  });
});
