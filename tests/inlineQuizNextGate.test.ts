// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuleInfo, Question } from '../src/core/models';
import { createSession } from '../src/core/sessionEngine';
import { renderInlineQuiz } from '../src/screens/inlineQuiz';
import { db } from '../src/storage/db';

const moduleInfo: ModuleInfo = {
  id: 'next-gate-module',
  folderId: 'test',
  title: 'Next gate',
  subject: 'test',
  questionIds: ['input-q', 'choice-q']
};

const inputQuestion: Question = {
  id: 'input-q',
  moduleId: moduleInfo.id,
  type: 'input',
  prompt: 'Input?',
  answer: 'answer'
};

const choiceQuestion: Question = {
  id: 'choice-q',
  moduleId: moduleInfo.id,
  type: 'choice',
  prompt: 'Choice?',
  choices: ['A', 'B', 'C'],
  answer: 'B'
};

function stubPersistence(): void {
  vi.spyOn(db, 'addAttempt').mockResolvedValue();
  vi.spyOn(db, 'getBookmarks').mockResolvedValue([]);
  vi.spyOn(db, 'getReviewCard').mockResolvedValue(undefined);
  vi.spyOn(db, 'putReviewCard').mockResolvedValue();
  vi.spyOn(db, 'putReviewLog').mockResolvedValue();
}

describe('inline quiz Next gating', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubPersistence();
  });

  it('cannot advance an input question before answering, then advances with the attempt after submit', () => {
    const container = document.createElement('div');
    const onSessionChange = vi.fn();
    const session = createSession(moduleInfo, [inputQuestion], {
      shuffle: false,
      autoNext: false,
      questionLimit: 'all',
      answerFormat: 'input'
    });

    renderInlineQuiz(container, session, { onSessionChange, onComplete() {} });

    const next = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '次へ')!;
    const input = container.querySelector<HTMLInputElement>('input.text-input')!;
    const submit = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '回答する')!;

    expect(next.disabled).toBe(true);
    next.click();
    expect(onSessionChange).not.toHaveBeenCalled();

    input.value = 'answer';
    submit.click();

    expect(next.disabled).toBe(false);
    next.click();

    expect(onSessionChange).toHaveBeenCalledTimes(1);
    const advanced = onSessionChange.mock.calls[0][0];
    expect(advanced.index).toBe(1);
    expect(advanced.attempts).toHaveLength(1);
    expect(advanced.attempts[0]).toMatchObject({
      questionId: inputQuestion.id,
      result: 'correct',
      input: 'answer'
    });
  });

  it('enables Next after revealing the answer', () => {
    const container = document.createElement('div');
    const session = createSession(moduleInfo, [inputQuestion], {
      shuffle: false,
      autoNext: false,
      questionLimit: 'all',
      answerFormat: 'input'
    });

    renderInlineQuiz(container, session, { onSessionChange() {}, onComplete() {} });

    const next = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '次へ')!;
    const reveal = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '答えを見る')!;

    expect(next.disabled).toBe(true);
    reveal.click();
    expect(next.disabled).toBe(false);
  });

  it('keeps Next disabled for a choice question until an option records the answer', () => {
    const container = document.createElement('div');
    const session = createSession(moduleInfo, [choiceQuestion], {
      shuffle: false,
      autoNext: false,
      questionLimit: 'all',
      answerFormat: 'auto'
    });

    renderInlineQuiz(container, session, { onSessionChange() {}, onComplete() {} });

    const next = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '次へ')!;
    const choiceB = [...container.querySelectorAll<HTMLButtonElement>('.choice-btn')]
      .find((button) => button.textContent === 'B')!;

    expect(next.disabled).toBe(true);
    choiceB.click();
    expect(next.disabled).toBe(false);
  });
});
