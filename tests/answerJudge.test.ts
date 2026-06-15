import { describe, expect, it } from 'vitest';
import { isNearMissAnswer, judgeInputAnswer, judgeMultiSelectAnswer } from '../src/core/answerJudge';
import type { InputQuestion, MultiSelectQuestion } from '../src/core/models';

const tokugawaQuestion: InputQuestion = {
  id: 'q1',
  moduleId: 'history',
  type: 'input',
  prompt: '江戸幕府を開いた人物は？',
  answer: '徳川家康'
};

const englishQuestion: InputQuestion = {
  id: 'q2',
  moduleId: 'english',
  type: 'input',
  prompt: 'apple',
  answer: 'Apple'
};

const multiSelectQuestion: MultiSelectQuestion = {
  id: 'm1',
  moduleId: 'history',
  type: 'multi_select',
  prompt: '三大改革',
  choices: ['享保の改革', '寛政の改革', '天保の改革', '明治維新'],
  correctChoices: ['享保の改革', '寛政の改革', '天保の改革']
};

describe('answer judging', () => {
  it('accepts exact Japanese answers', () => {
    expect(judgeInputAnswer(tokugawaQuestion, '徳川家康')).toBe(true);
  });

  it('accepts natural longer answers containing the full Japanese answer', () => {
    expect(judgeInputAnswer(tokugawaQuestion, '答えは徳川家康です')).toBe(true);
  });

  it('rejects partial Japanese answers', () => {
    expect(judgeInputAnswer(tokugawaQuestion, '徳川')).toBe(false);
  });

  it('rejects Japanese negation that merely contains the full answer', () => {
    expect(judgeInputAnswer(tokugawaQuestion, '徳川家康ではなく徳川秀忠')).toBe(false);
  });

  it('normalizes whitespace and simple punctuation', () => {
    expect(judgeInputAnswer(tokugawaQuestion, '  徳川家康。 ')).toBe(true);
    expect(judgeInputAnswer({ ...englishQuestion, answer: 'New York' }, 'new   york.')).toBe(true);
  });

  it('judges English answers case-insensitively', () => {
    expect(judgeInputAnswer(englishQuestion, 'apple')).toBe(true);
    expect(judgeInputAnswer(englishQuestion, 'APPLE')).toBe(true);
  });

  it('does not accept English substrings inside another word', () => {
    expect(judgeInputAnswer({ ...englishQuestion, answer: 'war' }, 'reward')).toBe(false);
  });

  it('marks close wrong input as near miss without accepting it', () => {
    expect(judgeInputAnswer(englishQuestion, 'appl')).toBe(false);
    expect(isNearMissAnswer(englishQuestion, 'appl')).toBe(true);
  });

  it('does not mark entirely different two-character answers as near misses', () => {
    const shortQuestion: InputQuestion = { ...tokugawaQuestion, answer: 'あい' };
    expect(isNearMissAnswer(shortQuestion, 'うえ')).toBe(false);
    expect(isNearMissAnswer(shortQuestion, 'ええ')).toBe(false);
  });

  it('still marks a one-character typo in a short answer as a near miss', () => {
    const shortQuestion: InputQuestion = { ...tokugawaQuestion, answer: 'あい' };
    expect(isNearMissAnswer(shortQuestion, 'あえ')).toBe(true);
  });

  it('does not mark different single-character answers as near misses', () => {
    const singleCharacterQuestion: InputQuestion = { ...tokugawaQuestion, answer: 'あ' };
    expect(isNearMissAnswer(singleCharacterQuestion, 'い')).toBe(false);
  });
});

describe('multi-select judging', () => {
  it('accepts exact sets', () => {
    expect(judgeMultiSelectAnswer(multiSelectQuestion, ['享保の改革', '寛政の改革', '天保の改革'])).toBe(true);
  });

  it('rejects missing correct choices', () => {
    expect(judgeMultiSelectAnswer(multiSelectQuestion, ['享保の改革', '寛政の改革'])).toBe(false);
  });

  it('rejects extra wrong choices', () => {
    expect(judgeMultiSelectAnswer(multiSelectQuestion, ['享保の改革', '寛政の改革', '天保の改革', '明治維新'])).toBe(false);
  });

  it('ignores selection order', () => {
    expect(judgeMultiSelectAnswer(multiSelectQuestion, ['天保の改革', '享保の改革', '寛政の改革'])).toBe(true);
  });
});
