import type { AnswerJudgingRule, ChoiceQuestion, InputQuestion, MultiSelectQuestion, Question } from './models';

const JAPANESE_TEXT = /[\u3040-\u30ff\u3400-\u9fff]/;
const EDGE_CHARS = new Set([
  ' ', '\t', '\n', '\r', '"', "'", '`', '「', '」', '『', '』', '（', '）', '(', ')', '【', '】', '[', ']',
  '。', '．', '.', '!', '！', '?', '？', ',', '，', '、', ':', '：', ';', '；'
]);
const JAPANESE_PREFIXES = ['答えは', '答えが', '答え', '正解は', '正解が', '回答は', '回答が'];
const JAPANESE_SUFFIXES = ['です', 'である', 'だ'];

function trimEdgeChars(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && EDGE_CHARS.has(value[start])) start += 1;
  while (end > start && EDGE_CHARS.has(value[end - 1])) end -= 1;
  return value.slice(start, end);
}

function compactSpaces(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(' ');
}

const normalize = (value: string): string => trimEdgeChars(compactSpaces(value.normalize('NFKC').trim())).toLowerCase();

function stripJapaneseSentenceEdges(value: string): string {
  let normalized = normalize(value);
  for (const prefix of JAPANESE_PREFIXES) {
    if (normalized.startsWith(prefix)) normalized = normalized.slice(prefix.length);
  }
  for (const suffix of JAPANESE_SUFFIXES) {
    if (normalized.endsWith(suffix)) normalized = normalized.slice(0, -suffix.length);
  }
  return trimEdgeChars(normalized).trim();
}

function isAsciiAlphaNumeric(char: string): boolean {
  const code = char.toLowerCase().charCodeAt(0);
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function englishTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of value) {
    if (isAsciiAlphaNumeric(char)) current += char;
    else if (current) {
      tokens.push(current);
      current = '';
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function containsEnglishAnswer(input: string, answer: string, caseSensitive = false): boolean {
  if (answer.length < 2) return false;
  const target = caseSensitive ? answer : answer.toLowerCase();
  return englishTokens(input).some((token) => (caseSensitive ? token : token.toLowerCase()) === target);
}

function isAcceptableJapaneseExpansion(input: string, target: string): boolean {
  if (!JAPANESE_TEXT.test(target) || target.length < 2 || input.length <= target.length) return false;
  const prefixes = ['', '答えは', '答えが', '正解は', '正解が', '回答は', '回答が'];
  const suffixes = ['', 'です', 'だ', 'である'];
  return prefixes.some((prefix) =>
    suffixes.some((suffix) => (prefix || suffix) && input === `${prefix}${target}${suffix}`)
  );
}

function removePunctuation(value: string): string {
  return Array.from(value).filter((char) => !EDGE_CHARS.has(char)).join('');
}

function normalizeForRule(value: string, rule: AnswerJudgingRule = {}): string {
  let normalized = value.normalize('NFKC').trim();
  if (rule.allowJapaneseSentenceEdges) normalized = stripJapaneseSentenceEdges(normalized);
  else normalized = trimEdgeChars(compactSpaces(normalized));
  if (rule.ignorePunctuation) normalized = removePunctuation(normalized);
  if (rule.ignoreSpaces) normalized = normalized.split(/\s+/).join('');
  if (!rule.caseSensitive) normalized = normalized.toLowerCase();
  return normalized.trim();
}

export const normalizeAnswer = normalize;

export function getAcceptedAnswers(question: InputQuestion | ChoiceQuestion): string[] {
  const base = question.acceptedAnswers?.length
    ? question.acceptedAnswers
    : [question.answer, ...(question.acceptableAnswers ?? [])];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of [question.answer, ...base]) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeAnswer(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function inputCandidates(question: InputQuestion | ChoiceQuestion): string[] {
  return getAcceptedAnswers(question);
}

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

export function judgeAnswerWithRule(question: InputQuestion | ChoiceQuestion, rawInput: string): boolean {
  const rule = question.answerJudging ?? {};
  const mode = rule.mode ?? 'single';
  const acceptedAnswers = getAcceptedAnswers(question);
  const normalizedInput = normalizeForRule(rawInput, {
    allowJapaneseSentenceEdges: rule.allowJapaneseSentenceEdges ?? mode !== 'exact_phrase',
    ...rule
  });

  if (!normalizedInput) return false;

  if (mode === 'all_of') {
    const requiredParts = rule.requiredParts?.map((part) => normalizeForRule(part, rule)).filter(Boolean) ?? [];
    if (requiredParts.length) return requiredParts.every((part) => normalizedInput.includes(part));
  }

  const normalizedAnswers = acceptedAnswers.map((answer) => normalizeForRule(answer, rule));
  if (normalizedAnswers.some((answer) => normalizedInput === answer)) return true;

  if (mode === 'exact_phrase' || rule.caseSensitive || mode === 'numeric') return false;

  if (mode === 'single' || mode === 'any_of') {
    const legacyInput = stripJapaneseSentenceEdges(rawInput);
    return acceptedAnswers.some((answer) => {
      const legacyAnswer = stripJapaneseSentenceEdges(answer);
      if (!legacyAnswer) return false;
      if (JAPANESE_TEXT.test(legacyAnswer)) return isAcceptableJapaneseExpansion(normalize(rawInput), legacyAnswer);
      return containsEnglishAnswer(legacyInput, legacyAnswer, rule.caseSensitive);
    });
  }

  return false;
}

export function judgeInputAnswer(question: InputQuestion | ChoiceQuestion, rawInput: string): boolean {
  return judgeAnswerWithRule(question, rawInput);
}

export function isNearMissAnswer(question: InputQuestion | ChoiceQuestion, rawInput: string): boolean {
  if (judgeInputAnswer(question, rawInput)) return false;
  const input = normalize(rawInput);
  if (!input) return false;

  return inputCandidates(question).some((candidate) => {
    const answer = normalize(candidate);
    const longestLength = Math.max(input.length, answer.length);
    if (longestLength <= 1) return false;
    const maximumDistance = longestLength >= 5 ? 2 : 1;
    return levenshtein(input, answer) <= maximumDistance;
  });
}

export function judgeChoiceAnswer(question: ChoiceQuestion, choice: string): boolean {
  return judgeAnswerWithRule(question, choice);
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
