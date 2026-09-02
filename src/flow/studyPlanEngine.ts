import type { Attempt, Question, ReviewCard } from '../core/models';
import { buildReviewQueue } from '../core/reviewEngine';
import { buildSrsReviewQueue } from '../core/scheduler';
import type {
  Candidate,
  FlowReason,
  FlowScope,
  FlowSegment,
  PlanEntry,
  StudyPlan
} from './models';

const ESTIMATED_SECONDS_PER_QUESTION = 24;
const TARGETS: Record<5 | 10 | 20, number> = { 5: 12, 10: 25, 20: 50 };

export interface BuildStudyPlanInput {
  questions: Question[];
  attempts: Attempt[];
  reviewCards: ReviewCard[];
  bookmarks?: Iterable<string>;
  scope?: FlowScope;
  budgetMinutes?: 5 | 10 | 20;
  focusId?: string;
  now?: Date;
  idFactory?: () => string;
}

function fallbackId(prefix: string): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${id}`;
}

function applyScope(questions: Question[], scope: FlowScope, bookmarks: Set<string>): Question[] {
  switch (scope.kind) {
    case 'all': return questions;
    case 'modules': {
      const ids = new Set(scope.moduleIds);
      return questions.filter((question) => ids.has(question.moduleId));
    }
    case 'category': return questions.filter((question) => question.moduleId === scope.moduleId && question.category === scope.category);
    case 'attention': return questions.filter((question) => !scope.moduleId || question.moduleId === scope.moduleId);
    case 'bookmarks': return questions.filter((question) => bookmarks.has(question.id) && (!scope.moduleId || question.moduleId === scope.moduleId));
  }
}

function reasonCounts(entries: PlanEntry[]): Record<FlowReason, number> {
  const counts: Record<FlowReason, number> = { due: 0, weak: 0, new: 0, continuation: 0 };
  for (const entry of entries) counts[entry.primaryReason] += 1;
  return counts;
}

function interleaveModules(candidates: Candidate[]): Candidate[] {
  const remaining = [...candidates];
  const output: Candidate[] = [];
  while (remaining.length) {
    const last = output.at(-1)?.moduleId;
    const previous = output.at(-2)?.moduleId;
    const wouldBeThree = last && previous && last === previous;
    const index = wouldBeThree ? remaining.findIndex((item) => item.moduleId !== last) : 0;
    output.push(remaining.splice(index >= 0 ? index : 0, 1)[0]);
  }
  return output;
}

function quota(target: number): Record<'due' | 'weak' | 'new', number> {
  const due = Math.floor(target * 0.45);
  const weak = Math.floor(target * 0.35);
  return { due, weak, new: target - due - weak };
}

export function buildStudyPlan(input: BuildStudyPlanInput): StudyPlan {
  const now = input.now ?? new Date();
  const scope = input.scope ?? { kind: 'all' };
  const budgetMinutes = input.budgetMinutes ?? 5;
  const targetCount = Math.min(50, TARGETS[budgetMinutes]);
  const bookmarks = new Set(input.bookmarks ?? []);
  const questions = applyScope(input.questions, scope, bookmarks);
  const questionIds = new Set(questions.map((question) => question.id));
  const attempts = input.attempts.filter((attempt) => questionIds.has(attempt.questionId));
  const attemptedIds = new Set(attempts.map((attempt) => attempt.questionId));
  const candidates = new Map<string, Candidate>();

  const ensure = (questionId: string, moduleId: string, sourceOrder: number): Candidate => {
    const current = candidates.get(questionId);
    if (current) return current;
    const next: Candidate = {
      questionId,
      moduleId,
      primaryReason: 'new',
      reasons: [],
      recentlyAnswered: false,
      sourceOrder,
      estimatedSeconds: ESTIMATED_SECONDS_PER_QUESTION
    };
    candidates.set(questionId, next);
    return next;
  };

  const dueSource = buildSrsReviewQueue(input.reviewCards, now, Number.MAX_SAFE_INTEGER)
    .filter((card) => questionIds.has(card.questionId));
  dueSource.forEach((card, index) => {
    const item = ensure(card.questionId, card.moduleId, index);
    item.dueRank = index;
    item.primaryReason = 'due';
    item.reasons.push({ kind: 'due', reviewState: card.state, dueAt: card.dueAt, sourceRank: index });
  });

  const weakSource = buildReviewQueue(attempts, questions);
  weakSource.forEach((review, index) => {
    const item = ensure(review.question.id, review.question.moduleId, dueSource.length + index);
    item.weakRank = index;
    item.lastAttemptAt = review.lastAttemptAt;
    if (item.primaryReason !== 'due') item.primaryReason = 'weak';
    item.reasons.push({ kind: 'weak', score: review.score, label: review.label, lastAttemptAt: review.lastAttemptAt, sourceRank: index });
  });

  questions.filter((question) => !attemptedIds.has(question.id)).forEach((question, index) => {
    const item = ensure(question.id, question.moduleId, dueSource.length + weakSource.length + index);
    item.newRank = index;
    if (item.primaryReason !== 'due' && item.primaryReason !== 'weak') item.primaryReason = 'new';
    item.reasons.push({ kind: 'new', neverAttempted: true, sourceRank: index });
  });

  const recentCutoff = now.getTime() - 30 * 60 * 1000;
  const recentIds: string[] = [];
  [...attempts]
    .sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt))
    .forEach((attempt) => {
      if (recentIds.length >= 8 || Date.parse(attempt.answeredAt) < recentCutoff || recentIds.includes(attempt.questionId)) return;
      recentIds.push(attempt.questionId);
    });
  const recentSet = new Set(recentIds);
  for (const item of candidates.values()) item.recentlyAnswered = recentSet.has(item.questionId);

  const ordered = [...candidates.values()]
    .filter((item) => scope.kind !== 'attention' || item.primaryReason === 'due' || item.primaryReason === 'weak')
    .sort((a, b) => a.sourceOrder - b.sourceOrder);
  const available = ordered.filter((item) => item.primaryReason === 'due' || !item.recentlyAnswered);
  const suppressed = ordered.filter((item) => item.primaryReason !== 'due' && item.recentlyAnswered);
  const byReason = (reason: 'due' | 'weak' | 'new'): Candidate[] => available.filter((item) => item.primaryReason === reason);
  const quotas = quota(targetCount);
  const selected: Candidate[] = [];
  const selectedIds = new Set<string>();
  const take = (pool: Candidate[], count: number): void => {
    for (const item of pool) {
      if (selected.length >= targetCount || count <= 0) break;
      if (selectedIds.has(item.questionId)) continue;
      selected.push(item);
      selectedIds.add(item.questionId);
      count -= 1;
    }
  };
  take(byReason('due'), quotas.due);
  take(byReason('weak'), quotas.weak);
  take(byReason('new'), quotas.new);
  for (const reason of ['due', 'weak', 'new'] as const) take(byReason(reason), targetCount - selected.length);
  take(suppressed.sort((a, b) => (a.lastAttemptAt ?? 0) - (b.lastAttemptAt ?? 0)), targetCount - selected.length);

  const idFactory = input.idFactory ?? (() => fallbackId('flow'));
  const queue: PlanEntry[] = interleaveModules(selected).map((candidate, index) => ({
    questionId: candidate.questionId,
    moduleId: candidate.moduleId,
    primaryReason: candidate.primaryReason,
    reasons: candidate.reasons,
    questionMode: 'as_stored',
    answerFormat: 'auto',
    originalPlanIndex: index
  }));
  const segments: FlowSegment[] = [];
  for (let index = 0; index < queue.length; index += 5) {
    const entries = queue.slice(index, index + 5);
    const moduleCounts: Record<string, number> = {};
    for (const entry of entries) moduleCounts[entry.moduleId] = (moduleCounts[entry.moduleId] ?? 0) + 1;
    segments.push({
      segmentId: idFactory(),
      index: segments.length,
      candidates: entries,
      estimatedSeconds: entries.length * ESTIMATED_SECONDS_PER_QUESTION,
      reasonCounts: reasonCounts(entries),
      moduleCounts
    });
  }

  return {
    planId: idFactory(),
    createdAt: now.toISOString(),
    budgetMinutes,
    targetCount,
    scope,
    focusId: input.focusId,
    segments,
    queue,
    primaryReasonCounts: reasonCounts(queue),
    estimatedSeconds: queue.length * ESTIMATED_SECONDS_PER_QUESTION,
    excludedRecentQuestionIds: suppressed.map((item) => item.questionId),
    sourceSnapshotTimestamp: now.toISOString()
  };
}

export function createFlowSession(plan: StudyPlan, settings: import('./models').FlowSessionSettings): import('./models').FlowSessionRecord {
  const now = new Date().toISOString();
  return {
    sessionId: fallbackId('session'),
    planId: plan.planId,
    origin: 'flow',
    status: 'active',
    phase: 'question',
    createdAt: now,
    updatedAt: now,
    budgetMinutes: plan.budgetMinutes,
    scope: plan.scope,
    focusId: plan.focusId,
    entries: plan.queue,
    index: 0,
    checkpointEvery: 5,
    settings,
    selectedChoices: [],
    activeSessionMs: 0,
    completedAttemptIds: []
  };
}
