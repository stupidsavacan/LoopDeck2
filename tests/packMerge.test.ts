import { describe, expect, it } from 'vitest';
import type { LoopDeckPack, ModuleInfo, Question } from '../src/core/models';
import { mergeLoopDeckPack } from '../src/packs/packMerge';
import { getQuestionById, getQuestionsForModule, resolveActivePacks } from '../src/packs/packResolver';

function inputQuestion(id: string, moduleId: string, prompt: string, answer = `${prompt} answer`): Question {
  return {
    id,
    moduleId,
    type: 'input',
    prompt,
    answer
  };
}

function moduleInfo(id: string, title: string, questionIds: string[]): ModuleInfo {
  return {
    id,
    folderId: 'term1_midterm',
    title,
    subject: '英語',
    description: `${title} description`,
    tags: [title],
    questionIds
  };
}

function pack(packId: string, title: string, modules: ModuleInfo[], questions: Question[]): LoopDeckPack {
  return {
    packVersion: 1,
    packId,
    title,
    folders: [{ id: 'term1_midterm', title: '一学期中間テスト' }],
    modules,
    questions
  };
}

describe('pack merge update', () => {
  it('appends a new question when importing the same packId', () => {
    const existing = pack(
      'custom-leap',
      'Custom LEAP',
      [moduleInfo('leap', 'LEAP', ['q1'])],
      [inputQuestion('q1', 'leap', 'company')]
    );
    const incoming = pack(
      'custom-leap',
      'Custom LEAP Updated',
      [moduleInfo('leap', 'LEAP Updated', ['q1', 'q2'])],
      [inputQuestion('q1', 'leap', 'company'), inputQuestion('q2', 'leap', 'business')]
    );

    const result = mergeLoopDeckPack(existing, incoming);

    expect(result.pack.questions.map((question) => question.id)).toEqual(['q1', 'q2']);
    expect(result.pack.modules[0]?.questionIds).toEqual(['q1', 'q2']);
    expect(result.summary.newQuestions).toBe(1);
    expect(result.summary.duplicateQuestionsSkipped).toBe(1);
  });

  it('skips an identical question without creating a duplicate', () => {
    const existing = pack(
      'custom-leap',
      'Custom LEAP',
      [moduleInfo('leap', 'LEAP', ['q1'])],
      [inputQuestion('q1', 'leap', 'company')]
    );
    const incoming = pack(
      'custom-leap',
      'Custom LEAP',
      [moduleInfo('leap', 'LEAP', ['q1'])],
      [inputQuestion('q1', 'leap', 'company')]
    );

    const result = mergeLoopDeckPack(existing, incoming);

    expect(result.pack.questions).toHaveLength(1);
    expect(result.pack.modules[0]?.questionIds).toEqual(['q1']);
    expect(result.summary.duplicateQuestionsSkipped).toBe(1);
    expect(result.summary.conflictingQuestionsRenamed).toBe(0);
  });

  it('renames a conflicting question ID and keeps both questions playable', () => {
    const existing = pack(
      'custom-leap',
      'Custom LEAP',
      [moduleInfo('leap', 'LEAP', ['q1'])],
      [inputQuestion('q1', 'leap', 'company', '会社')]
    );
    const incoming = pack(
      'custom-leap',
      'Custom LEAP Updated',
      [moduleInfo('leap', 'LEAP Updated', ['q1'])],
      [inputQuestion('q1', 'leap', 'business', '事業')]
    );

    const result = mergeLoopDeckPack(existing, incoming, {
      generateQuestionId: () => 'q1__merged_test'
    });

    expect(result.pack.questions.map((question) => question.id)).toEqual(['q1', 'q1__merged_test']);
    expect(result.pack.modules[0]?.questionIds).toEqual(['q1', 'q1__merged_test']);
    expect(result.pack.questions[0]?.prompt).toBe('company');
    expect(result.pack.questions[1]?.prompt).toBe('business');
    expect(result.pack.questions[1]?.originalId).toBe('q1');
    expect(result.summary.conflictingQuestionsRenamed).toBe(1);
    expect(result.summary.renamedQuestions).toEqual([{ from: 'q1', to: 'q1__merged_test', moduleId: 'leap' }]);
  });

  it('preserves existing module and question order before appending merged content', () => {
    const existing = pack(
      'custom-pack',
      'Custom Pack',
      [moduleInfo('m1', 'Module 1', ['q1']), moduleInfo('m2', 'Module 2', ['q2'])],
      [inputQuestion('q1', 'm1', 'one'), inputQuestion('q2', 'm2', 'two')]
    );
    const incoming = pack(
      'custom-pack',
      'Custom Pack Updated',
      [moduleInfo('m2', 'Module 2 Updated', ['q2', 'q3']), moduleInfo('m3', 'Module 3', ['q4'])],
      [inputQuestion('q2', 'm2', 'two'), inputQuestion('q3', 'm2', 'three'), inputQuestion('q4', 'm3', 'four')]
    );

    const result = mergeLoopDeckPack(existing, incoming);

    expect(result.pack.modules.map((module) => module.id)).toEqual(['m1', 'm2', 'm3']);
    expect(result.pack.modules[1]?.questionIds).toEqual(['q2', 'q3']);
    expect(result.pack.questions.map((question) => question.id)).toEqual(['q1', 'q2', 'q3', 'q4']);
    expect(result.summary.mergedModules).toBe(1);
    expect(result.summary.newModules).toBe(1);
  });

  it('does not rewrite existing user-data references to old question IDs', () => {
    const existingAttempt = { questionId: 'q1', moduleId: 'leap' };
    const existingBookmark = 'q1';
    const existingReviewCard = { questionId: 'q1', moduleId: 'leap' };
    const existing = pack(
      'custom-leap',
      'Custom LEAP',
      [moduleInfo('leap', 'LEAP', ['q1'])],
      [inputQuestion('q1', 'leap', 'company', '会社')]
    );
    const incoming = pack(
      'custom-leap',
      'Custom LEAP Updated',
      [moduleInfo('leap', 'LEAP Updated', ['q1'])],
      [inputQuestion('q1', 'leap', 'business', '事業')]
    );

    const result = mergeLoopDeckPack(existing, incoming, {
      generateQuestionId: () => 'q1__merged_test'
    });

    expect(getQuestionById(resolveActivePacks([result.pack]), existingAttempt.questionId)?.prompt).toBe('company');
    expect(getQuestionById(resolveActivePacks([result.pack]), existingBookmark)?.prompt).toBe('company');
    expect(getQuestionById(resolveActivePacks([result.pack]), existingReviewCard.questionId)?.prompt).toBe('company');
  });

  it('keeps packResolver stable after saving a merged pack', () => {
    const existing = pack(
      'custom-leap',
      'Custom LEAP',
      [moduleInfo('leap', 'LEAP', ['q1'])],
      [inputQuestion('q1', 'leap', 'company', '会社')]
    );
    const incoming = pack(
      'custom-leap',
      'Custom LEAP Updated',
      [moduleInfo('leap', 'LEAP Updated', ['q1', 'q2'])],
      [inputQuestion('q1', 'leap', 'business', '事業'), inputQuestion('q2', 'leap', 'office', '事務所')]
    );

    const result = mergeLoopDeckPack(existing, incoming, {
      generateQuestionId: () => 'q1__merged_test'
    });
    const view = resolveActivePacks([result.pack]);

    expect(getQuestionsForModule(view, 'leap').map((question) => question.id)).toEqual(['q1', 'q1__merged_test', 'q2']);
    expect(getQuestionById(view, 'q1')?.prompt).toBe('company');
    expect(getQuestionById(view, 'q1__merged_test')?.prompt).toBe('business');
    expect(getQuestionById(view, 'q2')?.prompt).toBe('office');
  });
});
