import { getCorrectAnswer, isNearMissAnswer, judgeQuestion } from '../core/answerJudge';
import { buildGeneratedChoices } from '../core/choiceGenerator';
import type { AnswerFormat, Attempt, ChoiceQuestion, InputQuestion, Question } from '../core/models';
import { scoreAttemptDelta } from '../core/reviewEngine';
import { applyReviewRating, createReviewCard, inferReviewRating } from '../core/scheduler';
import { advanceSession, currentQuestion, elapsedForCurrent, isSessionComplete, type QuizSession } from '../core/sessionEngine';
import { isSafeImageAssetRef, isSafeImageDataUrl } from '../packs/assetSafety';
import { resolveActiveQuestionImageAsset, type QuestionImageAssetResolver } from '../packs/packAssetResolver';
import { db } from '../storage/db';
import { button, clear, el } from '../ui/dom';

export interface InlineQuizCallbacks { onSessionChange(session: QuizSession): void; onComplete(): void; }
export interface InlineQuizOptions { resolveImageAsset?: QuestionImageAssetResolver; }

const DEFAULT_CHOICE_MODULE_IDS = new Set(['leap', 'leap_final']);
// English: The image reference is preserved, but the image file could not be found.
const IMAGE_MISSING_MESSAGE = '\u753b\u50cf\u53c2\u7167\u306f\u4fdd\u6301\u3055\u308c\u3066\u3044\u307e\u3059\u304c\u3001\u753b\u50cf\u30d5\u30a1\u30a4\u30eb\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3002';
// English: The image reference is preserved. Display was skipped because the reference is unsafe.
const IMAGE_UNSAFE_MESSAGE = '\u753b\u50cf\u53c2\u7167\u306f\u4fdd\u6301\u3055\u308c\u3066\u3044\u307e\u3059\u3002\u8868\u793a\u306f\u672a\u5b9f\u88c5\u307e\u305f\u306f\u5b89\u5168\u3067\u306a\u3044\u53c2\u7167\u306e\u305f\u3081\u30b9\u30ad\u30c3\u30d7\u3057\u307e\u3057\u305f\u3002';
// English: The image reference is preserved. The image file cannot be displayed yet.
const IMAGE_LOAD_ERROR_MESSAGE = '\u753b\u50cf\u53c2\u7167\u306f\u4fdd\u6301\u3055\u308c\u3066\u3044\u307e\u3059\u3002\u753b\u50cf\u30d5\u30a1\u30a4\u30eb\u306f\u307e\u3060\u8868\u793a\u3067\u304d\u307e\u305b\u3093\u3002';

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

async function saveAttemptAndReview(attempt: Attempt): Promise<void> {
  await db.addAttempt(attempt);
  const baseCard = (await db.getReviewCard(attempt.questionId)) ?? createReviewCard(attempt.questionId, attempt.moduleId);
  const rating = inferReviewRating(attempt.result, attempt.elapsedMs, attempt.answerMode ?? 'input');
  const { card, log } = applyReviewRating(baseCard, rating, attempt.result, attempt.elapsedMs, { attemptId: attempt.attemptId });
  await db.putReviewCard(card);
  await db.putReviewLog(log);
}

function appendResult(container: HTMLElement, question: Question, result: Attempt['result'], elapsedMs: number, nearMiss = false): void {
  const resultBox = el('div', result === 'correct' ? 'result correct' : 'result wrong');
  resultBox.append(
    el('strong', '', result === 'revealed' ? '\u7b54\u3048\u8868\u793a' : result === 'correct' ? '\u6b63\u89e3' : '\u4e0d\u6b63\u89e3'),
    el('span', '', `\u7b54\u3048\uff1a${answerToText(getCorrectAnswer(question))}`), el('small', '', `${Math.round(elapsedMs / 100) / 10}\u79d2`)
  );
  if (nearMiss) resultBox.append(el('span', 'near-miss-note', '\u304b\u306a\u308a\u8fd1\u3044\u7b54\u3048\u3067\u3059\u3002\u5fa9\u7fd2\u512a\u5148\u5ea6\u306f\u8efd\u3081\u306b\u8a18\u9332\u3057\u307e\u3057\u305f\u3002'));
  container.append(resultBox);
  if (question.explanation) container.append(el('p', 'explanation', question.explanation));
}

function fallback(message: string): HTMLElement { return el('p', 'image-fallback', message); }
function renderImageReference(question: Question, resolveImageAsset: QuestionImageAssetResolver): HTMLElement | undefined {
  if (!question.imageAsset) return undefined;
  if (!isSafeImageAssetRef(question.imageAsset)) return fallback(IMAGE_UNSAFE_MESSAGE);
  const mount = el('div', 'question-image-mount');
  mount.append(fallback('\u753b\u50cf\u3092\u8aad\u307f\u8fbc\u3093\u3067\u3044\u307e\u3059\u3002'));
  void resolveImageAsset(question).then((dataUrl) => {
    if (!dataUrl) { mount.replaceChildren(fallback(IMAGE_MISSING_MESSAGE)); return; }
    if (!isSafeImageDataUrl(dataUrl)) { mount.replaceChildren(fallback(IMAGE_UNSAFE_MESSAGE)); return; }
    const image = el('img', 'question-image') as HTMLImageElement;
    image.src = dataUrl;
    image.alt = '\u554f\u984c\u8cc7\u6599\u753b\u50cf';
    image.loading = 'lazy';
    image.onerror = () => mount.replaceChildren(fallback(IMAGE_LOAD_ERROR_MESSAGE));
    mount.replaceChildren(image);
  }).catch(() => mount.replaceChildren(fallback(IMAGE_LOAD_ERROR_MESSAGE)));
  return mount;
}

