export type QuestionType = 'input' | 'choice' | 'multi_select';
export type AnswerResult = 'correct' | 'wrong' | 'revealed';
export type AnswerFormat = 'auto' | 'choice' | 'input';
export type StudyFilter = 'all' | 'wrong' | 'bookmarked';
export type ConcreteStudyQuestionMode = 'as_stored' | 'front_to_back' | 'back_to_front';
export type StudyQuestionMode = ConcreteStudyQuestionMode | 'mixed';

export type ReviewState = 'new' | 'learning' | 'review' | 'relearning' | 'leech' | 'mastered' | 'suspended';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export type QuestionSamplePattern =
  | 'solid'
  | 'vertical_stripes'
  | 'horizontal_stripes'
  | 'diagonal_stripes'
  | 'cross_hatch'
  | 'dots'
  | 'grid';

export interface QuestionSampleMark {
  label: string;
  color: string;
  pattern?: QuestionSamplePattern;
  patternColor?: string;
  description?: string;
}

export interface StudySide {
  label: string;
  text: string;
  acceptableAnswers?: string[];
}

export interface TwoSidedStudyData {
  front: StudySide;
  back: StudySide;
}

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
  moduleId: string;
  type: QuestionType;
  prompt: string;
  explanation?: string;
  imageAsset?: string;
  category?: string;
  number?: number;
  example?: string;
  sampleMarks?: QuestionSampleMark[];
  /** Backward compatibility only. New packs should use sampleMarks. */
  sampleColors?: Array<{ label: string; color: string; description?: string }>;
  sides?: TwoSidedStudyData;
  supportedStudyModes?: Array<'front_to_back' | 'back_to_front'>;
  /** Runtime-only field used to remember how this question is presented in the current session. */
  activeStudyMode?: ConcreteStudyQuestionMode;
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
  questionMode?: ConcreteStudyQuestionMode;
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
  questionMode?: StudyQuestionMode;
  showExample?: boolean;
  showNumber?: boolean;
  showCategory?: boolean;
}

export interface AppState {
  packs: LoopDeckPack[];
  selectedModuleId?: string;
  searchQuery: string;
}
