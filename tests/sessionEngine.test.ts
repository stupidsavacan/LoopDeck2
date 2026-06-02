import { describe, expect, it } from 'vitest';
import { createSession, currentQuestion, advanceSession, isSessionComplete } from '../src/core/sessionEngine';
import type { ModuleInfo, Question } from '../src/core/models';

const module: ModuleInfo = { id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: ['q1', 'q2'] };
const questions: Question[] = [
  { id: 'q1', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' },
  { id: 'q2', moduleId: 'm', type: 'choice', prompt: 'B?', choices: ['B', 'C'], answer: 'B' }
];

describe('session engine', () => {
  it('creates and advances a session', () => {
    const session = createSession(module, questions, { shuffle: false, autoNext: true, questionLimit: 'all' });
    expect(currentQuestion(session)?.id).toBe('q1');
    const next = advanceSession(session);
    expect(currentQuestion(next)?.id).toBe('q2');
    expect(isSessionComplete(advanceSession(next))).toBe(true);
  });
});
