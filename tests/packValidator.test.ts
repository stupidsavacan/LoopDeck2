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

  it('normalizes documented optional module metadata instead of persisting undefined runtime fields', () => {
    const result = validatePack({
      packVersion: 1,
      packId: 'minimal-module',
      title: 'Minimal',
      folders: [],
      modules: [{ id: 'm', questionIds: ['q'] }],
      questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' }]
    });
    expect(result.ok).toBe(true);
    expect(result.pack?.modules[0]).toMatchObject({ id: 'm', folderId: '', title: 'm', subject: '' });
  });

  it('rejects broken cross references and malformed optional presentation metadata', () => {
    const result = validatePack({
      packVersion: 1,
      packId: 'bad-refs',
      title: 'Bad refs',
      folders: [{ id: 'f', title: 'Folder' }],
      modules: [{ id: 'm', folderId: 'missing', title: 'Module', subject: 'demo', color: 'url(javascript:evil)', questionIds: ['q'] }],
      questions: [{
        id: 'q',
        moduleId: 'm',
        type: 'input',
        prompt: 'A?',
        answer: 'A',
        sampleMarks: [{ label: 'unsafe', color: 'red', pattern: 'unknown' }]
      }]
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((entry) => entry.message.includes('unknown folderId'))).toBe(true);
    expect(result.issues.some((entry) => entry.message.includes('six-digit hex color'))).toBe(true);
    expect(result.issues.some((entry) => entry.message.includes('pattern is unsupported'))).toBe(true);
  });

  it('rejects inconsistent module/question ownership and invalid answer collections', () => {
    const result = validatePack({
      packVersion: 1,
      packId: 'bad-ownership',
      title: 'Bad ownership',
      folders: [],
      modules: [
        { id: 'm1', questionIds: ['q'] },
        { id: 'm2', questionIds: [] }
      ],
      questions: [{ id: 'q', moduleId: 'm2', type: 'choice', prompt: 'A?', choices: ['A', 'A'], answer: 'B' }]
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((entry) => entry.message.includes('belongs to module'))).toBe(true);
    expect(result.issues.some((entry) => entry.message.includes('duplicate value'))).toBe(true);
    expect(result.issues.some((entry) => entry.message.includes('answer must appear in choices'))).toBe(true);
  });

});
