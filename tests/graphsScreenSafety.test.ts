// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Attempt, LoopDeckPack } from '../src/core/models';
import { resolveActivePacks } from '../src/packs/packResolver';
import { renderGraphsScreen } from '../src/screens/graphsScreen';
import { db } from '../src/storage/db';

describe('graphs screen rendering safety', () => {
  it('renders imported module titles as text instead of HTML', async () => {
    await db.clearAttempts();
    const maliciousTitle = '<img src=x onerror="window.__loopdeckXss=1">Injected';
    const pack: LoopDeckPack = {
      packVersion: 1,
      packId: 'graphs-safety-pack',
      title: 'Graphs safety',
      folders: [{ id: 'f', title: 'Folder' }],
      modules: [{
        id: 'graphs-safety-module',
        folderId: 'f',
        title: maliciousTitle,
        subject: 'test',
        questionIds: ['graphs-safety-question']
      }],
      questions: [{
        id: 'graphs-safety-question',
        moduleId: 'graphs-safety-module',
        type: 'input',
        prompt: 'Q',
        answer: 'A'
      }]
    };
    const attempt: Attempt = {
      attemptId: 'graphs-safety-attempt',
      questionId: 'graphs-safety-question',
      moduleId: 'graphs-safety-module',
      answeredAt: new Date().toISOString(),
      result: 'correct',
      input: 'A',
      answer: 'A',
      elapsedMs: 1000,
      mode: 'normal'
    };
    await db.addAttempt(attempt);

    const root = document.createElement('div');
    await renderGraphsScreen(root, resolveActivePacks([pack]), () => {}, () => {});

    expect(root.querySelector('.module-stat-row strong')?.textContent).toBe(maliciousTitle);
    expect(root.querySelector('.module-stat-row img')).toBeNull();
  });
});
