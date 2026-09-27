// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attempt, ModuleInfo, Question, StudySettings } from '../src/core/models';
import { readStoredSession, restoreStoredSession } from '../src/screens/moduleScreen';

const moduleInfo: ModuleInfo = {
  id: 'resume-v2-module',
  folderId: 'test',
  title: 'Resume v2',
  subject: 'test',
  questionIds: ['reversible']
};

const reversible: Question = {
  id: 'reversible',
  moduleId: moduleInfo.id,
  type: 'input',
  prompt: 'front',
  answer: 'back',
  supportedStudyModes: ['front_to_back', 'back_to_front'],
  sides: {
    front: { label: 'Front', text: 'front' },
    back: { label: 'Back', text: 'back' }
  }
};

const settings: StudySettings = {
  shuffle: false,
  autoNext: false,
  questionLimit: 'all',
  answerFormat: 'input',
  questionMode: 'mixed'
};

const attempt: Attempt = {
  attemptId: 'attempt-1',
  questionId: reversible.id,
  moduleId: moduleInfo.id,
  answeredAt: '2026-09-27T00:00:03.000Z',
  result: 'correct',
  input: 'front',
  answer: 'front',
  elapsedMs: 3000,
  mode: 'normal',
  hiddenTimeExcludedMs: 12000,
  answerMode: 'input',
  questionMode: 'back_to_front'
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-27T00:10:00.000Z'));
});

afterEach(() => vi.useRealTimers());

describe('stored session v2 resume state', () => {
  it('restores the exact presented direction, attempts, start time, and current timing state', () => {
    localStorage.setItem(`loopdeck_session_${moduleInfo.id}`, JSON.stringify({
      version: 2,
      questions: [{ questionId: reversible.id, questionMode: 'back_to_front' }],
      index: 0,
      mode: 'normal',
      settings,
      startedAt: Date.parse('2026-09-27T00:00:00.000Z'),
      currentElapsedMs: 4200,
      currentHiddenTimeExcludedMs: 12000,
      attempts: [attempt],
      savedAt: '2026-09-27T00:05:00.000Z'
    }));

    const byId = new Map([[reversible.id, reversible]]);
    const stored = readStoredSession(moduleInfo.id, byId);
    expect(stored).toBeDefined();
    const restored = restoreStoredSession(moduleInfo, stored!, byId, [reversible]);

    expect(restored?.queue[0].activeStudyMode).toBe('back_to_front');
    expect(restored?.queue[0].prompt).toBe('back');
    expect(restored?.attempts).toEqual([attempt]);
    expect(restored?.startedAt).toBe(Date.parse('2026-09-27T00:00:00.000Z'));
    expect(restored?.currentElapsedMs).toBe(4200);
    expect(restored?.currentHiddenTimeExcludedMs).toBe(12000);
    expect(restored?.currentStartedAt).toBe(Date.now());
  });

  it('accepts a completed v2 session so its summary can be resumed', () => {
    localStorage.setItem(`loopdeck_session_${moduleInfo.id}`, JSON.stringify({
      version: 2,
      questions: [{ questionId: reversible.id, questionMode: 'front_to_back' }],
      index: 1,
      mode: 'normal',
      settings,
      startedAt: Date.parse('2026-09-27T00:00:00.000Z'),
      currentElapsedMs: 0,
      currentHiddenTimeExcludedMs: 0,
      attempts: [attempt],
      savedAt: '2026-09-27T00:05:00.000Z'
    }));

    expect(readStoredSession(moduleInfo.id, new Map([[reversible.id, reversible]]))?.index).toBe(1);
  });

  it('does not resume legacy mixed sessions because their already-presented direction was never stored', () => {
    localStorage.setItem(`loopdeck_session_${moduleInfo.id}`, JSON.stringify({
      questionIds: [reversible.id],
      index: 0,
      mode: 'normal',
      settings,
      savedAt: '2026-09-27T00:05:00.000Z'
    }));

    expect(readStoredSession(moduleInfo.id, new Map([[reversible.id, reversible]]))).toBeUndefined();
  });
});
