import { describe, expect, it } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { analyzeImportConflicts } from '../src/packs/importConflictAnalysis';

function pack(packId: string, moduleId: string, questionId: string): LoopDeckPack {
  return {
    packVersion: 1, packId, title: packId,
    folders: [{ id: 'f', title: 'Folder' }],
    modules: [{ id: moduleId, folderId: 'f', title: moduleId, subject: 'test', questionIds: [questionId] }],
    questions: [{ id: questionId, moduleId, type: 'input', prompt: questionId, answer: 'a' }]
  };
}

describe('import conflict analysis', () => {
  it('detects pack, module and question conflicts without file IO or DOM', () => {
    const existing = pack('existing', 'shared-module', 'shared-question');
    const incoming = pack('incoming', 'shared-module', 'shared-question');
    const result = analyzeImportConflicts(incoming, [], [existing], existing.modules, existing.questions);

    expect(result.duplicateImportedPackId).toBe(false);
    expect(result.moduleMergeTarget?.packId).toBe('existing');
    expect(result.duplicateModuleIds).toEqual(['shared-module']);
    expect(result.duplicateQuestionIds).toEqual(['shared-question']);
  });
});
