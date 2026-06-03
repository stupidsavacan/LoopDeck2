export type QuestionType = 'input' | 'choice' | 'multi_select';
export type AnswerResult = 'correct' | 'wrong' | 'revealed';
export type AnswerFormat = 'auto' | 'choice' | 'input';
export type StudyFilter = 'all' | 'wrong' | 'bookmarked';

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
