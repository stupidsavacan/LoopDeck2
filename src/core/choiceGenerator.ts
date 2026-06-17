import { getAcceptedAnswers, normalizeAnswer } from './answerJudge';
import type { ConcreteStudyQuestionMode, InputQuestion, Question } from './models';
import { presentQuestionForStudy } from './questionPresentation';

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

function uniqueAnswers(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = normalizeAnswer(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(trimmed);
  }
  return result;
}

export function getManualChoiceCandidates(question: Question): string[] | undefined {
  if (question.type === 'multi_select') return undefined;
  const mode = question.activeStudyMode;
  const manual =
    mode === 'front_to_back' || mode === 'back_to_front'
      ? question.sideChoiceCandidates?.[mode] ?? question.choiceCandidates
      : question.choiceCandidates;
  if (!manual || manual.mode !== 'manual') return undefined;

  const choices = uniqueAnswers(manual.choices);
  const accepted = new Set(getAcceptedAnswers(question).map(normalizeAnswer));
  const correct = normalizeAnswer(question.answer);
  if (!choices.some((choice) => normalizeAnswer(choice) === correct)) return undefined;

  const wrongChoices = choices.filter((choice) => {
    const normalized = normalizeAnswer(choice);
    return normalized === correct || !accepted.has(normalized);
  });

  if (wrongChoices.length < 4) return undefined;
  return wrongChoices;
}

function presentCandidateForMode(candidate: Question, mode: ConcreteStudyQuestionMode): Question | undefined {
  if (mode === 'as_stored') return candidate;
  const presented = presentQuestionForStudy(candidate, mode);
  return presented.activeStudyMode === mode ? presented : undefined;
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

  const manualChoices = getManualChoiceCandidates(question);
  if (manualChoices) {
    const correctKey = normalizeAnswer(correct);
    const distractors = manualChoices.filter((choice) => normalizeAnswer(choice) !== correctKey);
    if (distractors.length >= optionCount - 1) {
      return shuffle([correct, ...shuffle(distractors, random).slice(0, optionCount - 1)], random);
    }
  }

  const activeMode = question.activeStudyMode ?? 'as_stored';
  const accepted = new Set(getAcceptedAnswers(question).map(normalizeAnswer));
  const seen = new Set(accepted);
  const distractors: string[] = [];
  const candidates = pool
    .filter((candidate) => candidate.id !== question.id)
    .map((candidate) => {
      const presented = presentCandidateForMode(candidate, activeMode);
      return {
        answer: presented ? candidateAnswer(presented) : undefined,
        priority: candidate.moduleId === question.moduleId ? (candidate.category === question.category ? 0 : 1) : 2
      };
    })
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
