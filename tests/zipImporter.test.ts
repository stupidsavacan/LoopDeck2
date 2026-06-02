import { describe, expect, it } from 'vitest';
import { importLoopDeckJson } from '../src/packs/zipImporter';

const validPack = {
  packVersion: 1,
  packId: 'valid-pack',
  title: 'Valid Pack',
  folders: [{ id: 'f', title: 'Folder' }],
  modules: [{ id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: ['q'] }],
  questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' }]
};

describe('zip/json importer safety', () => {
  it('rejects dangerous single-file import names', async () => {
    const result = await importLoopDeckJson(new File([JSON.stringify(validPack)], 'evil.html'));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'evil.html')).toBe(true);
  });

  it('accepts valid JSON data', async () => {
    const result = await importLoopDeckJson(new File([JSON.stringify(validPack)], 'valid.loopdeck.json'));
    expect(result.ok).toBe(true);
    expect(result.pack?.packId).toBe('valid-pack');
  });
});
