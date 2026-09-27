import { describe, expect, it } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { validateActivePackIdentities, validatePack, validatePackFiles } from '../src/packs/packValidator';

describe('pack validator', () => {
  it('rejects executable files and unsafe paths', () => {
    const issues = validatePackFiles(['manifest.json', '../evil.js', '..\\evil.json', 'questions.json', 'images/a.png', 'run.sh', 'script.cjs', 'shell.ps1', 'page.html', '/abs/data.json', '', 'bad\0path.json', ' space.json']);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === '../evil.js')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === '..\\evil.json')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === 'run.sh')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === 'script.cjs')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === 'shell.ps1')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === 'page.html')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === '/abs/data.json')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === '')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === 'bad\0path.json')).toBe(true);
    expect(issues.some((issue) => issue.level === 'error' && issue.path === ' space.json')).toBe(true);
  });

  it('accepts safe json and image paths', () => {
    const issues = validatePackFiles(['manifest.json', 'modules.json', 'questions.json', 'images/a.png']);
    expect(issues).toEqual([]);
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

  it('rejects invalid preferred answer formats', () => {
    const result = validatePack({
      packVersion: 1, packId: 'demo-format', title: 'Demo', folders: [{ id: 'f', title: 'F' }],
      modules: [{ id: 'm', folderId: 'f', title: 'M', subject: 'demo', preferredAnswerFormat: 'bad', questionIds: ['q'] }],
      questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' }]
    });
    expect(result.ok).toBe(false);
  });

  it('treats question ids as global across different active packIds but allows same-pack replacement', () => {
    const makePack = (packId: string, prompt: string): LoopDeckPack => ({
      packVersion: 1, packId, title: packId, folders: [{ id: 'f', title: 'F' }],
      modules: [{ id: `${packId}-m`, folderId: 'f', title: 'M', subject: 'demo', questionIds: ['shared'] }],
      questions: [{ id: 'shared', moduleId: `${packId}-m`, type: 'input', prompt, answer: 'A' }]
    });
    expect(validateActivePackIdentities([makePack('a', 'A'), makePack('b', 'B')])).toHaveLength(1);
    expect(validateActivePackIdentities([makePack('a', 'A'), makePack('a', 'new A')])).toEqual([]);
  });
});
