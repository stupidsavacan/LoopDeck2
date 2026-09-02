import { describe, expect, it } from 'vitest';
import type { Attempt, Question } from '../src/core/models';
import type { LearningRepository } from '../src/data/learningRepository';
import type { PackGateway } from '../src/data/packGateway';
import type { FlowSessionRecord, PlanEntry } from '../src/flow/models';
import { PlayerController } from '../src/flow/playerController';

const questions: Question[] = Array.from({ length: 6 }, (_, index) => ({ id: `q${index + 1}`, moduleId: 'm', type: 'input', prompt: `Q${index + 1}`, answer: `A${index + 1}` }));
const entries: PlanEntry[] = questions.map((question, index) => ({ questionId: question.id, moduleId: 'm', primaryReason: 'new', reasons: [{ kind: 'new', neverAttempted: true, sourceRank: index }], questionMode: 'as_stored', answerFormat: 'input', originalPlanIndex: index }));

function session(): FlowSessionRecord {
  return { sessionId: 's', origin: 'flow', status: 'active', phase: 'question', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), budgetMinutes: 5, scope: { kind: 'all' }, entries, index: 0, checkpointEvery: 5, settings: { autoNext: true, autoRevealAfterIdle: false, showExample: true, showNumber: true, showCategory: true }, selectedChoices: [], activeSessionMs: 0, completedAttemptIds: [] };
}

describe('PlayerController', () => {
  it('persists each answer, restores feedback, and checkpoints after five entries', async () => {
    const attempts: Attempt[] = [];
    let savedSession = session();
    const packs = { questions, getQuestion: (id: string) => questions.find((question) => question.id === id), resolveQuestionImage: async () => undefined } as unknown as PackGateway;
    const learning = {
      saveAttemptAndReview: async (attempt: Attempt) => { attempts.push(attempt); },
      putSession: async (value: FlowSessionRecord) => { savedSession = value; },
      readAll: async () => ({ attempts, bookmarks: [], reviewCards: [], reviewLogs: [] })
    } as unknown as LearningRepository;
    const controller = new PlayerController(savedSession, packs, learning);
    await controller.activate();
    const feedback = await controller.submit('A1');
    expect(feedback.tag).toBe('feedback');
    expect(attempts[0].result).toBe('correct');

    const restored = new PlayerController(savedSession, packs, learning);
    await restored.activate();
    expect(restored.state().tag).toBe('feedback');

    await restored.next();
    for (let index = 1; index < 5; index += 1) {
      await restored.submit('', true);
      await restored.next();
    }
    expect(restored.state().tag).toBe('checkpoint');
    expect(restored.record.index).toBe(5);
  });
});
