import type {
  AnswerFormat,
  AnswerResult,
  Attempt,
  ConcreteStudyQuestionMode,
  ModuleInfo,
  ReviewState
} from '../core/models';

export type FlowReason = 'due' | 'weak' | 'new' | 'continuation';

export type ReasonEvidence =
  | { kind: 'due'; reviewState: ReviewState; dueAt: string | null; sourceRank: number }
  | { kind: 'weak'; score: number; label: '最優先' | '要復習' | '確認'; lastAttemptAt: number; sourceRank: number }
  | { kind: 'new'; neverAttempted: true; sourceRank: number }
  | { kind: 'continuation'; sessionId: string; originalIndex: number };

export interface Candidate {
  questionId: string;
  moduleId: string;
  primaryReason: Exclude<FlowReason, 'continuation'>;
  reasons: ReasonEvidence[];
  dueRank?: number;
  weakRank?: number;
  newRank?: number;
  lastAttemptAt?: number;
  recentlyAnswered: boolean;
  sourceOrder: number;
  estimatedSeconds: number;
}

export type FlowScope =
  | { kind: 'all' }
  | { kind: 'modules'; moduleIds: string[] }
  | { kind: 'category'; moduleId: string; category: string }
  | { kind: 'attention'; moduleId?: string }
  | { kind: 'bookmarks'; moduleId?: string };

export interface PlanEntry {
  questionId: string;
  moduleId: string;
  primaryReason: FlowReason;
  reasons: ReasonEvidence[];
  questionMode: ConcreteStudyQuestionMode;
  answerFormat: AnswerFormat;
  originalPlanIndex: number;
}

export interface FlowSegment {
  segmentId: string;
  index: number;
  candidates: PlanEntry[];
  estimatedSeconds: number;
  reasonCounts: Record<FlowReason, number>;
  moduleCounts: Record<string, number>;
}

export interface StudyPlan {
  planId: string;
  createdAt: string;
  budgetMinutes: 5 | 10 | 20;
  targetCount: number;
  scope: FlowScope;
  focusId?: string;
  segments: FlowSegment[];
  queue: PlanEntry[];
  primaryReasonCounts: Record<FlowReason, number>;
  estimatedSeconds: number;
  excludedRecentQuestionIds: string[];
  sourceSnapshotTimestamp: string;
}

export interface FlowSessionSettings {
  autoNext: boolean;
  autoRevealAfterIdle: boolean;
  showExample: boolean;
  showNumber: boolean;
  showCategory: boolean;
}

export interface FlowSessionRecord {
  sessionId: string;
  planId?: string;
  origin: 'flow' | 'module' | 'custom' | 'legacy-resume';
  status: 'active' | 'paused' | 'completed';
  phase: 'question' | 'feedback' | 'checkpoint' | 'complete';
  createdAt: string;
  updatedAt: string;
  budgetMinutes: 5 | 10 | 20;
  scope: FlowScope;
  focusId?: string;
  entries: PlanEntry[];
  index: number;
  checkpointEvery: 5;
  settings: FlowSessionSettings;
  draftInput?: string;
  selectedChoices: string[];
  currentAttemptId?: string;
  activeSessionMs: number;
  completedAttemptIds: string[];
}

export type IdleState =
  | { kind: 'disabled' }
  | { kind: 'running'; remainingMs: number }
  | { kind: 'paused-hidden'; remainingMs: number }
  | { kind: 'paused-composition'; remainingMs: number };

export type PlayerState =
  | { tag: 'loading' }
  | { tag: 'question'; session: FlowSessionRecord; entry: PlanEntry; draft: string; selectedChoices: string[]; idleState: IdleState }
  | { tag: 'persisting'; session: FlowSessionRecord; pendingAttempt: Attempt }
  | { tag: 'feedback'; session: FlowSessionRecord; entry: PlanEntry; attempt: Attempt }
  | { tag: 'checkpoint'; session: FlowSessionRecord }
  | { tag: 'complete'; session: FlowSessionRecord }
  | { tag: 'error'; code: string; message: string; recoverable: boolean };

export interface FlowPreferences {
  defaultBudgetMinutes: 5 | 10 | 20;
  appearance: 'system' | 'light' | 'dark';
  autoNextCorrect: boolean;
  autoRevealAfterIdle: boolean;
  showExample: boolean;
  showNumber: boolean;
  showCategory: boolean;
}

export interface FocusConfig {
  focusId: string;
  name: string;
  enabled: boolean;
  targetDate: string;
  dailyMinutes: 5 | 10 | 20;
  moduleIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ModuleSnapshot {
  module: ModuleInfo;
  totalQuestions: number;
  answeredQuestionCount: number;
  unseenCount: number;
  attemptCount: number;
  accuracy: number;
  recentAccuracy: number;
  dueCount: number;
  weakCount: number;
  attentionCount: number;
  bookmarkCount: number;
  lastStudiedAt?: string;
  categories: string[];
}

export interface TodaySnapshot {
  localDateKey: string;
  activeFocus?: FocusConfig;
  resumeSession?: FlowSessionRecord;
  legacyResumeSession?: FlowSessionRecord;
  defaultBudgetMinutes: 5 | 10 | 20;
  dueCount: number;
  weakCount: number;
  newCount: number;
  previewPlan: StudyPlan;
  attentionModules: ModuleSnapshot[];
  recentModules: ModuleSnapshot[];
  hasAnyQuestions: boolean;
}

export interface SessionSummary {
  total: number;
  correct: number;
  wrong: number;
  revealed: number;
  result: AnswerResult | 'mixed';
  accuracy: number;
}
