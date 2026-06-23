import { describe, expect, it } from 'vitest';
import type { InputQuestion, ModuleInfo, Question } from '../src/core/models';
import {
  canAutoReverseQuestion,
  getModuleStudyQuestionModes,
  getStudyQuestionModeLabel,
  getSupportedStudyQuestionModes,
  presentQuestionForStudy
} from '../src/core/questionPresentation';
import { createSession, selectSessionQuestions } from '../src/core/sessionEngine';

const moduleInfo: ModuleInfo = {
  id: 'english-module',
  folderId: 'english',
  title: 'English Module',
  subject: 'English',
  questionIds: []
};

const modernMeaning = '\u73fe\u4ee3\u306e';
const modernAlt = '\u8fd1\u4ee3\u7684\u306a';

function inputQuestion(overrides: Partial<InputQuestion> = {}): InputQuestion {
  return {
    id: 'q-modern',
    moduleId: moduleInfo.id,
    type: 'input',
    prompt: 'modern',
    answer: modernMeaning,
    acceptableAnswers: [modernAlt],
    ...overrides
  };
}

describe('question presentation fallback reverse study', () => {
  it('auto-reverses English prompt / Japanese answers into Japanese to English study', () => {
    const question = inputQuestion();
    const presented = presentQuestionForStudy(question, 'back_to_front') as InputQuestion;

    expect(canAutoReverseQuestion(question)).toBe(true);
    expect(presented.prompt).toBe(`${modernMeaning}\u30fb${modernAlt}`);
    expect(presented.answer).toBe('modern');
    expect(presented.acceptedAnswers).toEqual(['modern']);
    expect(presented.activeStudyMode).toBe('back_to_front');
    expect(presented.autoReversed).toBe(true);
    expect(presented.directionLabel).toBe('\u65e5\u672c\u8a9e \u2192 \u82f1\u8a9e');
  });

  it('auto-reverses Japanese prompt / English answer into English to Japanese study', () => {
    const question = inputQuestion({ prompt: modernMeaning, answer: 'modern', acceptableAnswers: undefined });
    const presented = presentQuestionForStudy(question, 'front_to_back') as InputQuestion;

    expect(canAutoReverseQuestion(question)).toBe(true);
    expect(presented.prompt).toBe('modern');
    expect(presented.answer).toBe(modernMeaning);
    expect(presented.acceptedAnswers).toEqual([modernMeaning]);
    expect(presented.activeStudyMode).toBe('front_to_back');
    expect(presented.autoReversed).toBe(true);
    expect(presented.directionLabel).toBe('\u82f1\u8a9e \u2192 \u65e5\u672c\u8a9e');
  });

  it('exposes language direction labels without internal mode names', () => {
    const question = inputQuestion();

    expect(getSupportedStudyQuestionModes(question)).toEqual(['as_stored', 'front_to_back', 'back_to_front']);
    expect(getModuleStudyQuestionModes([question])).toEqual(['as_stored', 'front_to_back', 'back_to_front', 'mixed']);
    expect(getStudyQuestionModeLabel('front_to_back', question)).toBe('\u82f1\u8a9e \u2192 \u65e5\u672c\u8a9e');
    expect(getStudyQuestionModeLabel('back_to_front', question)).toBe('\u65e5\u672c\u8a9e \u2192 \u82f1\u8a9e');
  });

  it('does not auto-reverse mixed prompts, choices, multi-select, or image questions', () => {
    const mixed = inputQuestion({ id: 'mixed', prompt: `modern \u306e\u610f\u5473\u3092\u7b54\u3048\u3088` });
    const choice: Question = { id: 'choice', moduleId: moduleInfo.id, type: 'choice', prompt: 'modern', choices: ['a', 'b'], answer: 'a' };
    const multi: Question = { id: 'multi', moduleId: moduleInfo.id, type: 'multi_select', prompt: 'modern', choices: ['a', 'b'], correctChoices: ['a'] };
    const image = inputQuestion({ id: 'image', imageAsset: 'images/card.png' });

    expect(canAutoReverseQuestion(mixed)).toBe(false);
    expect(canAutoReverseQuestion(choice)).toBe(false);
    expect(canAutoReverseQuestion(multi)).toBe(false);
    expect(canAutoReverseQuestion(image)).toBe(false);
  });

  it('filters reverse sessions to compatible questions instead of mixing normal-direction fallbacks', () => {
    const reversible = inputQuestion({ id: 'reversible' });
    const mixed = inputQuestion({ id: 'mixed', prompt: `modern \u306e\u610f\u5473\u3092\u7b54\u3048\u3088` });
    const choice: Question = { id: 'choice', moduleId: moduleInfo.id, type: 'choice', prompt: 'modern', choices: ['a', 'b'], answer: 'a' };
    const selected = selectSessionQuestions([reversible, mixed, choice], {
      shuffle: false,
      autoNext: true,
      questionLimit: 'all',
      questionMode: 'back_to_front'
    });
    const session = createSession(moduleInfo, [reversible, mixed, choice], {
      shuffle: false,
      autoNext: true,
      questionLimit: 'all',
      questionMode: 'back_to_front'
    });

    expect(selected.map((question) => question.id)).toEqual(['reversible']);
    expect(session.queue).toHaveLength(1);
    expect(session.queue[0].prompt).toBe(`${modernMeaning}\u30fb${modernAlt}`);
  });
});
