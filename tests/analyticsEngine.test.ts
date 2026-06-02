import { describe, expect, it } from 'vitest';
import { buildDailyStudyStats, buildMistakeBreakdown, buildMistakeTrend, buildModuleStudyStats } from '../src/core/analyticsEngine';
import type { Attempt, ModuleInfo, Question } from '../src/core/models';

const modules: ModuleInfo[] = [
  { id: 'm1', folderId: 'science', title: '化学', subject: '理科', questionIds: ['q1', 'q2'] },
  { id: 'm2', folderId: 'social', title: '歴史総合', subject: '地歴', questionIds: ['q3', 'q4'] }
];

const questions: Question[] = [
  { id: 'q1', moduleId: 'm1', type: 'multi_select', prompt: 'A and B?', choices: ['A', 'B', 'C'], correctChoices: ['A', 'B'] },
  { id: 'q2', moduleId: 'm1', type: 'input', prompt: 'Element?', answer: 'H' },
  { id: 'q3', moduleId: 'm2', type: 'choice', prompt: 'Era?', choices: ['A', 'B'], answer: 'A' },
  { id: 'q4', moduleId: 'm2', type: 'input', prompt: 'Name?', answer: '徳川家康' }
];

const attempts: Attempt[] = [
  { attemptId: 'a1', questionId: 'q1', moduleId: 'm1', answeredAt: '2026-06-01T00:00:00.000Z', result: 'wrong', input: ['A'], answer: ['A', 'B'], elapsedMs: 1200, mode: 'normal' },
  { attemptId: 'a2', questionId: 'q2', moduleId: 'm1', answeredAt: '2026-06-01T00:01:00.000Z', result: 'correct', input: 'h', answer: 'H', elapsedMs: 8000, mode: 'normal' },
  { attemptId: 'a3', questionId: 'q3', moduleId: 'm2', answeredAt: '2026-06-02T00:02:00.000Z', result: 'revealed', input: '', answer: 'A', elapsedMs: 500, mode: 'review' },
  { attemptId: 'a4', questionId: 'q4', moduleId: 'm2', answeredAt: '2026-06-02T00:03:00.000Z', result: 'correct', input: '徳川家康', answer: '徳川家康', elapsedMs: 12000, mode: 'normal' },
  { attemptId: 'a5', questionId: 'q1', moduleId: 'm1', answeredAt: '2026-06-02T00:04:00.000Z', result: 'wrong', input: ['B', 'C'], answer: ['A', 'B'], elapsedMs: 1500, mode: 'review' }
];

describe('analytics engine', () => {
  it('builds daily study heatmap stats from real attempts', () => {
    const stats = buildDailyStudyStats(attempts, 3, new Date('2026-06-02T12:00:00.000Z'));

    expect(stats.map((item) => item.date)).toEqual(['2026-05-31', '2026-06-01', '2026-06-02']);
    expect(stats[0]).toMatchObject({ attempts: 0, correct: 0, wrong: 0, revealed: 0, accuracy: 0 });
    expect(stats[1]).toMatchObject({ attempts: 2, correct: 1, wrong: 1, revealed: 0, accuracy: 0.5 });
    expect(stats[2]).toMatchObject({ attempts: 3, correct: 1, wrong: 1, revealed: 1 });
    expect(stats[2].accuracy).toBeCloseTo(1 / 3);
  });

  it('summarizes module accuracy and answer speed', () => {
    const stats = buildModuleStudyStats(attempts, modules);

    expect(stats[0].moduleId).toBe('m1');
    expect(stats[0].attempts).toBe(3);
    expect(stats[0].correct).toBe(1);
    expect(stats[0].accuracy).toBeCloseTo(1 / 3);
    expect(stats[0].averageElapsedMs).toBeCloseTo((1200 + 8000 + 1500) / 3);
    expect(stats[1]).toMatchObject({ moduleId: 'm2', attempts: 2, correct: 1, wrong: 0, revealed: 1, accuracy: 0.5 });
  });

  it('uses non-correct attempts as the temporary mistake trend', () => {
    const trend = buildMistakeTrend(attempts, 2, new Date('2026-06-02T12:00:00.000Z'));

    expect(trend).toEqual([
      { date: '2026-06-01', mistakes: 1 },
      { date: '2026-06-02', mistakes: 2 }
    ]);
  });

  it('breaks down mistake categories honestly from available data', () => {
    const breakdown = buildMistakeBreakdown(attempts, questions, 10000);
    const byId = new Map(breakdown.map((item) => [item.id, item.count]));

    expect(byId.get('wrong')).toBe(2);
    expect(byId.get('revealed')).toBe(1);
    expect(byId.get('multi_select')).toBe(2);
    expect(byId.get('slow_correct')).toBe(1);
    expect(byId.get('repeated')).toBe(1);
  });
});
