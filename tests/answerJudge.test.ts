import { describe, expect, it } from 'vitest';
import { judgeInputAnswer, judgeMultiSelectAnswer } from '../src/core/answerJudge';
import type { InputQuestion, MultiSelectQuestion } from '../src/core/models';

const tokugawaQuestion: InputQuestion = {
  id: 'q1',
  moduleId: 'history',
  type: 'input',
  prompt: '江戸幕府を開いた人物は？',
  answer: '徳川家康'
};

describe('answer judging', () => {
  it('rejects partial Japanese answers', () => {
    expect(judgeInputAnswer(tokugawaQuestion, '徳川')).toBe(false);
  });

  it('accepts exact Japanese answers', () => {
    expect(judgeInputAnswer(tokugawaQuestion, '徳川家康')).toBe(true);
  });

  it('accepts natural longer answers containing the full answer', () => {
    expect(judgeInputAnswer(tokugawaQuestion, '答えは徳川家康です')).toBe(true);
  });

  it('judges multi-select by exact set equality', () => {
    const q: MultiSelectQuestion = {
      id: 'm1',
      moduleId: 'history',
      type: 'multi_select',
      prompt: '三大改革',
      choices: ['享保の改革', '寛政の改革', '天保の改革', '明治維新'],
      correctChoices: ['享保の改革', '寛政の改革', '天保の改革']
    };
    expect(judgeMultiSelectAnswer(q, ['天保の改革', '享保の改革', '寛政の改革'])).toBe(true);
    expect(judgeMultiSelectAnswer(q, ['享保の改革', '寛政の改革'])).toBe(false);
  });
});
