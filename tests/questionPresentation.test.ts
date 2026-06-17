import { describe, expect, it } from 'vitest';
import type { InputQuestion } from '../src/core/models';
import {
  getStudyQuestionModeLabel,
  presentQuestionForStudy,
  resolveConcreteStudyQuestionMode
} from '../src/core/questionPresentation';

const vocabularyQuestion: InputQuestion = {
  id: 'leap-301',
  moduleId: 'leap',
  type: 'input',
  prompt: 'modern',
  answer: '現代の',
  acceptableAnswers: ['近代的な'],
  number: 301,
  category: '形容詞',
  example: 'modern life',
  explanation: 'modern は「現代の」。',
  sides: {
    front: { label: '英語', text: 'modern', acceptableAnswers: ['modern'] },
    back: { label: '日本語', text: '現代の、近代的な', acceptableAnswers: ['現代の', '近代的な'] }
  },
  supportedStudyModes: ['front_to_back', 'back_to_front']
};

describe('study question presentation', () => {
  it('uses front as prompt and back as answer for front_to_back', () => {
    const presented = presentQuestionForStudy(vocabularyQuestion, 'front_to_back');

    expect(presented.prompt).toBe('modern');
    expect(presented.type).toBe('input');
    if (presented.type !== 'input') throw new Error('Expected input question');
    expect(presented.answer).toBe('現代の、近代的な');
    expect(presented.acceptableAnswers).toEqual(['現代の', '近代的な']);
  });

  it('uses back as prompt and front as answer for back_to_front', () => {
    const presented = presentQuestionForStudy(vocabularyQuestion, 'back_to_front');

    expect(presented.prompt).toBe('現代の、近代的な');
    expect(presented.type).toBe('input');
    if (presented.type !== 'input') throw new Error('Expected input question');
    expect(presented.answer).toBe('modern');
    expect(presented.acceptableAnswers).toEqual(['modern']);
  });

  it('sets activeStudyMode on presented questions', () => {
    expect(presentQuestionForStudy(vocabularyQuestion, 'front_to_back').activeStudyMode).toBe('front_to_back');
    expect(presentQuestionForStudy(vocabularyQuestion, 'as_stored').activeStudyMode).toBe('as_stored');
  });

  it('resolves mixed to one supported concrete mode', () => {
    expect(resolveConcreteStudyQuestionMode(vocabularyQuestion, 'mixed', () => 0)).toBe('front_to_back');
    expect(resolveConcreteStudyQuestionMode(vocabularyQuestion, 'mixed', () => 0.75)).toBe('back_to_front');
  });

  it('falls back to as_stored when sides are missing', () => {
    const normalQuestion: InputQuestion = { id: 'q', moduleId: 'm', type: 'input', prompt: 'A', answer: 'B' };

    expect(resolveConcreteStudyQuestionMode(normalQuestion, 'back_to_front')).toBe('as_stored');
    expect(presentQuestionForStudy(normalQuestion, 'back_to_front')).toMatchObject({ prompt: 'A', answer: 'B', activeStudyMode: 'as_stored' });
  });

  it('labels modes from side labels without saying reverse', () => {
    expect(getStudyQuestionModeLabel('front_to_back', vocabularyQuestion)).toBe('英語 → 日本語');
    expect(getStudyQuestionModeLabel('back_to_front', vocabularyQuestion)).toBe('日本語 → 英語');
    expect(getStudyQuestionModeLabel('mixed', vocabularyQuestion)).toBe('両方まぜる');
    expect(getStudyQuestionModeLabel('as_stored', vocabularyQuestion)).toBe('通常');
  });
});
