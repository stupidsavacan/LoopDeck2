export type QuestionType = 'input' | 'choice' | 'multi_select';
export type AnswerResult = 'correct' | 'wrong' | 'revealed';
export type AnswerFormat = 'auto' | 'choice' | 'input';
export type StudyFilter = 'all' | 'wrong' | 'bookmarked';

export type ReviewState = 'new' | 'learning' | 'review' | 'relearning' | 'leech' | 'mastered' | 'suspended';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface FolderInfo {
  id: string;
  title: string;
}

export interface ModuleInfo {
  id: string;
  folderId: string;
  title: string;
  subject: string;
  description?: string;
  tags?: string[];
  questionIds: string[];
}

export interface BaseQuestion {
  id: string;
  originalId?: string;
  moduleId: string;
  type: QuestionType;
  prompt: string;
  explanation?: string;
  imageAsset?: string;
  category?: string;
  number?: number;
  example?: string;
}

export interface InputQuestion extends BaseQuestion {
  type: 'input';
  answer: string;
  acceptableAnswers?: string[];
  direction?: 'ja_to_en' | 'en_to_ja' | 'normal';
}

export interface ChoiceQuestion extends BaseQuestion {
  type: 'choice';
  choices: string[];
  answer: string;
  acceptableAnswers?: string[];
}

export interface MultiSelectQuestion extends BaseQuestion {
  type: 'multi_select';
  choices: string[];
  correctChoices: string[];
}

export type Question = InputQuestion | ChoiceQuestion | MultiSelectQuestion;

export interface LoopDeckPack {
  packVersion: number;
  packId: string;
  title: string;
  description?: string;
  folders: FolderInfo[];
  modules: ModuleInfo[];
  questions: Question[];
}

export interface Attempt {
  attemptId: string;
  questionId: string;
  moduleId: string;
  answeredAt: string;
  result: AnswerResult;
  input: string | string[];
  answer: string | string[];
  elapsedMs: number;
  mode: 'normal' | 'review';
  nearMiss?: boolean;
  hiddenTimeExcludedMs?: number;
  priorityDelta?: number;
  answerMode?: AnswerFormat;
}

export interface ReviewCard {
  questionId: string;
  moduleId: string;
  state: ReviewState;
  dueAt: string | null;
  lastReviewedAt: string | null;
  firstReviewedAt: string | null;
  intervalDays: number;
  ease: number;
  totalReviews: number;
  totalCorrect: number;
  totalWrong: number;
  correctStreak: number;
  wrongStreak: number;
  lapseCount: number;
  leechLevel: number;
  suspended: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewLog {
  reviewLogId: string;
  questionId: string;
  moduleId: string;
  reviewedAt: string;
  rating: ReviewRating;
  result: AnswerResult;
  previousState: ReviewState;
  nextState: ReviewState;
  previousDueAt: string | null;
  nextDueAt: string | null;
  previousIntervalDays: number;
  nextIntervalDays: number;
  previousEase: number;
  nextEase: number;
  elapsedMs: number;
  attemptId?: string;
}

export interface StudySettings {
  shuffle: boolean;
  autoNext: boolean;
  questionLimit: number | 'all';
  selectedRange?: string;
  selectedCategory?: string;
  filter?: StudyFilter;
  answerFormat?: AnswerFormat;
  showExample?: boolean;
  showNumber?: boolean;
  showCategory?: boolean;
}

export interface AppState {
  packs: LoopDeckPack[];
  selectedModuleId?: string;
  searchQuery: string;
}
