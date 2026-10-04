import { buildChoiceCandidateIndex } from '../core/choiceGenerator';
import { buildWrongAnswerLookupIndexForStudyMode } from '../core/wrongAnswerExplanation';
import type { Attempt, ConcreteStudyQuestionMode, ModuleInfo, Question, StudySettings } from '../core/models';
import { getSupportedStudyQuestionModes, presentQuestionForStudy, resolveConcreteStudyQuestionMode } from '../core/questionPresentation';
import { elapsedForSession, type QuizSession } from '../core/sessionEngine';
import { runtimeSettings } from '../core/studySettings';

export interface StoredSessionQuestion {
  questionId: string;
  questionMode: ConcreteStudyQuestionMode;
}

export interface StoredSession {
  version: 2;
  questions: StoredSessionQuestion[];
  index: number;
  mode: 'normal' | 'review';
  settings: StudySettings;
  startedAt: number;
  sessionElapsedMs?: number;
  currentElapsedMs: number;
  currentHiddenTimeExcludedMs: number;
  attempts: Attempt[];
  savedAt: string;
  contentIdentity?: string;
  packRevision?: string;
  resetEpoch?: string;
}

export interface SessionStorageScope {
  packId: string;
  contentIdentity: string;
  packRevision?: string;
  resetEpoch?: string;
}

/** Include answer rules and choice-pool content, rather than only reused IDs. */
export async function sessionStorageScope(packId: string, module: ModuleInfo, questions: Question[]): Promise<SessionStorageScope> {
  const content = JSON.stringify([module, questions], (_key, value: unknown) => {
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]])
    );
  });
  try {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      return { packId, contentIdentity: `sha256:${hash}` };
    }
  } catch {
    // Local files and older WebViews may not provide Web Crypto.
  }
  return { packId, contentIdentity: `json:${content}` };
}

interface LegacyStoredSession {
  questionIds: string[];
  index: number;
  mode: 'normal' | 'review';
  settings: StudySettings;
  savedAt: string;
}

