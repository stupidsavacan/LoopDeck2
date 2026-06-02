import type { ChoiceQuestion, InputQuestion, MultiSelectQuestion, Question } from './models';

const normalize = (value: string): string =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const stripJapaneseSentenceEdges = (value: string): string =>
  normalize(value)
    .replace(/^答え(は|が)?/, '')
    .replace(/^(正解|回答)(は|が)?/, '')
    .replace(/(です|である|だ|。|\.)$/g, '')
    .trim();

export const normalizeAnswer = normalize;

export function judgeInputAnswer(question: InputQuestion, rawInput: string): boolean {
  const input = stripJapaneseSentenceEdges(rawInput);
  const answers = [question.answer, ...(question.acceptableAnswers ?? [])].map(stripJapaneseSentenceEdges);

  if (!input) return false;
  if (answers.some((answer) => input === answer)) return true;

  // Accept natural longer answers only when the full correct answer appears inside the sentence.
  // Do not accept partial fragments like 「徳川」 for 「徳川家康」.
  return answers.some((answer) => answer.length >= 2 && input.includes(answer));
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
