import { getCorrectAnswer, isNearMissAnswer, judgeQuestion } from '../core/answerJudge';
import { buildGeneratedChoices } from '../core/choiceGenerator';
import type { AnswerFormat, Attempt, InputQuestion, Question } from '../core/models';
import { presentQuestionForStudy } from '../core/questionPresentation';
import { scoreAttemptDelta } from '../core/reviewEngine';
import type { LearningRepository } from '../data/learningRepository';
import type { PackGateway } from '../data/packGateway';
import type { FlowSessionRecord, PlayerState } from './models';
import { IdleRevealClock } from './sessionPolicy';

const DEFAULT_CHOICE_MODULE_IDS = new Set(['leap', 'leap_final']);

export interface QuestionPresentation {
  question: Question;
  answerFormat: 'input' | 'choice';
  choices: string[];
}

export class PlayerController {
  private busy = false;
  private questionStartedAt = Date.now();
  private clock?: IdleRevealClock;
  private generation = 0;
  private feedbackAttempt?: Attempt;

  constructor(
    private session: FlowSessionRecord,
    private readonly packs: PackGateway,
    private readonly learning: LearningRepository
  ) {}

  get record(): FlowSessionRecord { return this.session; }
  get questionPool(): Question[] { return this.packs.questions; }
  resolveQuestionImage(question: Question): Promise<string | undefined> { return this.packs.resolveQuestionImage(question); }

  get currentEntry() { return this.session.entries[this.session.index]; }

  presentation(): QuestionPresentation | undefined {
    const entry = this.currentEntry;
    const raw = entry ? this.packs.getQuestion(entry.questionId) : undefined;
    if (!raw) return undefined;
    const question = presentQuestionForStudy(raw, entry.questionMode);
    if (question.type === 'multi_select') return { question, answerFormat: 'choice', choices: question.choices };
    if (question.type === 'choice') return { question, answerFormat: 'choice', choices: question.choices };
    const shouldGenerate = entry.answerFormat === 'choice' || (entry.answerFormat === 'auto' && DEFAULT_CHOICE_MODULE_IDS.has(question.moduleId));
    const choices = shouldGenerate ? buildGeneratedChoices(question, this.packs.questions) ?? [] : [];
    return { question, answerFormat: choices.length ? 'choice' : 'input', choices };
  }

  state(): PlayerState {
    if (this.session.phase === 'complete' || this.session.status === 'completed') return { tag: 'complete', session: this.session };
    if (this.session.phase === 'checkpoint') return { tag: 'checkpoint', session: this.session };
    const entry = this.currentEntry;
    if (!entry) return { tag: 'error', code: 'FLOW-QUESTION-MISSING', message: 'このセッションの問題が見つかりません。', recoverable: true };
    if (this.session.phase === 'feedback' && this.feedbackAttempt) return { tag: 'feedback', session: this.session, entry, attempt: this.feedbackAttempt };
    return { tag: 'question', session: this.session, entry, draft: this.session.draftInput ?? '', selectedChoices: this.session.selectedChoices, idleState: this.clock?.state ?? { kind: 'disabled' } };
  }

  async activate(): Promise<void> {
    if (this.session.phase === 'feedback' && this.session.currentAttemptId) {
      this.feedbackAttempt = (await this.learning.readAll()).attempts.find((attempt) => attempt.attemptId === this.session.currentAttemptId);
    }
    this.session = { ...this.session, status: 'active' };
    this.questionStartedAt = Date.now();
    await this.learning.putSession(this.session);
  }

  startIdle(onExpired: (state: PlayerState) => void): void {
    this.stopIdle();
    if (!this.session.settings.autoRevealAfterIdle || this.session.phase !== 'question') return;
    const generation = this.generation;
    this.clock = new IdleRevealClock(() => {
      if (generation !== this.generation) return;
      void this.submit('', true).then(onExpired);
    });
    this.clock.start();
  }

