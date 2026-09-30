import { writeDebugLog } from '../debug/debugLog';
import { getCorrectAnswer, isNearMissAnswer, judgeQuestion } from '../core/answerJudge';
import { buildGeneratedChoiceOptions, type GeneratedChoiceOption } from '../core/choiceGenerator';
import type { AnswerFormat, Attempt, ChoiceQuestion, InputQuestion, Question } from '../core/models';
import { createIdleRevealController, type IdleRevealController } from '../core/idleRevealController';
import { scoreAttemptDelta } from '../core/reviewEngine';
import { advanceSession, currentQuestion, elapsedForCurrent, isSessionComplete, type QuizSession } from '../core/sessionEngine';
import { buildWrongAnswerFeedback } from '../core/wrongAnswerExplanation';
import { resolveActiveQuestionImageAsset, type QuestionImageAssetResolver } from '../packs/packAssetResolver';
import { persistAttemptAndReview } from '../services/quizPersistence';
import { db } from '../storage/db';
import { button, clear, el, toast } from '../ui/dom';
import { appendIconLabel } from '../ui/icons';
import { appendQuizResult, renderQuestionImage, renderQuizMeta, renderSessionSummary } from '../ui/inlineQuizView';

export interface InlineQuizCallbacks {
  onSessionChange(session: QuizSession): void;
  onSessionCheckpoint?(session: QuizSession): void;
  onComplete(): void;
}
export interface InlineQuizOptions {
  resolveImageAsset?: QuestionImageAssetResolver;
}

const DEFAULT_CHOICE_MODULE_IDS = new Set(['leap', 'leap_final']);
const AUTO_REVEAL_IDLE_MS = 10_000;
const renderCleanupByContainer = new WeakMap<HTMLElement, () => void>();
const renderTokenByContainer = new WeakMap<HTMLElement, symbol>();
function effectiveAnswerMode(
  question: Question,
  requested: AnswerFormat = 'auto',
  generatedChoices?: readonly GeneratedChoiceOption[]
): AnswerFormat {
  if (question.type === 'multi_select') return 'choice';
  if (requested === 'input') return 'input';
  if (question.type === 'choice') return 'choice';
  return generatedChoices?.length ? 'choice' : 'input';
}
function canJudgeNearMiss(question: Question): question is InputQuestion | ChoiceQuestion {
  return question.type === 'input' || question.type === 'choice';
}

function buildAttempt(
  question: Question,
  result: Attempt['result'],
  input: string | string[],
  elapsedMs: number,
  mode: 'normal' | 'review',
  answerMode: AnswerFormat,
  hiddenTimeExcludedMs: number,
  nearMiss = false
): Attempt {
  return {
    attemptId: `${Date.now()}-${crypto.randomUUID()}`,
    questionId: question.id,
    moduleId: question.moduleId,
    answeredAt: new Date().toISOString(),
    result,
    input,
    answer: getCorrectAnswer(question),
    elapsedMs,
    mode,
    nearMiss,
    hiddenTimeExcludedMs,
    priorityDelta: scoreAttemptDelta(result, nearMiss, elapsedMs, answerMode),
    answerMode,
    questionMode: question.activeStudyMode ?? 'as_stored'
  };
}

