import { describe, expect, it } from 'vitest';
import type { LoopDeckPack, ModuleInfo, Question } from '../src/core/models';
import { mergeLoopDeckPacks, mergeLoopDeckPacksIntoExisting } from '../src/packs/packMerger';
import { validatePack } from '../src/packs/packValidator';

function inputQuestion(id: string, moduleId: string, prompt: string, answer = `${prompt} answer`): Question {
  return {
    id,
    moduleId,
    type: 'input',
    prompt,
    answer
  };
}

function moduleInfo(id: string, title: string, questionIds: string[], overrides: Partial<ModuleInfo> = {}): ModuleInfo {
  return {
    id,
    folderId: 'folder-1',
    title,
    subject: '英語',
    description: `${title} description`,
    tags: [title],
    questionIds,
    ...overrides
  };
}

function pack(overrides: Partial<LoopDeckPack> = {}): LoopDeckPack {
  return {
    packVersion: 1,
    packId: 'shared-pack',
    title: 'Existing pack',
    description: 'Existing description',
    folders: [{ id: 'folder-1', title: 'Existing folder' }],
    modules: [moduleInfo('module-1', 'Existing module', ['q-1'])],
    questions: [inputQuestion('q-1', 'module-1', 'existing prompt')],
    ...overrides
  };
}

