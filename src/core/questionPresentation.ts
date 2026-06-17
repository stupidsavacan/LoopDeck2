import type { ConcreteStudyQuestionMode, InputQuestion, Question, StudyQuestionMode } from './models';

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function cloneAsStored<T extends Question>(question: T): T {
  return { ...question, activeStudyMode: 'as_stored' };
}

export function hasTwoSidedStudyData(question: Question): boolean {
  return Boolean(
    question.sides &&
      nonEmpty(question.sides.front?.text) &&
      nonEmpty(question.sides.back?.text)
  );
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
    for (const mode of getSupportedStudyQuestionModes(question)) supported.add(mode);
  }
  if (supported.has('front_to_back')) modes.push('front_to_back');
  if (supported.has('back_to_front')) modes.push('back_to_front');
  if (supported.has('front_to_back') && supported.has('back_to_front')) modes.push('mixed');
  return modes;
}

export function getStudyQuestionModeLabel(mode: StudyQuestionMode, sampleQuestion?: Question): string {
  if (mode === 'as_stored') return '通常';
  if (mode === 'mixed') return '両方まぜる';
  const front = sampleQuestion?.sides?.front?.label?.trim() || '表';
  const back = sampleQuestion?.sides?.back?.label?.trim() || '裏';
  return mode === 'front_to_back' ? `${front} → ${back}` : `${back} → ${front}`;
}

export function resolveConcreteStudyQuestionMode(
  question: Question,
  requestedMode: StudyQuestionMode,
  random: () => number = Math.random
): ConcreteStudyQuestionMode {
  if (requestedMode === 'as_stored') return 'as_stored';
  const supported = getSupportedStudyQuestionModes(question);
  if (requestedMode === 'front_to_back') return supported.includes('front_to_back') ? 'front_to_back' : 'as_stored';
  if (requestedMode === 'back_to_front') return supported.includes('back_to_front') ? 'back_to_front' : 'as_stored';

  const concrete = supported.filter((mode): mode is 'front_to_back' | 'back_to_front' => mode !== 'as_stored');
  if (!concrete.length) return 'as_stored';
  return concrete[Math.floor(random() * concrete.length)] ?? concrete[0];
}

function sideAnswers(question: InputQuestion, mode: 'front_to_back' | 'back_to_front'): string[] {
  const side = mode === 'front_to_back' ? question.sides?.back : question.sides?.front;
  const answers = side?.acceptableAnswers?.filter((answer) => answer.trim().length > 0) ?? [];
  if (side?.text && !answers.some((answer) => answer.trim() === side.text.trim())) return [side.text, ...answers];
  return answers.length ? answers : side?.text ? [side.text] : [];
}

export function presentQuestionForStudy(
  question: Question,
  mode: ConcreteStudyQuestionMode
): Question {
  if (mode === 'as_stored' || question.type !== 'input' || !hasTwoSidedStudyData(question)) {
    return cloneAsStored(question);
  }

  if (!getSupportedStudyQuestionModes(question).includes(mode) || !question.sides) return cloneAsStored(question);

  const { sides } = question;
  const promptSide = mode === 'front_to_back' ? sides.front : sides.back;
  const answerSide = mode === 'front_to_back' ? sides.back : sides.front;
  const acceptedAnswers = sideAnswers(question, mode);
  const sideChoiceCandidates = question.sideChoiceCandidates?.[mode];

  return {
    ...question,
    prompt: promptSide.text,
    answer: answerSide.text,
    acceptableAnswers: answerSide.acceptableAnswers ?? [],
    acceptedAnswers: acceptedAnswers.length ? acceptedAnswers : [answerSide.text],
    answerJudging: {
      ...question.answerJudging,
      mode: 'any_of'
    },
    choiceCandidates: sideChoiceCandidates ?? question.choiceCandidates,
    activeStudyMode: mode
  };
}
