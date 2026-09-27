import type { ChoiceQuestion, FolderInfo, InputQuestion, LoopDeckPack, ModuleInfo, MultiSelectQuestion, Question, QuestionType } from '../core/models';

export const REVERSE_MODULE_IDS = new Set(['english_reverse', 'leap_reverse', 'leap_final_reverse']);
const LEAP_MODULE_IDS = new Set(['leap', 'leap_final']);

type BuiltinModulePresentation = Pick<ModuleInfo, 'folderId' | 'subtitle' | 'description' | 'tags' | 'accent'>;

/**
 * Legacy built-in source data predates the presentation fields now supported by
 * LoopDeck packs. Normalize those legacy rows once here so every screen reads
 * the same metadata from ModuleInfo instead of maintaining screen-local tables.
 */
const BUILTIN_MODULE_PRESENTATION: Record<string, BuiltinModulePresentation> = {
  history: {
    folderId: 'term1_midterm',
    subtitle: '歴史総合 一問一答',
    description: '帝国主義とアジアの民族運動など、歴史総合の重要語句を短く確認します。',
    tags: ['歴史', '社会', 'テスト'],
    accent: '#2563eb'
  },
  geography: {
    folderId: 'term1_midterm',
    subtitle: '地理総合 地形・地誌',
    description: '地形ノート、重要語句、図解系の確認に使う地理教材です。',
    tags: ['地理', '社会', '4択'],
    accent: '#0f766e'
  },
  chemistry: {
    folderId: 'term1_midterm',
    subtitle: '化学 一問一答',
    description: '化学の重要語句を短い確認でテンポよく進めます。',
    tags: ['化学', '理科', '入力'],
    accent: '#ea580c'
  },
  biology: {
    folderId: 'term1_midterm',
    subtitle: '生物 一問一答',
    description: '生物の重要語句を軽いカード学習として使います。',
    tags: ['生物', '理科', '復習'],
    accent: '#16a34a'
  },
  leap: {
    folderId: 'term1_midterm',
    subtitle: '英単語テスト 001-200',
    description: 'LEAP 001〜200。英単語の確認をシャッフルで進めます。',
    tags: ['英単語', '001-200', '中間'],
    accent: '#7c3aed'
  },
  leap_final: {
    folderId: 'term1_final',
    subtitle: '英単語テスト 201-300',
    description: 'LEAP 201〜300。期末範囲の英単語を確認します。',
    tags: ['英単語', '201-300', '期末'],
    accent: '#6d28d9'
  },
  english_comm: {
    folderId: 'term1_midterm',
    subtitle: '英語コミュニケーション',
    description: 'Switch系の単語、本文理解、翻訳問題をまとめた英コミュ教材。',
    tags: ['英コミュ', '本文', '翻訳'],
    accent: '#2563eb'
  },
  kobun_conjugation: {
    folderId: 'term1_midterm',
    subtitle: '古文文法 活用識別',
    description: '動詞の活用、識別ルール、古文本文の確認問題。',
    tags: ['古文', '動詞', '活用'],
    accent: '#9333ea'
  },
  english: {
    folderId: 'term1_midterm',
    subtitle: '英語表現 暗唱文テスト',
    description: '英文暗記、穴埋め、英作文系の確認教材。',
    tags: ['暗唱', '穴埋め', '英作文'],
    accent: '#0891b2'
  }
};

const BUILTIN_HOME_FOLDERS: FolderInfo[] = [
  {
    id: 'term1_midterm',
    title: '一学期中間テスト',
    description: '中間テスト用にまとめた教材',
    tags: ['歴史', '地理', '化学', '生物', '英単語 001〜200', '英コミュ', '動詞の活用', '英文暗記']
  },
  {
    id: 'term1_final',
    title: '一学期期末テスト',
    description: '期末テスト用に追加していく教材',
    tags: ['英単語 201〜300']
  }
];

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
  const presentation = BUILTIN_MODULE_PRESENTATION[id];
  const rawTags = asStringArray(rawModule.tags);

  return {
    id,
    folderId: presentation?.folderId ?? (asString(rawModule.folderId, asString(rawModule.subject, 'misc')).trim() || 'misc'),
    title,
    subject,
    subtitle: asString(rawModule.subtitle).trim() || presentation?.subtitle,
    preferredAnswerFormat: rawModule.preferredAnswerFormat === 'auto' || rawModule.preferredAnswerFormat === 'choice' || rawModule.preferredAnswerFormat === 'input'
      ? rawModule.preferredAnswerFormat
      : undefined,
    color: asString(rawModule.color).trim() || undefined,
    accent: asString(rawModule.accent).trim() || presentation?.accent,
    accentColor: asString(rawModule.accentColor).trim() || undefined,
    description: asString(rawModule.description).trim() || presentation?.description,
    tags: presentation?.tags ?? (rawTags.length ? rawTags : [subject]),
    questionIds: declaredQuestionIds.length ? declaredQuestionIds : fallbackQuestionIds
  };
}

function normalizeFolder(rawFolder: unknown): FolderInfo | undefined {
  if (!isObject(rawFolder)) return undefined;
  const id = asString(rawFolder.id).trim();
  const title = asString(rawFolder.title).trim();
  if (!id || id === 'reverse') return undefined;
  const tags = asStringArray(rawFolder.tags);
  return {
    id,
    title: title || id,
    description: asString(rawFolder.description).trim() || undefined,
    tags: tags.length ? tags : undefined
  };
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
  const folderById = new Map<string, FolderInfo>();
  for (const folder of BUILTIN_HOME_FOLDERS) if (usedFolderIds.has(folder.id)) folderById.set(folder.id, folder);
  for (const rawFolder of Array.isArray(rawPack.folders) ? rawPack.folders : []) {
    const folder = normalizeFolder(rawFolder);
    if (folder && usedFolderIds.has(folder.id) && !folderById.has(folder.id)) folderById.set(folder.id, folder);
  }
  if (usedFolderIds.has('japanese') && !folderById.has('japanese')) folderById.set('japanese', { id: 'japanese', title: '国語' });

  return {
    packVersion: 1,
    packId: 'loopdeck-builtin-v1',
    title: 'LoopDeck内蔵教材',
    description: 'シャッフル学習用の内蔵教材です。',
    folders: Array.from(folderById.values()),
    modules,
    questions
  };
}

export function getVisibleBuiltinModules(modules: ModuleInfo[]): ModuleInfo[] {
  return modules.filter((module) => module.questionIds.length > 0 && !REVERSE_MODULE_IDS.has(module.id));
}
