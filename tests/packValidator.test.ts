import { describe, expect, it } from 'vitest';
import { validatePack, validatePackFiles } from '../src/packs/packValidator';

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

  it('accepts documented minimal module fields and normalizes runtime metadata', () => {
    const result = validatePack({
      packVersion: 1,
      packId: 'demo',
      title: 'Demo',
      folders: [],
      modules: [{ id: 'm', questionIds: ['q'] }],
      questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' }]
    });

    expect(result.ok).toBe(true);
    expect(result.pack?.modules[0]).toMatchObject({
      id: 'm',
      folderId: '',
      title: 'm',
      subject: 'その他',
      questionIds: ['q']
    });
  });

  it('normalizes invalid optional module metadata before persistence', () => {
    const result = validatePack({
      packVersion: 1,
      packId: 'demo-optional-types',
      title: 'Demo',
      folders: [],
      modules: [{
        id: 'm',
        folderId: 123,
        title: null,
        subject: { unsafe: true },
        description: ['bad'],
        tags: ['safe', 42, 'also-safe'],
        questionIds: ['q']
      }],
      questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' }]
    });

    expect(result.ok).toBe(true);
    expect(result.pack?.modules[0]).toMatchObject({
      folderId: '',
      title: 'm',
      subject: 'その他',
      tags: ['safe', 'also-safe']
    });
    expect(result.pack?.modules[0].description).toBeUndefined();
    expect(result.issues.some((issue) => issue.level === 'warning' && issue.message.includes('subject'))).toBe(true);
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
