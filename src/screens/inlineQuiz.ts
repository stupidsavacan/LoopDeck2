import { getCorrectAnswer, isNearMissAnswer, judgeQuestion } from '../core/answerJudge';
import { buildGeneratedChoices } from '../core/choiceGenerator';
import type { AnswerFormat, Attempt, ChoiceQuestion, InputQuestion, Question } from '../core/models';
import { scoreAttemptDelta } from '../core/reviewEngine';
import { applyReviewRating, createReviewCard, inferReviewRating } from '../core/scheduler';
import { advanceSession, currentQuestion, elapsedForCurrent, isSessionComplete, type QuizSession } from '../core/sessionEngine';
import { buildWrongAnswerExplanation, type WrongAnswerExplanation } from '../core/wrongAnswerExplanation';
import { isSafeImageAssetRef, isSafeImageDataUrl } from '../packs/assetSafety';
import { resolveActiveQuestionImageAsset, type QuestionImageAssetResolver } from '../packs/packAssetResolver';
import { db } from '../storage/db';
import { button, clear, el } from '../ui/dom';

export interface InlineQuizCallbacks { onSessionChange(session: QuizSession): void; onComplete(): void; }
export interface InlineQuizOptions { resolveImageAsset?: QuestionImageAssetResolver; }

const DEFAULT_CHOICE_MODULE_IDS = new Set(['leap', 'leap_final']);
const AUTO_REVEAL_IDLE_MS = 10_000;
const IDLE_CLOCK_TICK_MS = 250;
const IDLE_CLOCK_SUSPEND_GAP_MS = 1_000;
const renderCleanupByContainer = new WeakMap<HTMLElement, () => void>();
const renderTokenByContainer = new WeakMap<HTMLElement, symbol>();
// English: The image reference is preserved, but the image file could not be found.
const IMAGE_MISSING_MESSAGE = '画像参照は保持されていますが、画像ファイルが見つかりません。';
// English: The image reference is preserved. Display was skipped because the reference is unsafe.
const IMAGE_UNSAFE_MESSAGE = '画像参照は保持されています。表示は未実装または安全でない参照のためスキップしました。';
// English: The image reference is preserved. The image file cannot be displayed yet.
const IMAGE_LOAD_ERROR_MESSAGE = '画像参照は保持されています。画像ファイルはまだ表示できません。';

function answerToText(answer: string | string[]): string { return Array.isArray(answer) ? answer.join(' / ') : answer; }
function effectiveAnswerMode(question: Question, requested: AnswerFormat = 'auto', generatedChoices?: string[]): AnswerFormat {
  if (question.type === 'multi_select') return 'choice';
  if (requested === 'input') return 'input';
  if (question.type === 'choice') return 'choice';
  return generatedChoices?.length ? 'choice' : 'input';
}
function canJudgeNearMiss(question: Question): question is InputQuestion | ChoiceQuestion { return question.type === 'input' || question.type === 'choice'; }

function buildAttempt(question: Question, result: Attempt['result'], input: string | string[], elapsedMs: number, mode: 'normal' | 'review', answerMode: AnswerFormat, nearMiss = false): Attempt {
  return {
    attemptId: `${Date.now()}-${crypto.randomUUID()}`, questionId: question.id, moduleId: question.moduleId, answeredAt: new Date().toISOString(), result, input,
    answer: getCorrectAnswer(question), elapsedMs, mode, nearMiss, hiddenTimeExcludedMs: 0, priorityDelta: scoreAttemptDelta(result, nearMiss, elapsedMs, answerMode), answerMode
  };
}

function wrongAnswerLabel(source: WrongAnswerExplanation['source']): string {
  return source === 'choice' ? '選んだ答えの解説' : '入力した答えの解説';
}

function wrongAnswerFallback(source: WrongAnswerExplanation['source']): string {
  return source === 'choice'
    ? 'この選択肢は、この問題の答えではありません。'
    : '入力した答えは、この問題の答えではありません。';
}

function appendExplanation(container: HTMLElement, className: string, label: string, text: string): void {
  const node = el('p', `explanation ${className}`);
  node.append(el('strong', '', `${label}：`), document.createTextNode(text));
  container.append(node);
}

function appendWrongAnswerExplanation(container: HTMLElement, explanation: WrongAnswerExplanation | undefined): void {
  if (!explanation) return;
  const label = wrongAnswerLabel(explanation.source);
  if (!explanation.found) {
    appendExplanation(container, 'wrong-answer-explanation', label, wrongAnswerFallback(explanation.source));
    return;
  }

  const matched = explanation.matchedAnswer ?? explanation.value;
  const text = explanation.explanation
    ? `${matched}：${explanation.explanation}`
    : `${matched} は別の問題の正解として登録されていますが、解説は未登録です。`;
  appendExplanation(container, 'wrong-answer-explanation', label, text);
}

