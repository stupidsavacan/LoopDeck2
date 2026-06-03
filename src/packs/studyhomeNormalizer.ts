import type { ChoiceQuestion, FolderInfo, InputQuestion, LoopDeckPack, ModuleInfo, MultiSelectQuestion, Question, QuestionType } from '../core/models';

export const REVERSE_MODULE_IDS = new Set(['english_reverse', 'leap_reverse', 'leap_final_reverse']);

const EMPTY_KOBUN_VOCAB: ModuleInfo = {
  id: 'kobun_vocab',
  folderId: 'japanese',
  title: '古文単語',
  subject: '国語',
  description: 'StudyHome-Next rescue reference kept as an empty module.',
  tags: ['国語', 'rescued', 'empty'],
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

function numberFromId(id: string): number | undefined {
  const match = /(?:^|:)(\d+)$/.exec(id);
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
  const number = asNumber(rawQuestion.number) ?? asNumber(rawQuestion.no) ?? asNumber(rawQuestion.index) ?? numberFromId(id);
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

  return {
    id,
    folderId: asString(rawModule.folderId, asString(rawModule.subject, 'misc')).trim() || 'misc',
    title: asString(rawModule.title, id).trim() || id,
    subject: asString(rawModule.subject, 'その他').trim() || 'その他',
    description: asString(rawModule.description) || undefined,
    tags: asStringArray(rawModule.tags),
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

export function normalizeStudyHomePack(rawPack: unknown): LoopDeckPack {
  if (!isObject(rawPack)) throw new Error('StudyHome rescued pack must be an object.');

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
    packId: asString(rawPack.packId, 'studyhome-rescued-v1'),
    title: asString(rawPack.title, 'StudyHome Rescued Data'),
    description: asString(rawPack.description) || undefined,
    folders,
    modules,
    questions
  };
}

export function getVisibleStudyModules(modules: ModuleInfo[]): ModuleInfo[] {
  return modules.filter((module) => module.questionIds.length > 0 && !REVERSE_MODULE_IDS.has(module.id));
}
