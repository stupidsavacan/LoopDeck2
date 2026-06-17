import { describe, expect, it } from 'vitest';
import { buildGeneratedChoices } from '../src/core/choiceGenerator';
import type { InputQuestion } from '../src/core/models';
import { presentQuestionForStudy } from '../src/core/questionPresentation';

const questions: InputQuestion[] = [
  { id: 'leap_final-201', moduleId: 'leap_final', type: 'input', prompt: 'company', answer: '会社', acceptableAnswers: ['企業'], category: '仕事' },
  { id: 'leap_final-202', moduleId: 'leap_final', type: 'input', prompt: 'business', answer: '企業', category: '仕事' },
  { id: 'leap_final-203', moduleId: 'leap_final', type: 'input', prompt: 'job', answer: '仕事', category: '仕事' },
  { id: 'leap_final-204', moduleId: 'leap_final', type: 'input', prompt: 'office', answer: '事務所', category: '仕事' },
  { id: 'leap_final-205', moduleId: 'leap_final', type: 'input', prompt: 'staff', answer: '職員', category: '仕事' }
];

const twoSidedQuestions: InputQuestion[] = [
  {
    id: 'two-1', moduleId: 'leap', type: 'input', prompt: 'modern', answer: '現代の', category: '形容詞',
    sides: { front: { label: '英語', text: 'modern', acceptableAnswers: ['modern'] }, back: { label: '日本語', text: '現代の', acceptableAnswers: ['現代の'] } },
    supportedStudyModes: ['front_to_back', 'back_to_front']
  },
  {
    id: 'two-2', moduleId: 'leap', type: 'input', prompt: 'important', answer: '重要な', category: '形容詞',
    sides: { front: { label: '英語', text: 'important', acceptableAnswers: ['important'] }, back: { label: '日本語', text: '重要な', acceptableAnswers: ['重要な'] } },
    supportedStudyModes: ['front_to_back', 'back_to_front']
  },
  {
    id: 'two-3', moduleId: 'leap', type: 'input', prompt: 'complex', answer: '複雑な', category: '形容詞',
    sides: { front: { label: '英語', text: 'complex', acceptableAnswers: ['complex'] }, back: { label: '日本語', text: '複雑な', acceptableAnswers: ['複雑な'] } },
    supportedStudyModes: ['front_to_back', 'back_to_front']
  },
  {
    id: 'two-4', moduleId: 'leap', type: 'input', prompt: 'obvious', answer: '明らかな', category: '形容詞',
    sides: { front: { label: '英語', text: 'obvious', acceptableAnswers: ['obvious'] }, back: { label: '日本語', text: '明らかな', acceptableAnswers: ['明らかな'] } },
    supportedStudyModes: ['front_to_back', 'back_to_front']
  },
  {
    id: 'two-5', moduleId: 'leap', type: 'input', prompt: 'local', answer: '地元の', category: '形容詞',
    sides: { front: { label: '英語', text: 'local', acceptableAnswers: ['local'] }, back: { label: '日本語', text: '地元の', acceptableAnswers: ['地元の'] } },
    supportedStudyModes: ['front_to_back', 'back_to_front']
  }
];

const fixedRandom = (): number => 0.25;

function asInput(question: ReturnType<typeof presentQuestionForStudy>): InputQuestion {
  if (question.type !== 'input') throw new Error('Expected input question');
  return question;
}

describe('generated four-choice answers', () => {
  it('builds four unique options including the correct answer', () => {
    const choices = buildGeneratedChoices(questions[0], questions, 4, fixedRandom);

    expect(choices).toHaveLength(4);
    expect(choices).toContain('会社');
    expect(new Set(choices).size).toBe(4);
  });

  it('does not use an acceptable answer as a wrong choice', () => {
    const choices = buildGeneratedChoices(questions[0], questions, 4, fixedRandom);

    expect(choices).not.toContain('企業');
  });

  it('returns undefined when there are not enough safe distractors', () => {
    expect(buildGeneratedChoices(questions[0], questions.slice(0, 3), 4, fixedRandom)).toBeUndefined();
  });

  it('uses only Japanese choices for English to Japanese mode', () => {
    const current = asInput(presentQuestionForStudy(twoSidedQuestions[0], 'front_to_back'));
    const choices = buildGeneratedChoices(current, twoSidedQuestions, 4, fixedRandom);

    expect(choices).toHaveLength(4);
    expect(choices).toContain('現代の');
    expect(choices?.every((choice) => !/[A-Za-z]/.test(choice))).toBe(true);
  });

  it('uses only English choices for Japanese to English mode', () => {
    const current = asInput(presentQuestionForStudy(twoSidedQuestions[0], 'back_to_front'));
    const choices = buildGeneratedChoices(current, twoSidedQuestions, 4, fixedRandom);

    expect(choices).toHaveLength(4);
    expect(choices).toContain('modern');
    expect(choices?.every((choice) => /^[A-Za-z]+$/.test(choice))).toBe(true);
  });

  it('does not mix distractor languages when the current mixed question is locked to one mode', () => {
    const current = asInput(presentQuestionForStudy(twoSidedQuestions[0], 'back_to_front'));
    const choices = buildGeneratedChoices(current, twoSidedQuestions, 4, fixedRandom);

    expect(choices?.every((choice) => /^[A-Za-z]+$/.test(choice))).toBe(true);
    expect(choices).not.toContain('重要な');
  });
});