describe('mergeLoopDeckPacks', () => {
  it('merges packs with the same packId', () => {
    const existing = pack({ title: 'Old title' });
    const incoming = pack({ title: 'New title', description: 'New description' });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.packId).toBe('shared-pack');
    expect(result.pack.title).toBe('New title');
    expect(result.pack.description).toBe('New description');
  });

  it('adds folders that exist only in the incoming pack', () => {
    const existing = pack();
    const incoming = pack({
      folders: [
        { id: 'folder-1', title: 'Existing folder' },
        { id: 'folder-2', title: 'Incoming folder' }
      ]
    });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.folders.map((folder) => folder.id)).toContain('folder-2');
    expect(result.report.addedFolders).toBe(1);
  });

  it('updates folder metadata when folder IDs match', () => {
    const existing = pack({ folders: [{ id: 'folder-1', title: 'Old folder title' }] });
    const incoming = pack({ folders: [{ id: 'folder-1', title: 'New folder title' }] });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.folders.find((folder) => folder.id === 'folder-1')?.title).toBe('New folder title');
    expect(result.report.updatedFolders).toBe(1);
  });

  it('adds modules that exist only in the incoming pack', () => {
    const existing = pack();
    const incoming = pack({
      modules: [
        moduleInfo('module-1', 'Existing module', ['q-1']),
        moduleInfo('module-2', 'Incoming module', ['q-2'])
      ],
      questions: [inputQuestion('q-1', 'module-1', 'existing prompt'), inputQuestion('q-2', 'module-2', 'incoming prompt')]
    });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.modules.map((module) => module.id)).toContain('module-2');
    expect(result.report.addedModules).toBe(1);
  });

  it('merges modules with the same module.id', () => {
    const existing = pack({ modules: [moduleInfo('module-1', 'Old module', ['q-1'])] });
    const incoming = pack({
      modules: [moduleInfo('module-1', 'New module', ['q-2'], { subject: '数学', description: 'Incoming wins', tags: ['update'] })],
      questions: [inputQuestion('q-2', 'module-1', 'incoming prompt')]
    });

    const result = mergeLoopDeckPacks(existing, incoming);
    const mergedModule = result.pack.modules.find((module) => module.id === 'module-1');

    expect(mergedModule?.title).toBe('New module');
    expect(mergedModule?.subject).toBe('数学');
    expect(mergedModule?.description).toBe('Incoming wins');
    expect(mergedModule?.tags).toEqual(['update']);
    expect(mergedModule?.questionIds).toEqual(['q-1', 'q-2']);
    expect(result.report.mergedModules).toBe(1);
  });

  it('preserves existing question IDs', () => {
    const existing = pack({ questions: [inputQuestion('q-1', 'module-1', 'old content')] });
    const incoming = pack({ questions: [inputQuestion('q-1', 'module-1', 'changed content')] });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.questions.find((question) => question.id === 'q-1')?.prompt).toBe('old content');
  });

  it('adds incoming questions with new IDs as-is when there is no conflict', () => {
    const existing = pack();
    const incoming = pack({
      modules: [moduleInfo('module-1', 'Existing module', ['q-2'])],
      questions: [inputQuestion('q-2', 'module-1', 'incoming prompt')]
    });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.questions.find((question) => question.id === 'q-2')?.prompt).toBe('incoming prompt');
    expect(result.report.addedQuestions).toBe(1);
  });

  it('skips incoming questions when the same question.id exists and the content is identical', () => {
    const sharedQuestion = inputQuestion('q-1', 'module-1', 'same prompt');
    const existing = pack({ questions: [sharedQuestion] });
    const incoming = pack({ questions: [sharedQuestion] });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.questions.filter((question) => question.id === 'q-1')).toHaveLength(1);
    expect(result.report.skippedIdenticalQuestions).toBe(1);
  });

  it('renames incoming questions when the same question.id exists but content differs', () => {
    const existing = pack({ questions: [inputQuestion('q-1', 'module-1', 'old content')] });
    const incoming = pack({ questions: [inputQuestion('q-1', 'module-1', 'new content')] });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.questions.find((question) => question.id === 'q-1')?.prompt).toBe('old content');
    expect(result.pack.questions.find((question) => question.id === 'q-1__merge_1')?.prompt).toBe('new content');
    expect(result.report.renamedQuestions).toBe(1);
  });

  it('updates merged module questionIds to point to renamed question IDs', () => {
    const existing = pack({
      modules: [moduleInfo('module-1', 'Existing module', ['q-1'])],
      questions: [inputQuestion('q-1', 'module-1', 'old content')]
    });
    const incoming = pack({
      modules: [moduleInfo('module-1', 'Incoming module', ['q-1'])],
      questions: [inputQuestion('q-1', 'module-1', 'new content')]
    });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.modules.find((module) => module.id === 'module-1')?.questionIds).toEqual(['q-1', 'q-1__merge_1']);
  });

  it('ensures generated IDs are unique if multiple conflicts happen', () => {
    const existing = pack({
      modules: [moduleInfo('module-1', 'Existing module', ['q-1', 'q-1__merge_1', 'q-2'])],
      questions: [
        inputQuestion('q-1', 'module-1', 'old q1'),
        inputQuestion('q-1__merge_1', 'module-1', 'already used suffix'),
        inputQuestion('q-2', 'module-1', 'old q2')
      ]
    });
    const incoming = pack({
      modules: [moduleInfo('module-1', 'Incoming module', ['q-1', 'q-2'])],
      questions: [inputQuestion('q-1', 'module-1', 'new q1'), inputQuestion('q-2', 'module-1', 'new q2')]
    });

    const result = mergeLoopDeckPacks(existing, incoming);
    const ids = result.pack.questions.map((question) => question.id);

    expect(ids).toContain('q-1__merge_2');
    expect(ids).toContain('q-2__merge_1');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ensures old questions remain available after merge', () => {
    const existing = pack({ questions: [inputQuestion('q-1', 'module-1', 'old still available')] });
    const incoming = pack({ questions: [inputQuestion('q-1', 'module-1', 'new also available')] });

    const result = mergeLoopDeckPacks(existing, incoming);

    expect(result.pack.questions.find((question) => question.id === 'q-1')?.prompt).toBe('old still available');
    expect(result.pack.questions.find((question) => question.id === 'q-1__merge_1')?.prompt).toBe('new also available');
  });

  it('ensures the merged pack validates with validatePack', () => {
    const existing = pack();
    const incoming = pack({
      folders: [{ id: 'folder-1', title: 'Updated folder' }],
      modules: [moduleInfo('module-1', 'Updated module', ['q-1', 'q-2'])],
      questions: [inputQuestion('q-1', 'module-1', 'updated old id'), inputQuestion('q-2', 'module-1', 'new id')]
    });

    const result = mergeLoopDeckPacks(existing, incoming);
    const validation = validatePack(result.pack);

    expect(validation.ok).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('can merge a different-pack addon into an existing module by module id', () => {
    const existing = pack({
      packId: 'built-in-final',
      title: '一学期期末テスト',
      modules: [moduleInfo('leap_final', 'LEAP 201〜300', ['leap_final-201'])],
      questions: [inputQuestion('leap_final-201', 'leap_final', 'ability', '能力')]
    });
    const incoming = pack({
      packId: 'leap-301-400-addon',
      title: 'LEAP 301〜400',
      modules: [moduleInfo('leap_final', 'LEAP 301〜400', ['leap_final-301'])],
      questions: [inputQuestion('leap_final-301', 'leap_final', 'modern', '現代の')]
    });

    const result = mergeLoopDeckPacksIntoExisting(existing, incoming);

    expect(result.pack.packId).toBe('built-in-final');
    expect(result.report.mergedModules).toBe(1);
    expect(result.report.addedQuestions).toBe(1);
    expect(result.pack.modules.find((module) => module.id === 'leap_final')?.questionIds).toEqual(['leap_final-201', 'leap_final-301']);
    expect(result.pack.questions.map((question) => question.id)).toEqual(['leap_final-201', 'leap_final-301']);
  });
});