export function renderInlineQuiz(
  container: HTMLElement,
  session: QuizSession,
  callbacks: InlineQuizCallbacks,
  options: InlineQuizOptions = {}
): void {
  renderCleanupByContainer.get(container)?.();
  renderCleanupByContainer.delete(container);
  const renderToken = Symbol('inline-quiz-render');
  renderTokenByContainer.set(container, renderToken);
  clear(container);
  if (isSessionComplete(session)) {
    const done = el('div', 'quiz-card done');
    done.append(
      el('h3', '', 'セッション完了'),
      el('p', '', `${session.queue.length}問の学習が終わりました。`),
      renderSessionSummary(session)
    );
    const back = button('教材詳細に戻る', 'btn primary');
    back.onclick = callbacks.onComplete;
    done.append(back);
    container.append(done);
    return;
  }

  const question = currentQuestion(session);
  if (!question) return;
  const activeQuestion: Question = question;
  const requestedAnswerFormat = session.settings.answerFormat ?? 'auto';
  const shouldGenerateChoices =
    question.type === 'input' &&
    (requestedAnswerFormat === 'choice' || (requestedAnswerFormat === 'auto' && DEFAULT_CHOICE_MODULE_IDS.has(question.moduleId)));
  const generatedChoices =
    question.type === 'input' && shouldGenerateChoices
      ? buildGeneratedChoiceOptions(question, session.choicePool, 4, Math.random, session.choiceCandidateIndex)
      : undefined;
  const answerMode = effectiveAnswerMode(question, requestedAnswerFormat, generatedChoices);
  const card = el('section', 'quiz-card');
  const answerArea = el('div', 'answer-area');
  const controls = el('div', 'quiz-controls');
  const resultArea = el('div', 'result-area');
  let selectedAnswer: string | string[] = '';
  let answered = false;
  let moved = false;
  let pendingAttempt: Attempt | undefined;
  let nextButton: HTMLButtonElement | undefined;
  let hiddenStartedAt: number | undefined;
  let hiddenTimeExcludedMs = 0;
  let suspendedTimeExcludedMs = 0;
  let composing = false;
  let idleController: IdleRevealController | undefined;
  let persistenceInFlight = false;
  let persistenceComplete = false;

  function isCurrentRender(): boolean {
    return renderTokenByContainer.get(container) === renderToken && card.isConnected && container.contains(card);
  }

  function currentRenderExcludedMs(now = Date.now()): number {
    const activeHiddenMs = hiddenStartedAt === undefined ? 0 : Math.max(0, now - hiddenStartedAt);
    return hiddenTimeExcludedMs + suspendedTimeExcludedMs + activeHiddenMs;
  }

  function currentAnswerElapsedMs(now = Date.now()): number {
    return elapsedForCurrent(session, currentRenderExcludedMs(now));
  }

  function checkpointCurrentTiming(now = Date.now()): void {
    callbacks.onSessionCheckpoint?.({
      ...session,
      currentElapsedMs: currentAnswerElapsedMs(now),
      currentStartedAt: now,
      currentHiddenTimeExcludedMs: session.currentHiddenTimeExcludedMs + currentRenderExcludedMs(now)
    });
  }

  function cleanup(): void {
    idleController?.dispose();
    idleController = undefined;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
    if (renderTokenByContainer.get(container) === renderToken) {
      renderTokenByContainer.delete(container);
      renderCleanupByContainer.delete(container);
    }
  }

  function resetIdleReveal(): void {
    idleController?.reset();
  }

  function handleVisibilityChange(): void {
    if (answered || moved) return;
    const now = Date.now();
    if (document.hidden) {
      checkpointCurrentTiming(now);
      if (hiddenStartedAt === undefined) hiddenStartedAt = now;
      idleController?.setVisible(false);
      return;
    }
    if (hiddenStartedAt !== undefined) {
      hiddenTimeExcludedMs += Math.max(0, now - hiddenStartedAt);
      hiddenStartedAt = undefined;
    }
    idleController?.setVisible(true);
  }

  function handlePageHide(): void {
    if (!answered && !moved) checkpointCurrentTiming();
  }

  function lockAnswerControls(): void {
    answerArea.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach((control) => {
      if (control instanceof HTMLInputElement) control.readOnly = true;
      control.disabled = true;
    });
  }

  function nextQuestion(): void {
    if (moved || !persistenceComplete) return;
    moved = true;
    cleanup();
    callbacks.onSessionChange(advanceSession(session, pendingAttempt));
  }

  async function persistAttempt(attempt: Attempt): Promise<void> {
    if (persistenceInFlight || persistenceComplete) return;
    persistenceInFlight = true;
    resultArea.querySelector('.persistence-error')?.remove();
    try {
      await persistAttemptAndReview(attempt, db);
      persistenceComplete = true;
      try {
        callbacks.onSessionCheckpoint?.(advanceSession(session, attempt));
      } catch (error) {
        // IndexedDB has committed. A localStorage checkpoint failure must not
        // retry the answer transaction and apply the SRS rating twice.
        writeDebugLog({
          level: 'warn',
          area: 'quizPersistence',
          code: 'SESSION-CHECKPOINT-FAILED',
          userMessage: '再開位置を保存できませんでした。',
          detail: String(error)
        });
        toast('回答は保存済みですが、再開位置を保存できませんでした。');
      }
      if (nextButton) {
        nextButton.disabled = false;
        nextButton.hidden = false;
      }
      if (attempt.result === 'correct' && session.settings.autoNext) window.setTimeout(nextQuestion, 650);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error('Failed to persist answer/SRS state', error);
      writeDebugLog({
        level: 'error',
        area: 'quizPersistence',
        code: 'ANSWER-PERSIST-FAILED',
        userMessage: '回答の保存に失敗しました。',
        detail,
        stack: error instanceof Error ? error.stack : undefined,
        context: { attemptId: attempt.attemptId, questionId: attempt.questionId, moduleId: attempt.moduleId, result: attempt.result }
      });
      toast('回答の保存に失敗しました。再試行してください。');
      const errorBox = el('div', 'issue error persistence-error');
      errorBox.append(el('p', '', '回答を保存できませんでした。次へ進む前に再試行してください。'));
      const retry = button('保存を再試行', 'btn primary');
      retry.onclick = () => void persistAttempt(attempt);
      errorBox.append(retry);
      resultArea.append(errorBox);
    } finally {
      persistenceInFlight = false;
    }
  }

  function record(answer: string | string[], revealed = false, generatedChoice?: GeneratedChoiceOption): void {
    if (answered) return;
    answered = true;
    cleanup();
    lockAnswerControls();
    const elapsedMs = currentAnswerElapsedMs();
    const totalHiddenTimeExcludedMs = session.currentHiddenTimeExcludedMs + currentRenderExcludedMs();
    const nearMiss =
      !revealed && typeof answer === 'string' && canJudgeNearMiss(activeQuestion) ? isNearMissAnswer(activeQuestion, answer) : false;
    const result: Attempt['result'] = revealed ? 'revealed' : judgeQuestion(activeQuestion, answer) ? 'correct' : 'wrong';
    const attempt = buildAttempt(
      activeQuestion,
      result,
      revealed ? '' : answer,
      elapsedMs,
      session.mode,
      answerMode,
      totalHiddenTimeExcludedMs,
      nearMiss
    );
    pendingAttempt = attempt;

    const wrongExplanation =
      !revealed && result === 'wrong' && typeof answer === 'string'
        ? buildWrongAnswerFeedback(
            answerMode === 'input' ? 'input' : 'choice',
            answer,
            activeQuestion,
            session.choicePool.length ? session.choicePool : session.queue,
            session.wrongAnswerLookupIndex,
            generatedChoice?.origin
          )
        : undefined;
    appendQuizResult(resultArea, activeQuestion, result, elapsedMs, nearMiss, wrongExplanation);
    void persistAttempt(attempt);
  }

  const bookmark = button('', 'btn ghost bookmark-btn');
  let bookmarked = false;
  const renderBookmark = () => {
    const label = bookmarked ? 'ブックマーク済み' : 'ブックマーク';
    appendIconLabel(bookmark, 'bookmark', label);
    bookmark.setAttribute('aria-label', label);
    bookmark.classList.toggle('selected', bookmarked);
  };
  renderBookmark();
  void db.hasBookmark(question.id).then((enabled) => {
    bookmarked = enabled;
    renderBookmark();
  });
  bookmark.onclick = async () => {
    bookmarked = !bookmarked;
    await db.setBookmark(question.id, bookmarked);
    renderBookmark();
  };

  if (session.settings.showExample && question.example) answerArea.append(el('p', 'example-line', question.example));
  if (answerMode === 'input') {
    const input = el('input', 'text-input') as HTMLInputElement;
    input.placeholder = '答えを入力';
    let lastInputValue = input.value;
    input.addEventListener('input', () => {
      if (composing || input.value === lastInputValue) return;
      lastInputValue = input.value;
      resetIdleReveal();
    });
    input.addEventListener('paste', resetIdleReveal);
    input.addEventListener('compositionstart', () => {
      composing = true;
      idleController?.setComposing(true);
    });
    input.addEventListener('compositionend', () => {
      composing = false;
      lastInputValue = input.value;
      idleController?.setComposing(false);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (composing || event.isComposing) return;
      event.preventDefault();
      record(input.value);
    });
    const submit = button('回答する', 'btn primary');
    submit.onclick = () => record(input.value);
    answerArea.append(input, submit);
    window.setTimeout(() => input.focus(), 0);
  } else if (question.type === 'choice' || generatedChoices) {
    const list = el('div', 'choice-list');
    if (question.type === 'choice') {
      for (const choice of question.choices) {
        const choiceButton = button(choice, 'choice-btn');
        choiceButton.onclick = () => {
          selectedAnswer = choice;
          record(choice);
        };
        list.append(choiceButton);
      }
    } else {
      for (const choice of generatedChoices ?? []) {
        const choiceButton = button(choice.text, 'choice-btn');
        choiceButton.onclick = () => {
          selectedAnswer = choice.text;
          record(choice.text, false, choice);
        };
        list.append(choiceButton);
      }
    }
    answerArea.append(list);
  } else if (question.type === 'multi_select') {
    const selected = new Set<string>();
    const list = el('div', 'choice-list');
    for (const choice of question.choices) {
      const choiceButton = button(choice, 'choice-btn');
      choiceButton.setAttribute('aria-pressed', 'false');
      choiceButton.onclick = () => {
        if (selected.has(choice)) selected.delete(choice);
        else selected.add(choice);
        const selectedNow = selected.has(choice);
        choiceButton.classList.toggle('selected', selectedNow);
        choiceButton.setAttribute('aria-pressed', selectedNow ? 'true' : 'false');
        selectedAnswer = [...selected];
        resetIdleReveal();
      };
      list.append(choiceButton);
    }
    const submit = button('選択を確定', 'btn primary');
    submit.onclick = () => record([...selected]);
    answerArea.append(list, submit);
  }

  const hintText = question.example ?? question.explanation;
  const hint = button('', 'btn ghost');
  appendIconLabel(hint, 'hint', 'ヒント');
  hint.setAttribute('aria-label', 'ヒント');
  hint.disabled = !hintText;
  hint.onclick = () => {
    if (!hintText || resultArea.querySelector('.hint-panel')) return;
    resultArea.prepend(el('p', 'hint-panel', hintText));
    resetIdleReveal();
  };
  const reveal = button('', 'btn ghost');
  appendIconLabel(reveal, 'eye', '答えを見る');
  reveal.setAttribute('aria-label', '答えを見る');
  reveal.onclick = () => record(selectedAnswer, true);

  const tools = el('div', 'v2-quiz-tools');
  tools.append(bookmark, hint, reveal);

  const next = button('', 'btn prototype-next-ready');
  appendIconLabel(next, 'arrowRight', '次へ', 'end');
  next.disabled = true;
  next.hidden = true;
  next.onclick = nextQuestion;
  nextButton = next;
  controls.classList.add('quiz-next-controls');
  controls.append(next);

  card.append(renderQuizMeta(session, question), tools, el('h3', 'question-prompt', question.prompt));
  const image = renderQuestionImage(question, options.resolveImageAsset ?? resolveActiveQuestionImageAsset);
  if (image) card.append(image);
  card.append(answerArea, controls, resultArea);
  container.append(card);
  window.requestAnimationFrame(() => {
    container.scrollIntoView?.({ block: 'start', inline: 'nearest', behavior: 'auto' });
  });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  renderCleanupByContainer.set(container, cleanup);
  if (session.settings.autoRevealAfterIdle) {
    idleController = createIdleRevealController({
      timeoutMs: AUTO_REVEAL_IDLE_MS,
      isEligible: () => !answered && !moved && isCurrentRender(),
      onSuspend: (elapsed) => {
        suspendedTimeExcludedMs += elapsed;
        checkpointCurrentTiming();
      },
      onReveal: () => record(selectedAnswer, true)
    });
    idleController.setVisible(!document.hidden);

    idleController.start();
  }
}
