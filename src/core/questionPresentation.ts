import type { ConcreteStudyQuestionMode, InputQuestion, Question, StudyQuestionMode } from './models';

const CONCRETE_MODES: ConcreteStudyQuestionMode[] = ['front_to_back', 'back_to_front'];

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function labelOrFallback(question: Question | undefined, side: 'front' | 'back', fallback: string): string {
  const label = question?.sides?.[side]?.label?.trim();
  return label || fallback;
}

export function hasTwoSidedStudyData(question: Question): boolean {
  return Boolean(question.sides && nonEmpty(question.sides.front?.text) && nonEmpty(question.sides.back?.text));
}

export function getSupportedStudyQuestionModes(question: Question): ConcreteStudyQuestionMode[] {
  const modes: ConcreteStudyQuestionMode[] = ['as_stored'];
  if (!hasTwoSidedStudyData(question)) return modes;

  const supported = new Set(question.supportedStudyModes ?? []);
  if (supported.has('front_to_back')) modes.push('front_to_back');
  if (supported.has('back_to_front')) modes.push('back_to_front');
  return modes;
}

export function getModuleStudyQuestionModes(questions: Question[]): StudyQuestionMode[] {
  const modes: StudyQuestionMode[] = ['as_stored'];
  const supported = new Set<ConcreteStudyQuestionMode>();

  for (const question of questions) {
    for (const mode of getSupportedStudyQuestionModes(question)) {
      if (mode !== 'as_stored') supported.add(mode);
    }
  }

  if (supported.has('front_to_back')) modes.push('front_to_back');
  if (supported.has('back_to_front')) modes.push('back_to_front');
  if (supported.has('front_to_back') && supported.has('back_to_front')) modes.push('mixed');
  return modes;
}

export function getStudyQuestionModeLabel(mode: StudyQuestionMode, sampleQuestion?: Question): string {
  if (mode === 'as_stored') return '通常';
  if (mode === 'mixed') return '両方まぜる';

  const front = labelOrFallback(sampleQuestion, 'front', '表');
  const back = labelOrFallback(sampleQuestion, 'back', '裏');
  return mode === 'front_to_back' ? `${front} → ${back}` : `${back} → ${front}`;
}

export function resolveConcreteStudyQuestionMode(
  question: Question,
  requestedMode: StudyQuestionMode,
  random: () => number = Math.random
): ConcreteStudyQuestionMode {
  if (requestedMode === 'as_stored') return 'as_stored';

  const supported = getSupportedStudyQuestionModes(question);
  if (requestedMode !== 'mixed') return supported.includes(requestedMode) ? requestedMode : 'as_stored';

  const choices = CONCRETE_MODES.filter((mode) => supported.includes(mode));
  if (!choices.length) return 'as_stored';
  const index = Math.min(choices.length - 1, Math.floor(random() * choices.length));
  return choices[index]!;
}

function cloneAsStored(question: Question): Question {
  return { ...question, activeStudyMode: 'as_stored' };
}

function usableAnswers(answers: string[] | undefined): string[] | undefined {
  const values = (answers ?? []).filter((answer) => answer.trim().length > 0);
  return values.length ? values : undefined;
}

export function presentQuestionForStudy(question: Question, mode: ConcreteStudyQuestionMode): Question {
  if (mode === 'as_stored' || question.type !== 'input' || !hasTwoSidedStudyData(question)) return cloneAsStored(question);
  if (!getSupportedStudyQuestionModes(question).includes(mode)) return cloneAsStored(question);

  const source = mode === 'front_to_back' ? question.sides.front : question.sides.back;
  const target = mode === 'front_to_back' ? question.sides.back : question.sides.front;

  return {
    ...question,
    prompt: source.text,
    answer: target.text,
    acceptableAnswers: usableAnswers(target.acceptableAnswers),
    activeStudyMode: mode
  } satisfies InputQuestion;
}
