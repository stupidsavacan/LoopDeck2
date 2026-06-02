import type { ChoiceQuestion, InputQuestion, MultiSelectQuestion, Question } from './models';

const EDGE_PUNCTUATION = /^[\s"'`「」『』（）()【】\[\]。．.!！?？,，、:：;；]+|[\s"'`「」『』（）()【】\[\]。．.!！?？,，、:：;；]+$/g;
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

function containsFullAnswer(input: string, answer: string): boolean {
  if (answer.length < 2) return false;
  if (JAPANESE_TEXT.test(answer)) return input.includes(answer);

  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(input);
}

export const normalizeAnswer = normalize;

export function judgeInputAnswer(question: InputQuestion, rawInput: string): boolean {
  const input = stripJapaneseSentenceEdges(rawInput);
  const answers = [question.answer, ...(question.acceptableAnswers ?? [])].map(stripJapaneseSentenceEdges);

  if (!input) return false;
  if (answers.some((answer) => input === answer)) return true;

  // Longer natural answers are accepted only when they contain the complete answer.
  return answers.some((answer) => containsFullAnswer(input, answer));
}

export function judgeChoiceAnswer(question: ChoiceQuestion, choice: string): boolean {
  return normalize(choice) === normalize(question.answer);
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
