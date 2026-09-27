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

export interface IndexedWrongAnswerMatch {
  question: Question;
  matchedAnswer: string;
}

export type WrongAnswerLookupIndex = ReadonlyMap<string, readonly IndexedWrongAnswerMatch[]>;

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
    const text = String(value ?? '')
      .normalize('NFKC')
      .replace(TAG_RE, '')
      .trim();
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

export function buildWrongAnswerLookupIndex(allQuestions: Question[]): WrongAnswerLookupIndex {
  const index = new Map<string, IndexedWrongAnswerMatch[]>();
  for (const question of allQuestions) {
    for (const matchedAnswer of collectAnswerTexts(question)) {
      const key = normalizeWrongAnswerLookup(matchedAnswer);
      if (!key) continue;
      const matches = index.get(key) ?? [];
      matches.push({ question, matchedAnswer });
      index.set(key, matches);
    }
  }
  return index;
}

export function findQuestionByAnswer(
  value: string,
  currentQuestion: Question,
  allQuestions: Question[],
  lookupIndex?: WrongAnswerLookupIndex
): { question: Question; matchedAnswer: string } | undefined {
  const normalizedValue = normalizeWrongAnswerLookup(value);
  if (!normalizedValue) return undefined;

  const matches = (lookupIndex ?? buildWrongAnswerLookupIndex(allQuestions)).get(normalizedValue) ?? [];
  const sameModule = matches.find(
    (match) => match.question.id !== currentQuestion.id && match.question.moduleId === currentQuestion.moduleId
  );
  if (sameModule) return sameModule;
  return matches.find((match) => match.question.id !== currentQuestion.id && match.question.moduleId !== currentQuestion.moduleId);
}

export function buildWrongAnswerExplanation(
  source: WrongAnswerExplanationSource,
  value: string,
  currentQuestion: Question,
  allQuestions: Question[],
  lookupIndex?: WrongAnswerLookupIndex
): WrongAnswerExplanation | undefined {
  if (!normalizeWrongAnswerLookup(value)) return undefined;

  const hit = findQuestionByAnswer(value, currentQuestion, allQuestions, lookupIndex);
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
