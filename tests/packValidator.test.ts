import { describe, expect, it } from 'vitest';
import { validatePack, validatePackFiles } from '../src/packs/packValidator';

describe('pack validator', () => {
  it('rejects executable files and unsafe paths', () => {
    const issues = validatePackFiles(['manifest.json', '../evil.js', 'questions.json', 'images/a.png', 'run.sh']);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === '../evil.js')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === 'run.sh')).toBe(true);
  });

  it('accepts a minimal valid pack', () => {
    const result = validatePack({
      packVersion: 1,
      packId: 'demo',
      title: 'Demo',
      folders: [{ id: 'f', title: 'Folder' }],
      modules: [{ id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: ['q'] }],
      questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' }]
    });
    expect(result.ok).toBe(true);
  });

  it('rejects duplicate question ids', () => {
    const result = validatePack({
      packVersion: 1,
      packId: 'demo',
      title: 'Demo',
      folders: [],
      modules: [{ id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: ['q'] }],
      questions: [
        { id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' },
        { id: 'q', moduleId: 'm', type: 'input', prompt: 'B?', answer: 'B' }
      ]
    });
    expect(result.ok).toBe(false);
  });
});
