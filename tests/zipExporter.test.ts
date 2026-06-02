import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { createLoopDeckZipBytes, makePackFileStem, stringifyLoopDeckJson } from '../src/packs/zipExporter';

const samplePack: LoopDeckPack = {
  packVersion: 1,
  packId: 'sample-pack',
  title: 'Sample Pack',
  folders: [{ id: 'folder-1', title: 'Folder 1' }],
  modules: [
    {
      id: 'module-1',
      folderId: 'folder-1',
      title: 'Module 1',
      subject: 'sample',
      questionIds: ['question-1']
    }
  ],
  questions: [
    {
      id: 'question-1',
      moduleId: 'module-1',
      type: 'input',
      prompt: 'What is exported?',
      answer: 'A LoopDeck pack'
    }
  ]
};

describe('zipExporter', () => {
  it('creates import-compatible LoopDeck zip files', async () => {
    const bytes = await createLoopDeckZipBytes(samplePack);
    const zip = await JSZip.loadAsync(bytes);

    expect(Object.keys(zip.files).sort()).toEqual(['manifest.json', 'modules.json', 'questions.json']);

    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    const modules = JSON.parse(await zip.file('modules.json')!.async('string'));
    const questions = JSON.parse(await zip.file('questions.json')!.async('string'));

    expect(manifest).toEqual({
      packVersion: 1,
      packId: 'sample-pack',
      title: 'Sample Pack',
      folders: [{ id: 'folder-1', title: 'Folder 1' }]
    });
    expect(modules).toEqual(samplePack.modules);
    expect(questions).toEqual(samplePack.questions);
  });

  it('exports full pack JSON with a trailing newline', () => {
    expect(stringifyLoopDeckJson(samplePack)).toBe(`${JSON.stringify(samplePack, null, 2)}\n`);
  });

  it('creates safe download file stems', () => {
    expect(makePackFileStem({ ...samplePack, packId: 'bad/name:*' })).toBe('bad-name');
    expect(makePackFileStem({ ...samplePack, packId: '' })).toBe('Sample-Pack');
  });
});
