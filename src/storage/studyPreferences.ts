import type { StudyQuestionMode, StudySettings } from '../core/models';

const STUDY_PREFERENCES_VERSION = 1;
const QUESTION_LIMITS = new Set<StudySettings['questionLimit']>([10, 20, 50, 'all']);
const ANSWER_FORMATS = new Set(['auto', 'choice', 'input']);
const BOOLEAN_KEYS = ['shuffle', 'autoNext', 'autoRevealAfterIdle', 'showExample', 'showNumber', 'showCategory'] as const;

type StoredBooleanKey = (typeof BOOLEAN_KEYS)[number];
type StoredStudySettings = Pick<
  StudySettings,
  StoredBooleanKey | 'questionLimit' | 'selectedRange' | 'selectedCategory' | 'answerFormat' | 'questionMode'
>;

export interface StoredStudyPreferencesV1 {
  version: 1;
  settings: Partial<StoredStudySettings>;
  savedAt: string;
}

export interface StudyPreferenceSanitizeContext {
  validRanges: readonly string[];
  categories: readonly string[];
  questionModes: readonly StudyQuestionMode[];
}

export function studyPreferencesKey(packId: string, moduleId: string): string {
  return `loopdeck_study_prefs_v1_${packId}:${moduleId}`;
}

export function readStudyPreferences(
  packId: string,
  moduleId: string,
  storage: Pick<Storage, 'getItem'> = localStorage
): Partial<StudySettings> | undefined {
  try {
    const raw = storage.getItem(studyPreferencesKey(packId, moduleId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredStudyPreferencesV1>;
    if (parsed.version !== STUDY_PREFERENCES_VERSION || !parsed.settings || typeof parsed.settings !== 'object') return undefined;
    return parsed.settings as Partial<StudySettings>;
  } catch {
    return undefined;
  }
}

function storedSettings(settings: StudySettings): Partial<StoredStudySettings> {
  return {
    shuffle: settings.shuffle,
    autoNext: settings.autoNext,
    autoRevealAfterIdle: settings.autoRevealAfterIdle,
    questionLimit: settings.questionLimit,
    selectedRange: settings.selectedRange,
    selectedCategory: settings.selectedCategory,
    answerFormat: settings.answerFormat,
    questionMode: settings.questionMode,
    showExample: settings.showExample,
    showNumber: settings.showNumber,
    showCategory: settings.showCategory
  };
}

export function writeStudyPreferences(
  packId: string,
  moduleId: string,
  settings: StudySettings,
  storage: Pick<Storage, 'setItem'> = localStorage
): boolean {
  try {
    const stored: StoredStudyPreferencesV1 = {
      version: STUDY_PREFERENCES_VERSION,
      settings: storedSettings(settings),
      savedAt: new Date().toISOString()
    };
    storage.setItem(studyPreferencesKey(packId, moduleId), JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

function validBoolean(value: unknown, fallback: boolean | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeStudyPreferences(
  defaults: StudySettings,
  stored: Partial<StudySettings> | undefined,
  context: StudyPreferenceSanitizeContext
): StudySettings {
  if (!stored) return { ...defaults };

  const result: StudySettings = { ...defaults };
  for (const key of BOOLEAN_KEYS) {
    const value = validBoolean(stored[key], defaults[key]);
    if (value !== undefined) result[key] = value;
  }

  result.questionLimit = QUESTION_LIMITS.has(stored.questionLimit as StudySettings['questionLimit'])
    ? (stored.questionLimit as StudySettings['questionLimit'])
    : defaults.questionLimit;

  const ranges = new Set(['all', 'wrong', 'bookmarked', ...context.validRanges]);
  result.selectedRange =
    typeof stored.selectedRange === 'string' && ranges.has(stored.selectedRange) ? stored.selectedRange : (defaults.selectedRange ?? 'all');

  const categories = new Set(['all', ...context.categories]);
  result.selectedCategory =
    typeof stored.selectedCategory === 'string' && categories.has(stored.selectedCategory)
      ? stored.selectedCategory
      : (defaults.selectedCategory ?? 'all');

  result.answerFormat =
    typeof stored.answerFormat === 'string' && ANSWER_FORMATS.has(stored.answerFormat) ? stored.answerFormat : defaults.answerFormat;

  result.questionMode =
    typeof stored.questionMode === 'string' && context.questionModes.includes(stored.questionMode)
      ? stored.questionMode
      : (defaults.questionMode ?? 'as_stored');

  // `filter` is session/review state, not a reusable study preference.
  result.filter = defaults.filter ?? 'all';
  return result;
}