function renderQuizMeta(session: QuizSession, question: Question): HTMLElement {
  const meta = el('div', 'quiz-meta');
  meta.append(el('span', '', `${session.index + 1} / ${session.queue.length}`));
  if (session.settings.showNumber && question.number) meta.append(el('span', '', `No.${question.number}`));
  if (session.settings.showCategory && question.category) meta.append(el('span', '', question.category));
  return meta;
}

export function renderInlineQuiz(container: HTMLElement, session: QuizSession, callbacks: InlineQuizCallbacks, options: InlineQuizOptions = {}): void {
  clear(container);
  if (isSessionComplete(session)) {
    const done = el('div', 'quiz-card done');
    done.append(el('h3', '', '\u30bb\u30c3\u30b7\u30e7\u30f3\u5b8c\u4e86'), el('p', '', `${session.queue.length}\u554f\u306e\u5b66\u7fd2\u304c\u7d42\u308f\u308a\u307e\u3057\u305f\u3002`));
    const back = button('\u6559\u6750\u8a73\u7d30\u306b\u623b\u308b', 'btn primary');
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

  function nextQuestion(): void { callbacks.onSessionChange(advanceSession(session)); }
  function record(answer: string | string[], revealed = false): void {
    if (answered) return;
    answered = true;
    const elapsedMs = elapsedForCurrent(session);
    const nearMiss = !revealed && typeof answer === 'string' && canJudgeNearMiss(activeQuestion) ? isNearMissAnswer(activeQuestion, answer) : false;
    const result: Attempt['result'] = revealed ? 'revealed' : judgeQuestion(activeQuestion, answer) ? 'correct' : 'wrong';
    const attempt = buildAttempt(activeQuestion, result, revealed ? '' : answer, elapsedMs, session.mode, answerMode, nearMiss);
    appendResult(resultArea, activeQuestion, result, elapsedMs, nearMiss);
    const persisted = saveAttemptAndReview(attempt);
    if (result === 'correct' && session.settings.autoNext) void persisted.finally(() => window.setTimeout(nextQuestion, 650));
    else void persisted;
  }

  const bookmark = button('\u2606 \u30d6\u30c3\u30af\u30de\u30fc\u30af', 'btn ghost bookmark-btn');
  let bookmarked = false;
  void db.getBookmarks().then((bookmarks) => {
    bookmarked = bookmarks.includes(question.id);
    bookmark.textContent = bookmarked ? '\u2605 \u30d6\u30c3\u30af\u30de\u30fc\u30af\u6e08\u307f' : '\u2606 \u30d6\u30c3\u30af\u30de\u30fc\u30af';
    bookmark.classList.toggle('selected', bookmarked);
  });
  bookmark.onclick = async () => {
    bookmarked = !bookmarked;
    await db.setBookmark(question.id, bookmarked);
    bookmark.textContent = bookmarked ? '\u2605 \u30d6\u30c3\u30af\u30de\u30fc\u30af\u6e08\u307f' : '\u2606 \u30d6\u30c3\u30af\u30de\u30fc\u30af';
    bookmark.classList.toggle('selected', bookmarked);
  };

  if (session.settings.showExample && question.example) answerArea.append(el('p', 'example-line', question.example));
  if (answerMode === 'input') {
    const input = el('input', 'text-input') as HTMLInputElement;
    input.placeholder = '\u7b54\u3048\u3092\u5165\u529b';
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') record(input.value); });
    const submit = button('\u56de\u7b54\u3059\u308b', 'btn primary');
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
      };
      list.append(choiceButton);
    }
    const submit = button('\u9078\u629e\u3092\u78ba\u5b9a', 'btn primary');
    submit.onclick = () => record([...selected]);
    answerArea.append(list, submit);
  }

  const hintText = question.example ?? question.explanation;
  const hint = button('\u30d2\u30f3\u30c8', 'btn ghost');
  hint.disabled = !hintText;
  hint.onclick = () => { if (hintText && !resultArea.querySelector('.hint-panel')) resultArea.prepend(el('p', 'hint-panel', hintText)); };
  const reveal = button('\u7b54\u3048\u3092\u898b\u308b', 'btn ghost');
  reveal.onclick = () => record(selectedAnswer, true);
  const next = button('\u6b21\u3078', 'btn');
  next.onclick = nextQuestion;
  controls.append(bookmark, hint, reveal, next);

  card.append(renderQuizMeta(session, question), el('h3', 'question-prompt', question.prompt));
  const image = renderImageReference(question, options.resolveImageAsset ?? resolveActiveQuestionImageAsset);
  if (image) card.append(image);
  card.append(answerArea, controls, resultArea);
  container.append(card);
}
