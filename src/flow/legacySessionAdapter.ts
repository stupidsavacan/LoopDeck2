import type { Question, StudySettings } from '../core/models';
import type { ResolvedPackView } from '../packs/packResolver';
import type { FlowSessionRecord, PlanEntry } from './models';

interface LegacyStoredSession {
  questionIds: string[];
  index: number;
  mode: 'normal' | 'review';
  settings: StudySettings;
  savedAt: string;
}

function readLegacy(moduleId: string): LegacyStoredSession | undefined {
  try {
    const raw = localStorage.getItem(`loopdeck_session_${moduleId}`);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as LegacyStoredSession;
    if (!Array.isArray(value.questionIds) || !Number.isInteger(value.index) || value.index >= value.questionIds.length) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function entry(question: Question, index: number): PlanEntry {
  return {
    questionId: question.id,
    moduleId: question.moduleId,
    primaryReason: 'continuation',
    reasons: [{ kind: 'continuation', sessionId: `legacy-${question.moduleId}`, originalIndex: index }],
    questionMode: question.activeStudyMode ?? 'as_stored',
    answerFormat: 'auto',
    originalPlanIndex: index
  };
}

export function readLatestLegacySession(view: ResolvedPackView): FlowSessionRecord | undefined {
  const candidates = view.modules
    .map((module) => ({ module, stored: readLegacy(module.id) }))
    .filter((item): item is { module: typeof item.module; stored: LegacyStoredSession } => Boolean(item.stored))
    .sort((a, b) => Date.parse(b.stored.savedAt) - Date.parse(a.stored.savedAt));
  const selected = candidates[0];
  if (!selected) return undefined;
  const entries = selected.stored.questionIds
    .map((id, index) => {
      const question = view.questionById.get(id);
      return question ? entry(question, index) : undefined;
    })
    .filter((item): item is PlanEntry => Boolean(item));
  if (!entries.length || selected.stored.index >= entries.length) return undefined;
  const savedAt = selected.stored.savedAt || new Date().toISOString();
  return {
    sessionId: `legacy-${selected.module.id}`,
    origin: 'legacy-resume',
    status: 'paused',
    phase: 'question',
    createdAt: savedAt,
    updatedAt: savedAt,
    budgetMinutes: 5,
    scope: { kind: 'modules', moduleIds: [selected.module.id] },
    entries,
    index: selected.stored.index,
    checkpointEvery: 5,
    settings: {
      autoNext: selected.stored.settings.autoNext ?? true,
      autoRevealAfterIdle: selected.stored.settings.autoRevealAfterIdle ?? false,
      showExample: selected.stored.settings.showExample ?? true,
      showNumber: selected.stored.settings.showNumber ?? true,
      showCategory: selected.stored.settings.showCategory ?? true
    },
    selectedChoices: [],
    activeSessionMs: 0,
    completedAttemptIds: []
  };
}
