import { normalizeAnswer } from './answerJudge';
import type { InputQuestion, Question } from './models';

type RandomSource = () => number;

function shuffle<T>(items: T[], random: RandomSource): T[] {
  const copied = [...items];
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copied[index], copied[target]] = [copied[target], copied[index]];
  }
  return copied;
}

function candidateAnswer(question: Question): string | undefined {
  if (question.type === 'multi_select') return undefined;
  const answer = question.answer.trim();
  return answer || undefined;
}

export function buildGeneratedChoices(
  question: InputQuestion,
  pool: Question[],
  optionCount = 4,
  random: RandomSource = Math.random
): string[] | undefined {
  if (optionCount < 2) return undefined;

  const correct = question.answer.trim();
  if (!correct) return undefined;

  const accepted = new Set([question.answer, ...(question.acceptableAnswers ?? [])].map(normalizeAnswer));
  const seen = new Set(accepted);
  const distractors: string[] = [];
  const candidates = pool
    .filter((candidate) => candidate.id !== question.id)
    .map((candidate) => ({
      answer: candidateAnswer(candidate),
      priority: candidate.moduleId === question.moduleId ? (candidate.category === question.category ? 0 : 1) : 2
    }))
    .filter((candidate): candidate is { answer: string; priority: number } => Boolean(candidate.answer));

  for (const priority of [0, 1, 2]) {
    for (const candidate of shuffle(candidates.filter((item) => item.priority === priority), random)) {
      const normalized = normalizeAnswer(candidate.answer);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      distractors.push(candidate.answer);
      if (distractors.length === optionCount - 1) return shuffle([correct, ...distractors], random);
    }
  }

  return undefined;
}
