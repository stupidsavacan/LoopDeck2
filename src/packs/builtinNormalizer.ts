import type { ChoiceQuestion, FolderInfo, InputQuestion, LoopDeckPack, ModuleInfo, MultiSelectQuestion, Question, QuestionType } from '../core/models';

export const REVERSE_MODULE_IDS = new Set(['english_reverse', 'leap_reverse', 'leap_final_reverse']);
const LEAP_MODULE_IDS = new Set(['leap', 'leap_final']);

const DEFAULT_MODULE_DESCRIPTIONS: Record<string, string> = {
  history: '歴史総合の重要語句を短い確認問題で進めます。',
  geography: '地形・地誌・重要語句をシャッフルで確認します。',
  chemistry: '化学の重要語句を一問一答で確認します。',
  biology: '生物の重要語句を一問一答で確認します。',
  english_comm: '英語コミュニケーションの本文理解・語句・翻訳を確認します。',
  english: '英文暗記、穴埋め、英作文系の確認教材です。',
  leap: 'LEAP 001〜200 の英単語をシャッフルで確認します。',
  leap_final: 'LEAP 201〜300 の英単語をシャッフルで確認します。',
  kobun_conjugation: '古文の動詞活用と識別ルールを確認します。'
};

const DEFAULT_MODULE_TAGS: Record<string, string[]> = {
  history: ['社会', '歴史', '一問一答'],
  geography: ['社会', '地理', '4択'],
  chemistry: ['理科', '化学', '一問一答'],
  biology: ['理科', '生物', '一問一答'],
  english_comm: ['英語', '英コミュ', '本文'],
  english: ['英語', '暗唱', '穴埋め'],
  leap: ['英語', '英単語', '001〜200'],
  leap_final: ['英語', '英単語', '201〜300'],
  kobun_conjugation: ['国語', '古文', '活用']
};