async function saveAttemptAndReview(attempt: Attempt): Promise<void> {
  await db.addAttempt(attempt);
  const baseCard = (await db.getReviewCard(attempt.questionId)) ?? createReviewCard(attempt.questionId, attempt.moduleId);
  const rating = inferReviewRating(attempt.result, attempt.elapsedMs, attempt.answerMode ?? 'input');
  const { card, log } = applyReviewRating(baseCard, rating, attempt.result, attempt.elapsedMs, { attemptId: attempt.attemptId });
  await db.putReviewCard(card);
  await db.putReviewLog(log);
}

function appendResult(container: HTMLElement, question: Question, result: Attempt['result'], elapsedMs: number, nearMiss = false, wrongExplanation?: WrongAnswerExplanation): void {
  const resultBox = el('div', result === 'correct' ? 'result correct' : 'result wrong');
  resultBox.append(
    el('strong', '', result === 'revealed' ? '答え表示' : result === 'correct' ? '正解' : '不正解'),
    el('span', '', `答え：${answerToText(getCorrectAnswer(question))}`), el('small', '', `${Math.round(elapsedMs / 100) / 10}秒`)
  );
  if (nearMiss) resultBox.append(el('span', 'near-miss-note', 'かなり近い答えです。復習優先度は軽めに記録しました。'));
  container.append(resultBox);
  if (question.explanation) appendExplanation(container, 'correct-answer-explanation', '正解の解説', question.explanation);
  if (result === 'wrong') appendWrongAnswerExplanation(container, wrongExplanation);
}

