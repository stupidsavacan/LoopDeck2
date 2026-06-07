import { describe, expect, it } from 'vitest';
import { buildGeneratedChoices } from '../src/core/choiceGenerator';
import type { InputQuestion } from '../src/core/models';

const questions: InputQuestion[] = [
  { id: 'leap_final-201', moduleId: 'leap_final', type: 'input', prompt: 'company', answer: '会社', acceptableAnswers: ['企業'], category: '仕事' },
  { id: 'leap_final-202', moduleId: 'leap_final', type: 'input', prompt: 'business', answer: '企業', category: '仕事' },
  { id: 'leap_final-203', moduleId: 'leap_final', type: 'input', prompt: 'job', answer: '仕事', category: '仕事' },
  { id: 'leap_final-204', moduleId: 'leap_final', type: 'input', prompt: 'office', answer: '事務所', category: '仕事' },
  { id: 'leap_final-205', moduleId: 'leap_final', type: 'input', prompt: 'staff', answer: '職員', category: '仕事' }
];

const fixedRandom = (): number => 0.25;

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
});