  resetIdle(): void { this.clock?.reset(); }
  pauseIdle(reason: 'hidden' | 'composition'): void { this.clock?.pause(reason); }
  resumeIdle(reason: 'hidden' | 'composition', reset = false): void { this.clock?.resume(reason, reset); }
  stopIdle(): void { this.generation += 1; this.clock?.stop(); this.clock = undefined; }

  async updateDraft(draft: string, selectedChoices = this.session.selectedChoices): Promise<void> {
    this.session = { ...this.session, draftInput: draft, selectedChoices: [...selectedChoices] };
    await this.learning.putSession(this.session);
  }

  async submit(answer: string | string[], revealed = false): Promise<PlayerState> {
    if (this.busy) return this.state();
    const presentation = this.presentation();
    const entry = this.currentEntry;
    if (!presentation || !entry) return { tag: 'error', code: 'FLOW-QUESTION-MISSING', message: '問題データを解決できません。', recoverable: true };
    this.busy = true;
    this.stopIdle();
    const elapsedMs = Math.max(0, Date.now() - this.questionStartedAt);
    const nearMiss = !revealed && typeof answer === 'string' && presentation.question.type !== 'multi_select'
      ? isNearMissAnswer(presentation.question as InputQuestion, answer)
      : false;
    const result: Attempt['result'] = revealed ? 'revealed' : judgeQuestion(presentation.question, answer) ? 'correct' : 'wrong';
    const answerFormat: AnswerFormat = presentation.answerFormat;
    const attempt: Attempt = {
      attemptId: `${Date.now()}-${crypto.randomUUID()}`,
      questionId: presentation.question.id,
      moduleId: presentation.question.moduleId,
      answeredAt: new Date().toISOString(),
      result,
      input: revealed ? '' : answer,
      answer: getCorrectAnswer(presentation.question),
      elapsedMs,
      mode: entry.primaryReason === 'due' || entry.primaryReason === 'weak' ? 'review' : 'normal',
      nearMiss,
      hiddenTimeExcludedMs: 0,
      priorityDelta: scoreAttemptDelta(result, nearMiss, elapsedMs, answerFormat),
      answerMode: answerFormat,
      questionMode: entry.questionMode
    };
    try {
      await this.learning.saveAttemptAndReview(attempt);
      this.session = {
        ...this.session,
        phase: 'feedback',
        currentAttemptId: attempt.attemptId,
        draftInput: undefined,
        selectedChoices: [],
        completedAttemptIds: [...this.session.completedAttemptIds, attempt.attemptId]
      };
      this.feedbackAttempt = attempt;
      await this.learning.putSession(this.session);
      return { tag: 'feedback', session: this.session, entry, attempt };
    } catch (error) {
      return { tag: 'error', code: 'FLOW-PERSISTENCE', message: error instanceof Error ? error.message : String(error), recoverable: true };
    } finally {
      this.busy = false;
    }
  }

  async next(): Promise<PlayerState> {
    this.stopIdle();
    const nextIndex = this.session.index + 1;
    if (nextIndex >= this.session.entries.length) {
      this.session = { ...this.session, index: nextIndex, phase: 'complete', status: 'completed', currentAttemptId: undefined };
    } else if (nextIndex % this.session.checkpointEvery === 0) {
      this.session = { ...this.session, index: nextIndex, phase: 'checkpoint', currentAttemptId: undefined };
    } else {
      this.session = { ...this.session, index: nextIndex, phase: 'question', currentAttemptId: undefined };
    }
    this.feedbackAttempt = undefined;
    this.questionStartedAt = Date.now();
    await this.learning.putSession(this.session);
    return this.state();
  }

  async continueFromCheckpoint(): Promise<PlayerState> {
    this.session = { ...this.session, phase: 'question', status: 'active' };
    this.questionStartedAt = Date.now();
    await this.learning.putSession(this.session);
    return this.state();
  }

  async pause(): Promise<void> {
    this.stopIdle();
    this.session = { ...this.session, status: 'paused' };
    await this.learning.putSession(this.session);
  }
}
