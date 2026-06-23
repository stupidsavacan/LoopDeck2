import type { Question } from './models';

export type WrongAnswerExplanationSource = 'choice' | 'input';

export interface WrongAnswerExplanation {
  source: WrongAnswerExplanationSource;
  value: string;
  found: boolean;
  matchedQuestionId?: string;
  matchedAnswer?: string;
  explanation?: string;
}

const TAG_RE = /<[^>]*>/g;
const LOOKUP_PUNCTUATION_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~。、，．・：；？！「」『』（）［］【】〈〉《》〔〕〜～…]/g;

export function normalizeWrongAnswerLookup(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(TAG_RE, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(LOOKUP_PUNCTUATION_RE, '')
    .toLocaleLowerCase()
    .trim();
}

function uniqueNonEmpty(values: unknown[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = String(value ?? '').normalize('NFKC').replace(TAG_RE, '').trim();
    if (!text) continue;
    const key = normalizeWrongAnswerLookup(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

export function collectAnswerTexts(question: Question): string[] {
  const values: unknown[] = [];

  if ('answer' in question) values.push(question.answer);
  if ('acceptableAnswers' in question) values.push(...(question.acceptableAnswers ?? []));
  if ('acceptedAnswers' in question) values.push(...(question.acceptedAnswers ?? []));

  values.push(question.sides?.front?.text);
  values.push(...(question.sides?.front?.acceptableAnswers ?? []));
  values.push(question.sides?.back?.text);
  values.push(...(question.sides?.back?.acceptableAnswers ?? []));

  if (question.type === 'multi_select') values.push(...question.correctChoices);

  return uniqueNonEmpty(values);
}

export function findQuestionByAnswer(
  value: string,
  currentQuestion: Question,
  allQuestions: Question[]
): { question: Question; matchedAnswer: string } | undefined {
  const normalizedValue = normalizeWrongAnswerLookup(value);
  if (!normalizedValue) return undefined;

  const sameModule = allQuestions.filter((question) =>
    question.id !== currentQuestion.id &&
    question.moduleId === currentQuestion.moduleId
  );
  const otherQuestions = allQuestions.filter((question) =>
    question.id !== currentQuestion.id &&
    question.moduleId !== currentQuestion.moduleId
  );

  for (const question of [...sameModule, ...otherQuestions]) {
    const matchedAnswer = collectAnswerTexts(question).find((answer) => normalizeWrongAnswerLookup(answer) === normalizedValue);
    if (matchedAnswer) return { question, matchedAnswer };
  }

  return undefined;
}

export function buildWrongAnswerExplanation(
  source: WrongAnswerExplanationSource,
  value: string,
  currentQuestion: Question,
  allQuestions: Question[]
): WrongAnswerExplanation | undefined {
  if (!normalizeWrongAnswerLookup(value)) return undefined;

  const hit = findQuestionByAnswer(value, currentQuestion, allQuestions);
  if (!hit) {
    return {
      source,
      value,
      found: false
    };
  }

  return {
    source,
    value,
    found: true,
    matchedQuestionId: hit.question.id,
    matchedAnswer: hit.matchedAnswer,
    explanation: typeof hit.question.explanation === 'string' ? hit.question.explanation.trim() : ''
  };
}