function fallback(message: string): HTMLElement { return el('p', 'image-fallback', message); }
function renderImageReference(question: Question, resolveImageAsset: QuestionImageAssetResolver): HTMLElement | undefined {
  if (!question.imageAsset) return undefined;
  if (!isSafeImageAssetRef(question.imageAsset)) return fallback(IMAGE_UNSAFE_MESSAGE);
  const mount = el('div', 'question-image-mount');
  mount.append(fallback('画像を読み込んでいます。'));
  void resolveImageAsset(question).then((dataUrl) => {
    if (!dataUrl) { mount.replaceChildren(fallback(IMAGE_MISSING_MESSAGE)); return; }
    if (!isSafeImageDataUrl(dataUrl)) { mount.replaceChildren(fallback(IMAGE_UNSAFE_MESSAGE)); return; }
    const image = el('img', 'question-image') as HTMLImageElement;
    image.src = dataUrl;
    image.alt = '問題資料画像';
    image.loading = 'lazy';
    image.onerror = () => mount.replaceChildren(fallback(IMAGE_LOAD_ERROR_MESSAGE));
    mount.replaceChildren(image);
  }).catch(() => mount.replaceChildren(fallback(IMAGE_LOAD_ERROR_MESSAGE)));
  return mount;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}分${String(seconds).padStart(2, '0')}秒` : `${seconds}秒`;
}

function renderQuizMeta(session: QuizSession, question: Question): HTMLElement {
  const wrap = el('div', 'quiz-meta-wrap');
  const meta = el('div', 'quiz-meta');
  meta.append(el('span', '', `${session.index + 1} / ${session.queue.length}`));
  if (session.settings.showNumber && question.number) meta.append(el('span', '', `No.${question.number}`));
  if (session.settings.showCategory && question.category) meta.append(el('span', '', question.category));

  const progress = session.queue.length > 0 ? Math.min(100, ((session.index + 1) / session.queue.length) * 100) : 0;
  const progressNode = el('div', 'quiz-progress');
  progressNode.setAttribute('role', 'progressbar');
  progressNode.setAttribute('aria-label', '学習進捗');
  progressNode.setAttribute('aria-valuemin', '0');
  progressNode.setAttribute('aria-valuemax', '100');
  progressNode.setAttribute('aria-valuenow', String(Math.round(progress)));
  const fill = el('div', 'quiz-progress-fill') as HTMLDivElement;
  fill.style.width = `${progress}%`;
  progressNode.append(fill);

  wrap.append(meta, progressNode);
  return wrap;
}

function renderSessionSummary(session: QuizSession): HTMLElement {
  const attempts = session.attempts;
  const correct = attempts.filter((attempt) => attempt.result === 'correct').length;
  const wrong = attempts.filter((attempt) => attempt.result === 'wrong').length;
  const revealed = attempts.filter((attempt) => attempt.result === 'revealed').length;
  const nearMiss = attempts.filter((attempt) => attempt.nearMiss).length;
  const answered = attempts.length;
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
  const elapsed = Math.max(0, Date.now() - session.startedAt);
  const average = answered > 0 ? attempts.reduce((sum, attempt) => sum + attempt.elapsedMs, 0) / answered : 0;

  const summary = el('div', 'session-summary');
  const stats = el('div', 'session-summary-grid');
  const items: Array<[string, string]> = [
    ['学習問題数', `${session.queue.length}問`],
    ['回答記録', `${answered}件`],
    ['正答率', `${accuracy}%`],
    ['正解', `${correct}問`],
    ['ミス', `${wrong}問`],
    ['答え表示', `${revealed}問`],
    ['ニアミス', `${nearMiss}問`],
    ['所要時間', formatDuration(elapsed)],
    ['平均回答時間', answered > 0 ? `${Math.round(average / 100) / 10}秒 / 問` : '記録なし']
  ];
  for (const [label, value] of items) {
    const item = el('div', 'summary-stat');
    item.append(el('span', '', label), el('strong', '', value));
    stats.append(item);
  }
  summary.append(stats);
  return summary;
}

export function renderInlineQuiz(container: HTMLElement, session: QuizSession, callbacks: InlineQuizCallbacks, options: InlineQuizOptions = {}): void {
  renderCleanupByContainer.get(container)?.();
  renderCleanupByContainer.delete(container);
  const renderToken = Symbol('inline-quiz-render');
  renderTokenByContainer.set(container, renderToken);
  clear(container);
  if (isSessionComplete(session)) {
    const done = el('div', 'quiz-card done');
    done.append(el('h3', '', 'セッション完了'), el('p', '', `${session.queue.length}問の学習が終わりました。`), renderSessionSummary(session));
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
  const shouldGenerateChoices = question.type === 'input' && (requestedAnswerFormat === 'choice' || (requestedAnswerFormat === 'auto' && DEFAULT_CHOICE_MODULE_IDS.has(question.moduleId)));
  const generatedChoices = question.type === 'input' && shouldGenerateChoices ? buildGeneratedChoices(question, session.choicePool) : undefined;
  const answerMode = effectiveAnswerMode(question, requestedAnswerFormat, generatedChoices);
  const card = el('section', 'quiz-card');
  const answerArea = el('div', 'answer-area');
  const controls = el('div', 'quiz-controls');
  const resultArea = el('div', 'result-area');
  let selectedAnswer: string | string[] = '';
  let answered = false;
  let moved = false;
  let pendingAttempt: Attempt | undefined;
  let idleTimer: number | undefined;
  let idleLastTickAt = 0;
  let idleRemainingMs = AUTO_REVEAL_IDLE_MS;
  let composing = false;

  function isCurrentRender(): boolean {
    return renderTokenByContainer.get(container) === renderToken && card.isConnected && container.contains(card);
  }

  function clearIdleTimer(): void {
    if (idleTimer === undefined) return;
    window.clearTimeout(idleTimer);
    idleTimer = undefined;
  }

  function cleanup(): void {
    clearIdleTimer();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (renderTokenByContainer.get(container) === renderToken) {
      renderTokenByContainer.delete(container);
      renderCleanupByContainer.delete(container);
    }
  }

  function scheduleIdleReveal(): void {
    clearIdleTimer();
    if (!session.settings.autoRevealAfterIdle || answered || moved || composing || document.hidden) return;
    if (!isCurrentRender()) {
      cleanup();
      return;
    }
    idleLastTickAt = Date.now();
    idleTimer = window.setTimeout(() => {
      idleTimer = undefined;
      if (!session.settings.autoRevealAfterIdle || answered || moved || composing || document.hidden) return;
      if (!isCurrentRender()) {
        cleanup();
        return;
      }
      const now = Date.now();
      const sinceLastTick = Math.max(0, now - idleLastTickAt);
      // A large scheduling gap indicates tab throttling or device sleep. It must not consume idle time.
      if (sinceLastTick <= IDLE_CLOCK_SUSPEND_GAP_MS) idleRemainingMs = Math.max(0, idleRemainingMs - sinceLastTick);
      if (idleRemainingMs === 0) record(selectedAnswer, true);
      else scheduleIdleReveal();
    }, Math.min(IDLE_CLOCK_TICK_MS, idleRemainingMs));
  }

  function resetIdleReveal(): void {
    if (!session.settings.autoRevealAfterIdle || answered || moved) return;
    idleRemainingMs = AUTO_REVEAL_IDLE_MS;
    scheduleIdleReveal();
  }

  function handleVisibilityChange(): void {
    if (!session.settings.autoRevealAfterIdle || answered || moved) return;
    if (document.hidden) {
      if (idleTimer !== undefined) {
        const sinceLastTick = Math.max(0, Date.now() - idleLastTickAt);
        if (sinceLastTick <= IDLE_CLOCK_SUSPEND_GAP_MS) {
          idleRemainingMs = Math.max(0, idleRemainingMs - sinceLastTick);
        }
      }
      clearIdleTimer();
      return;
    }
    scheduleIdleReveal();
  }

  function lockAnswerControls(): void {
    answerArea.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button').forEach((control) => {
      if (control instanceof HTMLInputElement) control.readOnly = true;
      control.disabled = true;
    });
  }

  function nextQuestion(): void {
    if (moved) return;
    moved = true;
    cleanup();
    callbacks.onSessionChange(advanceSession(session, pendingAttempt));
  }

  function record(answer: string | string[], revealed = false): void {
    if (answered) return;
    answered = true;
    cleanup();
    lockAnswerControls();
    const elapsedMs = elapsedForCurrent(session);
    const nearMiss = !revealed && typeof answer === 'string' && canJudgeNearMiss(activeQuestion) ? isNearMissAnswer(activeQuestion, answer) : false;
    const result: Attempt['result'] = revealed ? 'revealed' : judgeQuestion(activeQuestion, answer) ? 'correct' : 'wrong';
    const attempt = buildAttempt(activeQuestion, result, revealed ? '' : answer, elapsedMs, session.mode, answerMode, nearMiss);
    pendingAttempt = attempt;
    const wrongExplanation = !revealed && result === 'wrong' && typeof answer === 'string'
      ? buildWrongAnswerExplanation(answerMode === 'input' ? 'input' : 'choice', answer, activeQuestion, session.choicePool.length ? session.choicePool : session.queue)
      : undefined;
    appendResult(resultArea, activeQuestion, result, elapsedMs, nearMiss, wrongExplanation);
    const persisted = saveAttemptAndReview(attempt);
    if (result === 'correct' && session.settings.autoNext) void persisted.finally(() => window.setTimeout(nextQuestion, 650));
    else void persisted;
  }

  const bookmark = button('☆ ブックマーク', 'btn ghost bookmark-btn');
  let bookmarked = false;
  void db.getBookmarks().then((bookmarks) => {
    bookmarked = bookmarks.includes(question.id);
    bookmark.textContent = bookmarked ? '★ ブックマーク済み' : '☆ ブックマーク';
    bookmark.classList.toggle('selected', bookmarked);
  });
  bookmark.onclick = async () => {
    bookmarked = !bookmarked;
    await db.setBookmark(question.id, bookmarked);
    bookmark.textContent = bookmarked ? '★ ブックマーク済み' : '☆ ブックマーク';
    bookmark.classList.toggle('selected', bookmarked);
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
      clearIdleTimer();
    });
    input.addEventListener('compositionend', () => {
      composing = false;
      lastInputValue = input.value;
      resetIdleReveal();
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
    for (const choice of question.type === 'choice' ? question.choices : generatedChoices ?? []) {
      const choiceButton = button(choice, 'choice-btn');
      choiceButton.onclick = () => { selectedAnswer = choice; record(choice); };
      list.append(choiceButton);
    }
    answerArea.append(list);
  } else if (question.type === 'multi_select') {
    const selected = new Set<string>();
    const list = el('div', 'choice-list');
    for (const choice of question.choices) {
      const choiceButton = button(choice, 'choice-btn');
      choiceButton.onclick = () => {
        if (selected.has(choice)) { selected.delete(choice); choiceButton.classList.remove('selected'); }
        else { selected.add(choice); choiceButton.classList.add('selected'); }
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
  const hint = button('ヒント', 'btn ghost');
  hint.disabled = !hintText;
  hint.onclick = () => {
    if (!hintText || resultArea.querySelector('.hint-panel')) return;
    resultArea.prepend(el('p', 'hint-panel', hintText));
    resetIdleReveal();
  };
  const reveal = button('答えを見る', 'btn ghost');
  reveal.onclick = () => record(selectedAnswer, true);
  const next = button('次へ', 'btn');
  next.onclick = nextQuestion;
  controls.append(bookmark, hint, reveal, next);

  card.append(renderQuizMeta(session, question), el('h3', 'question-prompt', question.prompt));
  const image = renderImageReference(question, options.resolveImageAsset ?? resolveActiveQuestionImageAsset);
  if (image) card.append(image);
  card.append(answerArea, controls, resultArea);
  container.append(card);
  if (session.settings.autoRevealAfterIdle) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    renderCleanupByContainer.set(container, cleanup);
    scheduleIdleReveal();
  }
}
