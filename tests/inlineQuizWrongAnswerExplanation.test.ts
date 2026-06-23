// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { ModuleInfo, Question } from '../src/core/models';
import { createSession } from '../src/core/sessionEngine';
import { renderInlineQuiz } from '../src/screens/inlineQuiz';

const moduleInfo: ModuleInfo = {
  id: 'biology',
  folderId: 'science',
  title: 'Biology',
  subject: 'Science',
  questionIds: ['q-choice', 'q-input', 'q-other']
};

const mitochondria = '\u30df\u30c8\u30b3\u30f3\u30c9\u30ea\u30a2';
const chloroplast = '\u8449\u7dd1\u4f53';
const chloroplastExplanation = '\u8449\u7dd1\u4f53\u306f\u5149\u5408\u6210\u306b\u95a2\u308f\u308b\u7d30\u80de\u5c0f\u5668\u5b98\u3067\u3059\u3002';

const choiceQuestion: Question = {
  id: 'q-choice',
  moduleId: moduleInfo.id,
  type: 'choice',
  prompt: '\u547c\u5438\u306b\u95a2\u308f\u308b\u7d30\u80de\u5c0f\u5668\u5b98',
  choices: [mitochondria, chloroplast],
  answer: mitochondria,
  explanation: '\u30df\u30c8\u30b3\u30f3\u30c9\u30ea\u30a2\u306f\u547c\u5438\u306b\u95a2\u308f\u308a\u307e\u3059\u3002'
};

const inputQuestion: Question = {
  id: 'q-input',
  moduleId: moduleInfo.id,
  type: 'input',
  prompt: '\u547c\u5438\u306b\u95a2\u308f\u308b\u7d30\u80de\u5c0f\u5668\u5b98',
  answer: mitochondria,
  explanation: '\u30df\u30c8\u30b3\u30f3\u30c9\u30ea\u30a2\u306f\u547c\u5438\u306b\u95a2\u308f\u308a\u307e\u3059\u3002'
};

const otherQuestion: Question = {
  id: 'q-other',
  moduleId: moduleInfo.id,
  type: 'input',
  prompt: '\u5149\u5408\u6210\u306b\u95a2\u308f\u308b\u7d30\u80de\u5c0f\u5668\u5b98',
  answer: chloroplast,
  acceptedAnswers: ['\u8449 \u7dd1 \u4f53'],
  explanation: chloroplastExplanation
};

function settle(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 50));
}

describe('renderInlineQuiz wrong answer explanations', () => {
  it('shows the matched question explanation for a wrong choice answer', async () => {
    const container = document.createElement('div');
    const session = createSession(moduleInfo, [choiceQuestion], { shuffle: false, autoNext: false, questionLimit: 'all' }, 'normal', [choiceQuestion, otherQuestion]);
    renderInlineQuiz(container, session, { onSessionChange() {}, onComplete() {} });

    [...container.querySelectorAll<HTMLButtonElement>('.choice-btn')]
      .find((button) => button.textContent === chloroplast)!
      .click();
    await settle();

    expect(container.querySelector('.correct-answer-explanation')?.textContent).toContain('\u6b63\u89e3\u306e\u89e3\u8aac');
    expect(container.querySelector('.wrong-answer-explanation')?.textContent).toContain('\u9078\u3093\u3060\u7b54\u3048\u306e\u89e3\u8aac');
    expect(container.querySelector('.wrong-answer-explanation')?.textContent).toContain(chloroplastExplanation);
  });

  it('shows the matched question explanation for a wrong input answer', async () => {
    const container = document.createElement('div');
    const session = createSession(moduleInfo, [inputQuestion], { shuffle: false, autoNext: false, questionLimit: 'all', answerFormat: 'input' }, 'normal', [inputQuestion, otherQuestion]);
    renderInlineQuiz(container, session, { onSessionChange() {}, onComplete() {} });

    const input = container.querySelector<HTMLInputElement>('input.text-input')!;
    input.value = '\u8449 \u7dd1\u4f53';
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '\u56de\u7b54\u3059\u308b')!
      .click();
    await settle();

    expect(container.querySelector('.wrong-answer-explanation')?.textContent).toContain('\u5165\u529b\u3057\u305f\u7b54\u3048\u306e\u89e3\u8aac');
    expect(container.querySelector('.wrong-answer-explanation')?.textContent).toContain(chloroplastExplanation);
  });

  it('shows a helpful fallback when a wrong answer does not match another question', async () => {
    const container = document.createElement('div');
    const session = createSession(moduleInfo, [inputQuestion], { shuffle: false, autoNext: false, questionLimit: 'all', answerFormat: 'input' }, 'normal', [inputQuestion, otherQuestion]);
    renderInlineQuiz(container, session, { onSessionChange() {}, onComplete() {} });

    const input = container.querySelector<HTMLInputElement>('input.text-input')!;
    input.value = '\u5168\u304f\u9055\u3046\u7b54\u3048';
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '\u56de\u7b54\u3059\u308b')!
      .click();
    await settle();

    expect(container.querySelector('.wrong-answer-explanation')?.textContent).toContain('\u3053\u306e\u554f\u984c\u306e\u7b54\u3048\u3067\u306f\u3042\u308a\u307e\u305b\u3093');
  });

  it('does not show wrong-answer explanation on a correct answer', async () => {
    const container = document.createElement('div');
    const session = createSession(moduleInfo, [inputQuestion], { shuffle: false, autoNext: false, questionLimit: 'all', answerFormat: 'input' }, 'normal', [inputQuestion, otherQuestion]);
    renderInlineQuiz(container, session, { onSessionChange() {}, onComplete() {} });

    const input = container.querySelector<HTMLInputElement>('input.text-input')!;
    input.value = mitochondria;
    [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === '\u56de\u7b54\u3059\u308b')!
      .click();
    await settle();

    expect(container.querySelector('.correct-answer-explanation')?.textContent).toContain('\u6b63\u89e3\u306e\u89e3\u8aac');
    expect(container.querySelector('.wrong-answer-explanation')).toBeNull();
  });
});
