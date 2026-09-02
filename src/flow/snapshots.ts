import type { Attempt, Question, ReviewCard } from '../core/models';
import { buildReviewQueue } from '../core/reviewEngine';
import { buildSrsReviewQueue } from '../core/scheduler';
import type { ResolvedPackView } from '../packs/packResolver';
import type { LearningData } from '../data/learningRepository';
import { learningRepository } from '../data/learningRepository';
import { settingsRepository } from '../data/settingsRepository';
import type { FocusConfig, ModuleSnapshot, TodaySnapshot } from './models';
import { readLatestLegacySession } from './legacySessionAdapter';
import { buildStudyPlan } from './studyPlanEngine';

function attemptsForModule(attempts: Attempt[], moduleId: string): Attempt[] {
  return attempts.filter((attempt) => attempt.moduleId === moduleId);
}

export function buildModuleSnapshots(view: ResolvedPackView, data: LearningData, now = new Date()): ModuleSnapshot[] {
  const dueIds = new Set(buildSrsReviewQueue(data.reviewCards, now, Number.MAX_SAFE_INTEGER).map((card) => card.questionId));
  const weakIds = new Set(buildReviewQueue(data.attempts, view.questions).map((item) => item.question.id));
  const bookmarkIds = new Set(data.bookmarks);
  return view.modules.map((module) => {
    const questions = module.questionIds.map((id) => view.questionById.get(id)).filter((question): question is Question => Boolean(question));
    const attempts = attemptsForModule(data.attempts, module.id);
    const answeredIds = new Set(attempts.map((attempt) => attempt.questionId));
    const recent = [...attempts].sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt)).slice(0, 20);
    const accuracy = attempts.length ? attempts.filter((attempt) => attempt.result === 'correct').length / attempts.length : 0;
    const recentAccuracy = recent.length ? recent.filter((attempt) => attempt.result === 'correct').length / recent.length : 0;
    const dueCount = questions.filter((question) => dueIds.has(question.id)).length;
    const weakCount = questions.filter((question) => weakIds.has(question.id)).length;
    return {
      module,
      totalQuestions: questions.length,
      answeredQuestionCount: answeredIds.size,
      unseenCount: questions.length - answeredIds.size,
      attemptCount: attempts.length,
      accuracy,
      recentAccuracy,
      dueCount,
      weakCount,
      attentionCount: new Set(questions.filter((question) => dueIds.has(question.id) || weakIds.has(question.id)).map((question) => question.id)).size,
      bookmarkCount: questions.filter((question) => bookmarkIds.has(question.id)).length,
      lastStudiedAt: [...attempts].sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt))[0]?.answeredAt,
      categories: [...new Set(questions.map((question) => question.category).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'ja'))
    };
  });
}

function activeScope(focus: FocusConfig | undefined): import('./models').FlowScope {
  return focus?.enabled && focus.moduleIds.length ? { kind: 'modules', moduleIds: focus.moduleIds } : { kind: 'all' };
}

export async function buildTodaySnapshot(view: ResolvedPackView, now = new Date()): Promise<TodaySnapshot> {
  const [data, preferences, focus, resumeSession] = await Promise.all([
    learningRepository.readAll(),
    settingsRepository.getPreferences(),
    settingsRepository.getFocus(),
    learningRepository.latestPausedSession()
  ]);
  const activeFocus = focus?.enabled ? focus : undefined;
  const scope = activeScope(activeFocus);
  const budget = activeFocus?.dailyMinutes ?? preferences.defaultBudgetMinutes;
  const previewPlan = buildStudyPlan({
    questions: view.questions,
    attempts: data.attempts,
    reviewCards: data.reviewCards,
    bookmarks: data.bookmarks,
    scope,
    budgetMinutes: budget,
    focusId: activeFocus?.focusId,
    now
  });
  const snapshots = buildModuleSnapshots(view, data, now);
  const attemptedIds = new Set(data.attempts.map((attempt) => attempt.questionId));
  const scopedIds = new Set(previewPlan.queue.map((entry) => entry.questionId));
  const scopedQuestions = scope.kind === 'modules'
    ? view.questions.filter((question) => new Set(scope.moduleIds).has(question.moduleId))
    : view.questions;
  return {
    localDateKey: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    activeFocus,
    resumeSession,
    legacyResumeSession: resumeSession ? undefined : readLatestLegacySession(view),
    defaultBudgetMinutes: budget,
    dueCount: previewPlan.primaryReasonCounts.due,
    weakCount: previewPlan.primaryReasonCounts.weak,
    newCount: previewPlan.primaryReasonCounts.new || scopedQuestions.filter((question) => !attemptedIds.has(question.id) && scopedIds.has(question.id)).length,
    previewPlan,
    attentionModules: [...snapshots].filter((snapshot) => snapshot.attentionCount > 0).sort((a, b) => b.attentionCount - a.attentionCount).slice(0, 4),
    recentModules: [...snapshots].filter((snapshot) => snapshot.lastStudiedAt).sort((a, b) => Date.parse(b.lastStudiedAt ?? '') - Date.parse(a.lastStudiedAt ?? '')).slice(0, 4),
    hasAnyQuestions: view.questions.length > 0
  };
}

export function countDue(cards: ReviewCard[], now = new Date()): number {
  return buildSrsReviewQueue(cards, now, Number.MAX_SAFE_INTEGER).length;
}