const EMPTY_KOBUN_VOCAB: ModuleInfo = {
  id: 'kobun_vocab',
  folderId: 'japanese',
  title: '古文単語',
  subject: '国語',
  description: '必要になったら問題を追加できる空の教材です。',
  tags: ['国語'],
  questionIds: []
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function leapNumberFromId(id: string, moduleId: string): number | undefined {
  if (!LEAP_MODULE_IDS.has(moduleId)) return undefined;
  const match = /-(\d+)$/.exec(id);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function inferQuestionType(raw: Record<string, unknown>): QuestionType {
  const explicit = raw.type;
  if (explicit === 'input' || explicit === 'choice' || explicit === 'multi_select') return explicit;
  if (asStringArray(raw.correctChoices).length >= 2) return 'multi_select';
  if (asStringArray(raw.choices).length > 0) return 'choice';
  return 'input';
}

function firstAnswer(raw: Record<string, unknown>): string {
  const direct = asString(raw.answer);
  if (direct) return direct;
  return asStringArray(raw.answers)[0] ?? '';
}

function normalizeQuestion(rawQuestion: unknown): Question | undefined {
  if (!isObject(rawQuestion)) return undefined;
  const id = asString(rawQuestion.id).trim();
  const moduleId = asString(rawQuestion.moduleId).trim();
  const prompt = asString(rawQuestion.prompt).trim();
  if (!id || !moduleId || !prompt || REVERSE_MODULE_IDS.has(moduleId)) return undefined;

  const category = asString(rawQuestion.category, asString(rawQuestion.subject)).trim();
  const example = asString(rawQuestion.example, asString(rawQuestion.exampleSentence)).trim();
  const number = asNumber(rawQuestion.number) ?? leapNumberFromId(id, moduleId);
  const base = {
    id,
    moduleId,
    prompt,
    explanation: asString(rawQuestion.explanation) || undefined,
    imageAsset: asString(rawQuestion.imageAsset) || undefined,
    category: category || undefined,
    example: example || undefined,
    number
  };

  const type = inferQuestionType(rawQuestion);
  if (type === 'multi_select') {
    const question: MultiSelectQuestion = {
      ...base,
      type,
      choices: asStringArray(rawQuestion.choices),
      correctChoices: asStringArray(rawQuestion.correctChoices).length ? asStringArray(rawQuestion.correctChoices) : asStringArray(rawQuestion.answers)
    };
    return question;
  }

  const answer = firstAnswer(rawQuestion);
  if (type === 'choice') {
    const question: ChoiceQuestion = {
      ...base,
      type,
      choices: asStringArray(rawQuestion.choices),
      answer,
      acceptableAnswers: asStringArray(rawQuestion.acceptableAnswers)
    };
    return question;
  }

  const question: InputQuestion = {
    ...base,
    type: 'input',
    answer,
    acceptableAnswers: asStringArray(rawQuestion.acceptableAnswers),
    direction: rawQuestion.direction === 'ja_to_en' || rawQuestion.direction === 'en_to_ja' ? rawQuestion.direction : 'normal'
  };
  return question;
}

function normalizeModule(rawModule: unknown, questionsByModule: Map<string, string[]>): ModuleInfo | undefined {
  if (!isObject(rawModule)) return undefined;
  const id = asString(rawModule.id).trim();
  if (!id || REVERSE_MODULE_IDS.has(id)) return undefined;

  const fallbackQuestionIds = questionsByModule.get(id) ?? [];
  const declaredQuestionIds = asStringArray(rawModule.questionIds).filter((questionId) => fallbackQuestionIds.includes(questionId));
  const title = asString(rawModule.title, id).trim() || id;
  const subject = asString(rawModule.subject, 'その他').trim() || 'その他';

  return {
    id,
    folderId: asString(rawModule.folderId, asString(rawModule.subject, 'misc')).trim() || 'misc',
    title,
    subject,
    color: asString(rawModule.color).trim() || undefined,
    accent: asString(rawModule.accent).trim() || undefined,
    accentColor: asString(rawModule.accentColor).trim() || undefined,
    description: DEFAULT_MODULE_DESCRIPTIONS[id] ?? undefined,
    tags: DEFAULT_MODULE_TAGS[id] ?? [subject],
    questionIds: declaredQuestionIds.length ? declaredQuestionIds : fallbackQuestionIds
  };
}

function normalizeFolder(rawFolder: unknown): FolderInfo | undefined {
  if (!isObject(rawFolder)) return undefined;
  const id = asString(rawFolder.id).trim();
  const title = asString(rawFolder.title).trim();
  if (!id || id === 'reverse') return undefined;
  return { id, title: title || id };
}

export function normalizeBuiltinPack(rawPack: unknown): LoopDeckPack {
  if (!isObject(rawPack)) throw new Error('Built-in question pack must be an object.');

  const questions = (Array.isArray(rawPack.questions) ? rawPack.questions : [])
    .map(normalizeQuestion)
    .filter((question): question is Question => Boolean(question));

  const questionsByModule = questions.reduce<Map<string, string[]>>((acc, question) => {
    const ids = acc.get(question.moduleId) ?? [];
    ids.push(question.id);
    acc.set(question.moduleId, ids);
    return acc;
  }, new Map());

  const modules = (Array.isArray(rawPack.modules) ? rawPack.modules : [])
    .map((module) => normalizeModule(module, questionsByModule))
    .filter((module): module is ModuleInfo => Boolean(module));

  if (!modules.some((module) => module.id === EMPTY_KOBUN_VOCAB.id)) modules.push(EMPTY_KOBUN_VOCAB);

  const usedFolderIds = new Set(modules.map((module) => module.folderId));
  const folders = (Array.isArray(rawPack.folders) ? rawPack.folders : [])
    .map(normalizeFolder)
    .filter((folder): folder is FolderInfo => {
      if (!folder) return false;
      return usedFolderIds.has(folder.id);
    });

  if (usedFolderIds.has('japanese') && !folders.some((folder) => folder.id === 'japanese')) folders.push({ id: 'japanese', title: '国語' });

  return {
    packVersion: 1,
    packId: 'loopdeck-builtin-v1',
    title: 'LoopDeck内蔵教材',
    description: 'シャッフル学習用の内蔵教材です。',
    folders,
    modules,
    questions
  };
}

export function getVisibleBuiltinModules(modules: ModuleInfo[]): ModuleInfo[] {
  return modules.filter((module) => module.questionIds.length > 0 && !REVERSE_MODULE_IDS.has(module.id));
}
