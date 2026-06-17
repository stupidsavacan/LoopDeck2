import { describe, expect, it } from 'vitest';
import { validatePack, validatePackFiles } from '../src/packs/packValidator';

function packWithQuestion(question: Record<string, unknown>) {
  return {
    packVersion: 1,
    packId: 'demo',
    title: 'Demo',
    folders: [{ id: 'f', title: 'Folder' }],
    modules: [{ id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: [question.id ?? 'q'] }],
    questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A', ...question }]
  };
}

function errorMessages(result: ReturnType<typeof validatePack>): string[] {
  return result.issues.filter((issue) => issue.level === 'error').map((issue) => issue.message);
}

function warningMessages(result: ReturnType<typeof validatePack>): string[] {
  return result.issues.filter((issue) => issue.level === 'warning').map((issue) => issue.message);
}

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

  it('accepts valid two-sided study metadata', () => {
    const result = validatePack(packWithQuestion({
      sides: {
        front: { label: '英語', text: 'modern', acceptableAnswers: ['modern'] },
        back: { label: '日本語', text: '現代の', acceptableAnswers: ['現代の'] }
      },
      supportedStudyModes: ['front_to_back', 'back_to_front']
    }));

    expect(result.ok).toBe(true);
    expect(errorMessages(result)).toEqual([]);
  });

  it('rejects empty side text', () => {
    const result = validatePack(packWithQuestion({
      sides: {
        front: { label: '英語', text: '' },
        back: { label: '日本語', text: '現代の', acceptableAnswers: ['現代の'] }
      },
      supportedStudyModes: ['front_to_back']
    }));

    expect(result.ok).toBe(false);
    expect(errorMessages(result).some((message) => message.includes('sides.front.text'))).toBe(true);
  });

  it('rejects unsupported study modes', () => {
    const result = validatePack(packWithQuestion({
      sides: {
        front: { label: '英語', text: 'modern', acceptableAnswers: ['modern'] },
        back: { label: '日本語', text: '現代の', acceptableAnswers: ['現代の'] }
      },
      supportedStudyModes: ['front_to_back', 'reverse_forever']
    }));

    expect(result.ok).toBe(false);
    expect(errorMessages(result).some((message) => message.includes('unsupported study mode'))).toBe(true);
  });

  it('accepts valid sampleMarks', () => {
    const result = validatePack(packWithQuestion({
      prompt: '地図でサンプル表示と同じ模様の地域名を答えよ。',
      imageAsset: 'images/map.png',
      sampleMarks: [
        { label: '縦線の地域', color: '#FFFFFF', pattern: 'vertical_stripes', patternColor: '#111827', description: '縦線で示された地域' }
      ]
    }));

    expect(result.ok).toBe(true);
    expect(errorMessages(result)).toEqual([]);
  });

  it('rejects invalid sampleMark color values', () => {
    const result = validatePack(packWithQuestion({ sampleMarks: [{ label: '色', color: 'orange' }] }));

    expect(result.ok).toBe(false);
    expect(errorMessages(result).some((message) => message.includes('sampleMarks[0].color'))).toBe(true);
  });

  it('rejects invalid sampleMark patternColor values', () => {
    const result = validatePack(packWithQuestion({ sampleMarks: [{ label: '色', color: '#FFFFFF', patternColor: '#xyzxyz' }] }));

    expect(result.ok).toBe(false);
    expect(errorMessages(result).some((message) => message.includes('patternColor'))).toBe(true);
  });

  it('rejects unsupported sampleMark patterns', () => {
    const result = validatePack(packWithQuestion({ sampleMarks: [{ label: '色', color: '#FFFFFF', pattern: 'wave' }] }));

    expect(result.ok).toBe(false);
    expect(errorMessages(result).some((message) => message.includes('pattern'))).toBe(true);
  });

  it('rejects empty sampleMark labels', () => {
    const result = validatePack(packWithQuestion({ sampleMarks: [{ label: ' ', color: '#FFFFFF' }] }));

    expect(result.ok).toBe(false);
    expect(errorMessages(result).some((message) => message.includes('label'))).toBe(true);
  });

  it('rejects non-array sampleMarks', () => {
    const result = validatePack(packWithQuestion({ sampleMarks: { label: '色', color: '#FFFFFF' } }));

    expect(result.ok).toBe(false);
    expect(errorMessages(result).some((message) => message.includes('sampleMarks must be an array'))).toBe(true);
  });

  it('warns when sampleMarks exist without an image asset', () => {
    const result = validatePack(packWithQuestion({ sampleMarks: [{ label: '色', color: '#FFFFFF' }] }));

    expect(result.ok).toBe(true);
    expect(warningMessages(result).some((message) => message.includes('sampleMarks but no imageAsset'))).toBe(true);
  });

  it('keeps legacy sampleColors readable with a warning', () => {
    const result = validatePack(packWithQuestion({ sampleColors: [{ label: '色', color: '#F97316', description: '旧形式' }] }));

    expect(result.ok).toBe(true);
    expect(errorMessages(result)).toEqual([]);
    expect(warningMessages(result).some((message) => message.includes('sampleColors'))).toBe(true);
  });
});
