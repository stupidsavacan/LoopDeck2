import type { ChoiceQuestion, InputQuestion, MultiSelectQuestion, Question } from './models';

const EDGE_PUNCTUATION = /^[\s\"'`「」『』（）()【】\[\]。．.!！?？,，、:：;；]+|[\s\"'`「」『』（）()【】\[\]。．.!！?？,，、:：;；]+$/g;
const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/;

const normalize = (value: string): string =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCTUATION, '')
    .toLowerCase();

const stripJapaneseSentenceEdges = (value: string): string =>
  normalize(value)
    .replace(/^答え(は|が)?/, '')
    .replace(/^(正解|回答)(は|が)?/, '')
    .replace(/(です|である|だ)$/g, '')
    .replace(EDGE_PUNCTUATION, '')
    .trim();

function containsEnglishAnswer(input: string, answer: string): boolean {
  if (answer.length < 2) return false;
  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(input);
}

function isAcceptableJapaneseExpansion(input: string, target: string): boolean {
  if (!JAPANESE_TEXT.test(target) || target.length < 2 || input.length <= target.length) return false;
  const prefixes = ['', '答えは', '答えが', '正解は', '正解が', '回答は', '回答が'];
  const suffixes = ['', 'です', 'だ', 'である'];
  return prefixes.some((prefix) =>
    suffixes.some((suffix) => (prefix || suffix) && input === `${prefix}${target}${suffix}`)
  );
}

function inputCandidates(question: InputQuestion | ChoiceQuestion): string[] {
  return [question.answer, ...(question.acceptableAnswers ?? [])].filter((answer) => answer.trim().length > 0);
}

export const normalizeAnswer = normalize;

export function levenshtein(left: string, right: string): number {
  if (!left) return right.length;
  if (!right) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i += 1) {
    const current = new Array<number>(right.length + 1);
    current[0] = i + 1;
    for (let j = 0; j < right.length; j += 1) {
      const insertion = current[j] + 1;
      const deletion = previous[j + 1] + 1;
      const substitution = previous[j] + (left[i] === right[j] ? 0 : 1);
      current[j + 1] = Math.min(insertion, deletion, substitution);
    }
    previous = current;
  }
  return previous[right.length];
}

export function judgeInputAnswer(question: InputQuestion | ChoiceQuestion, rawInput: string): boolean {
  const input = stripJapaneseSentenceEdges(rawInput);
  const answers = inputCandidates(question).map(stripJapaneseSentenceEdges);

  if (!input) return false;
  if (answers.some((answer) => input === answer)) return true;

  return answers.some((answer) => {
    if (JAPANESE_TEXT.test(answer)) return isAcceptableJapaneseExpansion(normalize(rawInput), answer);
    return containsEnglishAnswer(input, answer);
  });
}

export function isNearMissAnswer(question: InputQuestion | ChoiceQuestion, rawInput: string): boolean {
  if (judgeInputAnswer(question, rawInput)) return false;
  const input = normalize(rawInput);
  if (!input) return false;
  const nearest = inputCandidates(question)
    .map((answer) => levenshtein(input, normalize(answer)))
    .reduce((min, distance) => Math.min(min, distance), Number.POSITIVE_INFINITY);
  return nearest <= 2;
}

export function judgeChoiceAnswer(question: ChoiceQuestion, choice: string): boolean {
  return judgeInputAnswer(question, choice);
}

export function judgeMultiSelectAnswer(question: MultiSelectQuestion, choices: string[]): boolean {
  const selected = [...new Set(choices.map(normalize))].sort();
  const correct = [...new Set(question.correctChoices.map(normalize))].sort();
  return selected.length === correct.length && selected.every((item, index) => item === correct[index]);
}

export function judgeQuestion(question: Question, answer: string | string[]): boolean {
  if (question.type === 'input') {
    return typeof answer === 'string' && judgeInputAnswer(question, answer);
  }
  if (question.type === 'choice') {
    return typeof answer === 'string' && judgeChoiceAnswer(question, answer);
  }
  return Array.isArray(answer) && judgeMultiSelectAnswer(question, answer);
}

export function getCorrectAnswer(question: Question): string | string[] {
  if (question.type === 'multi_select') return question.correctChoices;
  return question.answer;
}