export function sessionStorageKey(moduleId: string, scope?: SessionStorageScope): string {
  return scope ? `loopdeck_session_v3_${JSON.stringify([scope.packId, moduleId])}` : `loopdeck_session_${moduleId}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finiteNonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const stringOrStrings = (value: unknown): boolean =>
  typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
const optionalEnum = (value: unknown, options: readonly string[]): boolean =>
  value === undefined || (typeof value === 'string' && options.includes(value));

function validSettings(value: unknown): value is StudySettings {
  if (!isRecord(value) || typeof value.shuffle !== 'boolean' || typeof value.autoNext !== 'boolean') return false;
  if (
    value.questionLimit !== 'all' &&
    !(typeof value.questionLimit === 'number' && Number.isSafeInteger(value.questionLimit) && value.questionLimit > 0)
  )
    return false;
  for (const key of ['autoRevealAfterIdle', 'showExample', 'showNumber', 'showCategory']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return false;
  }
  for (const key of ['selectedRange', 'selectedCategory']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  return (
    optionalEnum(value.filter, ['all', 'wrong', 'bookmarked']) &&
    optionalEnum(value.answerFormat, ['auto', 'choice', 'input']) &&
    optionalEnum(value.questionMode, ['as_stored', 'front_to_back', 'back_to_front', 'mixed'])
  );
}

function validAttempt(value: unknown, moduleId: string, questionIds: Set<string>): value is Attempt {
  if (!isRecord(value)) return false;
  return (
    typeof value.attemptId === 'string' &&
    value.attemptId.length > 0 &&
    value.moduleId === moduleId &&
    typeof value.questionId === 'string' &&
    questionIds.has(value.questionId) &&
    typeof value.answeredAt === 'string' &&
    Number.isFinite(Date.parse(value.answeredAt)) &&
    typeof value.result === 'string' &&
    ['correct', 'wrong', 'revealed'].includes(value.result) &&
    stringOrStrings(value.input) &&
    stringOrStrings(value.answer) &&
    finiteNonnegative(value.elapsedMs) &&
    (value.mode === 'normal' || value.mode === 'review') &&
    (value.hiddenTimeExcludedMs === undefined || finiteNonnegative(value.hiddenTimeExcludedMs)) &&
    (value.nearMiss === undefined || typeof value.nearMiss === 'boolean') &&
    (value.priorityDelta === undefined || (typeof value.priorityDelta === 'number' && Number.isFinite(value.priorityDelta))) &&
    optionalEnum(value.answerMode, ['auto', 'choice', 'input']) &&
    (value.questionMode === undefined || isConcreteStudyQuestionMode(value.questionMode))
  );
}

function isConcreteStudyQuestionMode(value: unknown): value is ConcreteStudyQuestionMode {
  return value === 'as_stored' || value === 'front_to_back' || value === 'back_to_front';
}

function normalizeLegacyStoredSession(parsed: LegacyStoredSession, byId: Map<string, Question>): StoredSession | undefined {
  if (
    !Array.isArray(parsed.questionIds) ||
    !Number.isSafeInteger(parsed.index) ||
    parsed.index < 0 ||
    parsed.index >= parsed.questionIds.length
  )
    return undefined;
  if (!parsed.questionIds.every((id) => typeof id === 'string' && byId.has(id))) return undefined;
  if (!validSettings(parsed.settings) || (parsed.mode !== 'normal' && parsed.mode !== 'review')) return undefined;
  if (parsed.settings.questionMode === 'mixed') return undefined;
  const requestedMode = parsed.settings.questionMode ?? 'as_stored';
  const questions = parsed.questionIds.map((questionId) => {
    const question = byId.get(questionId);
    if (!question) throw new Error('Stored question is unavailable.');
    return { questionId, questionMode: resolveConcreteStudyQuestionMode(question, requestedMode) };
  });
  const parsedSavedAt = Date.parse(parsed.savedAt);
  return {
    version: 2,
    questions,
    index: parsed.index,
    mode: parsed.mode,
    settings: parsed.settings,
    startedAt: Number.isFinite(parsedSavedAt) ? parsedSavedAt : Date.now(),
    currentElapsedMs: 0,
    currentHiddenTimeExcludedMs: 0,
    attempts: [],
    savedAt: parsed.savedAt
  };
}

export function readStoredSession(moduleId: string, byId: Map<string, Question>, scope?: SessionStorageScope): StoredSession | undefined {
  try {
    const raw = localStorage.getItem(sessionStorageKey(moduleId, scope));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredSession> & Partial<LegacyStoredSession>;
    if (!isRecord(parsed)) return undefined;
    // Unscoped legacy records cannot establish which pack or content they belonged to.
    if (scope && parsed.contentIdentity !== scope.contentIdentity) return undefined;
    if (scope?.packRevision !== undefined && parsed.packRevision !== scope.packRevision) return undefined;
    if (scope?.resetEpoch !== undefined && parsed.resetEpoch !== scope.resetEpoch) return undefined;
    if (parsed.version !== 2) return normalizeLegacyStoredSession(parsed as LegacyStoredSession, byId);
    if (
      !Array.isArray(parsed.questions) ||
      !parsed.questions.length ||
      typeof parsed.index !== 'number' ||
      !Number.isSafeInteger(parsed.index) ||
      parsed.index < 0 ||
      parsed.index > parsed.questions.length
    )
      return undefined;
    if (
      !parsed.questions.every((item) => {
        if (!item || typeof item.questionId !== 'string' || !isConcreteStudyQuestionMode(item.questionMode)) return false;
        const question = byId.get(item.questionId);
        return question?.moduleId === moduleId && getSupportedStudyQuestionModes(question).includes(item.questionMode);
      })
    )
      return undefined;
    if (new Set(parsed.questions.map((item) => item.questionId)).size !== parsed.questions.length) return undefined;
    if (!validSettings(parsed.settings)) return undefined;
    if (parsed.mode !== 'normal' && parsed.mode !== 'review') return undefined;
    if (!finiteNonnegative(parsed.startedAt)) return undefined;
    if (
      parsed.sessionElapsedMs !== undefined &&
      (typeof parsed.sessionElapsedMs !== 'number' || !Number.isFinite(parsed.sessionElapsedMs) || parsed.sessionElapsedMs < 0)
    )
      return undefined;
    if (typeof parsed.currentElapsedMs !== 'number' || !Number.isFinite(parsed.currentElapsedMs) || parsed.currentElapsedMs < 0)
      return undefined;
    if (
      typeof parsed.currentHiddenTimeExcludedMs !== 'number' ||
      !Number.isFinite(parsed.currentHiddenTimeExcludedMs) ||
      parsed.currentHiddenTimeExcludedMs < 0
    )
      return undefined;
    const questionIds = new Set(parsed.questions.map((item) => item.questionId));
    if (!Array.isArray(parsed.attempts) || !parsed.attempts.every((attempt) => validAttempt(attempt, moduleId, questionIds)))
      return undefined;
    if (typeof parsed.savedAt !== 'string' || !Number.isFinite(Date.parse(parsed.savedAt))) return undefined;
    return parsed as StoredSession;
  } catch {
    return undefined;
  }
}

export function restoreStoredSession(
  module: ModuleInfo,
  stored: StoredSession,
  byId: Map<string, Question>,
  choicePool: Question[]
): QuizSession | undefined {
  const queue: Question[] = [];
  for (const item of stored.questions) {
    const question = byId.get(item.questionId);
    if (!question) return undefined;
    queue.push(presentQuestionForStudy(question, item.questionMode));
  }
  return {
    module,
    queue,
    choicePool: [...choicePool],
    choiceCandidateIndex: buildChoiceCandidateIndex(choicePool),
    wrongAnswerLookupIndex: buildWrongAnswerLookupIndexForStudyMode(
      choicePool.length ? choicePool : queue,
      stored.settings.questionMode ?? 'as_stored'
    ),
    index: stored.index,
    settings: runtimeSettings(stored.settings),
    startedAt: stored.startedAt,
    // Older v2 records cannot recover feedback time or suspension intervals.
    // Use recorded answer time rather than inventing activity from a wall-clock span.
    sessionElapsedMs:
      stored.sessionElapsedMs ??
      stored.attempts.reduce((sum, attempt) => sum + Math.max(0, attempt.elapsedMs), 0) + stored.currentElapsedMs,
    sessionSegmentStartedAt: Date.now(),
    currentStartedAt: Date.now(),
    currentElapsedMs: stored.currentElapsedMs,
    currentHiddenTimeExcludedMs: stored.currentHiddenTimeExcludedMs,
    mode: stored.mode,
    attempts: [...stored.attempts]
  };
}

export function saveStoredSession(moduleId: string, session: QuizSession, scope?: SessionStorageScope): boolean {
  const stored: StoredSession = {
    version: 2,
    questions: session.queue.map((question) => ({
      questionId: question.id,
      questionMode: question.activeStudyMode ?? 'as_stored'
    })),
    index: session.index,
    mode: session.mode,
    settings: session.settings,
    startedAt: session.startedAt,
    sessionElapsedMs: elapsedForSession(session),
    currentElapsedMs: session.currentElapsedMs,
    currentHiddenTimeExcludedMs: session.currentHiddenTimeExcludedMs,
    attempts: session.attempts,
    savedAt: new Date().toISOString(),
    ...(scope ? { contentIdentity: scope.contentIdentity, packRevision: scope.packRevision, resetEpoch: scope.resetEpoch } : {})
  };
  try {
    localStorage.setItem(sessionStorageKey(moduleId, scope), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredSession(moduleId: string, scope?: SessionStorageScope): boolean {
  try {
    localStorage.removeItem(sessionStorageKey(moduleId, scope));
    return true;
  } catch {
    return false;
  }
}
