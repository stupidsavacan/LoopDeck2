import { describe, expect, it } from 'vitest';
import type { Question } from '../src/core/models';
import {
  buildWrongAnswerExplanation,
  collectAnswerTexts,
  findQuestionByAnswer,
  normalizeWrongAnswerLookup
} from '../src/core/wrongAnswerExplanation';

const mitochondria = '\u30df\u30c8\u30b3\u30f3\u30c9\u30ea\u30a2';
const chloroplast = '\u8449\u7dd1\u4f53';
const pacific = '\u592a\u5e73\u6d0b';

const current: Question = {
  id: 'q-current',
  moduleId: 'biology',
  type: 'input',
  prompt: '\u547c\u5438\u306b\u95a2\u308f\u308b\u7d30\u80de\u5c0f\u5668\u5b98',
  answer: mitochondria,
  explanation: '\u30df\u30c8\u30b3\u30f3\u30c9\u30ea\u30a2\u306f\u547c\u5438\u306b\u95a2\u308f\u308a\u307e\u3059\u3002'
};

const otherSameModule: Question = {
  id: 'q-other',
  moduleId: 'biology',
  type: 'input',
  prompt: '\u5149\u5408\u6210\u306b\u95a2\u308f\u308b\u7d30\u80de\u5c0f\u5668\u5b98',
  answer: chloroplast,
  acceptedAnswers: ['\u8449 \u7dd1 \u4f53'],
  explanation: '\u8449\u7dd1\u4f53\u306f\u5149\u5408\u6210\u306b\u95a2\u308f\u308a\u307e\u3059\u3002'
};

const otherModule: Question = {
  id: 'q-geography',
  moduleId: 'geography',
  type: 'input',
  prompt: '\u4e16\u754c\u6700\u5927\u306e\u6d77\u6d0b',
  answer: pacific,
  acceptableAnswers: ['\u5927\u897f\u6d0b']
};

describe('wrong answer explanation lookup', () => {
  it('normalizes punctuation, spaces, width, and case for exact lookup', () => {
    expect(normalizeWrongAnswerLookup(' A = B ')).toBe(normalizeWrongAnswerLookup('a b'));
    expect(normalizeWrongAnswerLookup('\u8449 \u7dd1\u4f53\uff01')).toBe(normalizeWrongAnswerLookup(chloroplast));
  });

  it('collects answer, acceptableAnswers, acceptedAnswers, sides, and multi-select choices', () => {
    const multi: Question = {
      id: 'multi',
      moduleId: 'm',
      type: 'multi_select',
      prompt: 'select',
      choices: ['a', 'b'],
      correctChoices: ['a', 'b'],
      sides: {
        front: { label: 'front', text: 'front text', acceptableAnswers: ['front alt'] },
        back: { label: 'back', text: 'back text', acceptableAnswers: ['back alt'] }
      }
    };

    expect(collectAnswerTexts(multi)).toEqual(['front text', 'front alt', 'back text', 'back alt', 'a', 'b']);
  });

  it('finds another same-module question by answer before other modules', () => {
    const hit = findQuestionByAnswer(chloroplast, current, [current, otherModule, otherSameModule]);

    expect(hit?.question.id).toBe('q-other');
    expect(hit?.matchedAnswer).toBe(chloroplast);
  });

  it('finds acceptable and accepted answers from other questions', () => {
    expect(buildWrongAnswerExplanation('choice', '\u5927\u897f\u6d0b', current, [current, otherModule])?.matchedQuestionId).toBe('q-geography');
    expect(buildWrongAnswerExplanation('input', '\u8449\u7dd1\u4f53', current, [current, otherSameModule])?.explanation).toContain('\u5149\u5408\u6210');
  });

  it('returns a not-found explanation when no registered answer matches', () => {
    const explanation = buildWrongAnswerExplanation('input', '\u5168\u304f\u9055\u3046\u7b54\u3048', current, [current, otherSameModule]);

    expect(explanation).toMatchObject({ source: 'input', found: false });
  });
});
