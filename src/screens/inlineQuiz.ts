import { getCorrectAnswer, isNearMissAnswer, judgeQuestion } from '../core/answerJudge';
import { buildGeneratedChoices } from '../core/choiceGenerator';
import type { AnswerFormat, Attempt, ChoiceQuestion, InputQuestion, Question } from '../core/models';
import { scoreAttemptDelta } from '../core/reviewEngine';
import { applyReviewRating, createReviewCard, inferReviewRating } from '../core/scheduler';
import { advanceSession, currentQuestion, elapsedForCurrent, isSessionComplete, type QuizSession } from '../core/sessionEngine';
import { isSafeImageAssetRef } from '../packs/assetSafety';
import { db } from '../storage/db';
import { button, clear, el } from '../ui/dom';

export interface InlineQuizCallbacks {
  onSessionChange(session: QuizSession): void;
  onComplete(): void;
}

const DEFAULT_CHOICE_MODULE_IDS = new Set(['leap', 'leap_final']);

function answerToText(answer: string | string[]): string {
  return Array.isArray(answer) ? answer.join(' / ') : answer;
}

function effectiveAnswerMode(question: Question, requested: AnswerFormat = 'auto', generatedChoices?: string[]): AnswerFormat {
  if (question.type === 'multi_select') return 'choice';
  if (requested === 'input') return 'input';
  if (question.type === 'choice') return 'choice';
  if (generatedChoices?.length) return 'choice';
  return 'input';
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
  nearMiss = false
): Attempt {
  const answer = getCorrectAnswer(question);
  return {
    attemptId: `${Date.now()}-${crypto.randomUUID()}`,
    questionId: question.id,
    moduleId: question.moduleId,
    answeredAt: new Date().toISOString(),
    result,
    input,
    answer,
    elapsedMs,
    mode,
    nearMiss,
    hiddenTimeExcludedMs: 0,
    priorityDelta: scoreAttemptDelta(result, nearMiss, elapsedMs, answerMode),
    answerMode
  };
}

async function saveAttemptAndReview(attempt: Attempt): Promise<void> {
  await db.addAttempt(attempt);
  const currentCard = await db.getReviewCard(attempt.questionId);
  const baseCard = currentCard ?? createReviewCard(attempt.questionId, attempt.moduleId);
  const rating = inferReviewRating(attempt.result, attempt.elapsedMs, attempt.answerMode ?? 'input');
  const { card, log } = applyReviewRating(baseCard, rating, attempt.result, attempt.elapsedMs, { attemptId: attempt.attemptId });
  await db.putReviewCard(card);
  await db.putReviewLog(log);
}

function appendResult(container: HTMLElement, question: Question, result: Attempt['result'], elapsedMs: number, nearMiss = false): void {
  const answer = getCorrectAnswer(question);
  const correct = result === 'correct';
  const resultBox = el('div', correct ? 'result correct' : 'result wrong');
  resultBox.append(
    el('strong', '', result === 'revealed' ? '答え表示' : correct ? '正解' : '不正解'),
    el('span', '', `答え：${answerToText(answer)}`),
    el('small', '', `${Math.round(elapsedMs / 100) / 10}秒`)
  );
  if (nearMiss) resultBox.append(el('span', 'near-miss-note', 'かなり近い答えです。復習優先度は軽めに記録しました。'));
  container.append(resultBox);

  if (question.explanation) {
    const explanation = el('p', 'explanation');
    explanation.textContent = question.explanation;
    container.append(explanation);
  }
}

function renderImageReference(question: Question): HTMLElement | undefined {
  if (!question.imageAsset) return undefined;
  if (!isSafeImageAssetRef(question.imageAsset)) {
    return el('p', 'image-fallback', '画像参照は保持されています。表示は未実装または安全でない参照のためスキップしました。');
  }

  const image = el('img', 'question-image') as HTMLImageElement;
  image.src = question.imageAsset;
  image.alt = '問題資料画像';
  image.loading = 'lazy';
  image.onerror = () => {
    image.replaceWith(el('p', 'image-fallback', '画像参照は保持されています。画像ファイルはまだ表示できません。'));
  };
  return image;
}

function renderQuizMeta(session: QuizSession, question: Question): HTMLElement {
  const meta = el('div', 'quiz-meta');
  meta.append(el('span', '', `${session.index + 1} / ${session.queue.length}`));
  if (session.settings.showNumber && question.number) meta.append(el('span', '', `No.${question.number}`));
  if (session.settings.showCategory && question.category) meta.append(el('span', '', question.category));
  return meta;
}

export function renderInlineQuiz(container: HTMLElement, session: QuizSession, callbacks: InlineQuizCallbacks): void {
  clear(container);

  if (isSessionComplete(session)) {
    const done = el('div', 'quiz-card done');
    done.append(el('h3', '', 'セッション完了'), el('p', '', `${session.queue.length}問の学習が終わりました。`));
    const back = button('教材詳細に戻る', 'btn primary');
    back.onclick = callbacks.onComplete;
    done.append(back);
    container.append(done);
    return;
  }

  const maybeQuestion = currentQuestion(session);
  if (!maybeQuestion) return;
  const question: Question = maybeQuestion;
  const requestedAnswerFormat = session.settings.answerFormat ?? 'auto';
  const shouldGenerateChoices = question.type === 'input'
    && (requestedAnswerFormat === 'choice' || (requestedAnswerFormat === 'auto' && DEFAULT_CHOICE_MODULE_IDS.has(question.moduleId)));
  const generatedChoices = question.type === 'input' && shouldGenerateChoices
    ? buildGeneratedChoices(question, session.choicePool)
    : undefined;
  const answerMode = effectiveAnswerMode(question, requestedAnswerFormat, generatedChoices);

  const card = el('section', 'quiz-card');
  const prompt = el('h3', 'question-prompt', question.prompt);
  const image = renderImageReference(question);
  const answerArea = el('div', 'answer-area');
  const controls = el('div', 'quiz-controls');
  const resultArea = el('div', 'result-area');
  let selectedAnswer: string | string[] = '';
  let answered = false;

  function record(answer: string | string[], revealed = false): void {
    if (answered) return;
    answered = true;
    const elapsedMs = elapsedForCurrent(session);
    const nearMiss = !revealed && typeof answer === 'string' && canJudgeNearMiss(question) ? isNearMissAnswer(question, answer) : false;
    const result: Attempt['result'] = revealed ? 'revealed' : judgeQuestion(question, answer) ? 'correct' : 'wrong';
    const attempt = buildAttempt(question, result, revealed ? '' : answer, elapsedMs, session.mode, answerMode, nearMiss);
    appendResult(resultArea, question, result, elapsedMs, nearMiss);

    const persisted = saveAttemptAndReview(attempt);
    if (result === 'correct' && session.settings.autoNext) {
      void persisted.finally(() => window.setTimeout(nextQuestion, 650));
      return;
    }
    void persisted;
  }

  function nextQuestion(): void {
    callbacks.onSessionChange(advanceSession(session));
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

  if (session.settings.showExample && question.example) {
    answerArea.append(el('p', 'example-line', question.example));
  }

  if (answerMode === 'input') {
    const input = el('input', 'text-input') as HTMLInputElement;
    input.placeholder = '答えを入力';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') record(input.value);
    });
    selectedAnswer = input.value;
    const submit = button('回答する', 'btn primary');
    submit.onclick = () => record(input.value);
    answerArea.append(input, submit);
    window.setTimeout(() => input.focus(), 0);
  } else if (question.type === 'choice' || generatedChoices) {
    const choices = question.type === 'choice' ? question.choices : generatedChoices ?? [];
    const list = el('div', 'choice-list');
    choices.forEach((choice) => {
      const choiceButton = button(choice, 'choice-btn');
      choiceButton.onclick = () => {
        selectedAnswer = choice;
        record(choice);
      };
      list.append(choiceButton);
    });
    answerArea.append(list);
  } else if (question.type === 'multi_select') {
    const selected = new Set<string>();
    const list = el('div', 'choice-list');
    question.choices.forEach((choice) => {
      const choiceButton = button(choice, 'choice-btn');
      choiceButton.onclick = () => {
        if (selected.has(choice)) {
          selected.delete(choice);
          choiceButton.classList.remove('selected');
        } else {
          selected.add(choice);
          choiceButton.classList.add('selected');
        }
        selectedAnswer = [...selected];
      };
      list.append(choiceButton);
    });
    const submit = button('選択を確定', 'btn primary');
    submit.onclick = () => record([...selected]);
    answerArea.append(list, submit);
  } else {
    const input = el('input', 'text-input') as HTMLInputElement;
    input.placeholder = '答えを入力';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') record(input.value);
    });
    const submit = button('回答する', 'btn primary');
    submit.onclick = () => record(input.value);
    answerArea.append(input, submit);
    window.setTimeout(() => input.focus(), 0);
  }

  const hintText = question.example ?? question.explanation;
  const hint = button('ヒント', 'btn ghost');
  hint.disabled = !hintText;
  hint.onclick = () => {
    if (!hintText || resultArea.querySelector('.hint-panel')) return;
    resultArea.prepend(el('p', 'hint-panel', hintText));
  };
  const reveal = button('答えを見る', 'btn ghost');
  reveal.onclick = () => record(selectedAnswer, true);
  const next = button('次へ', 'btn');
  next.onclick = nextQuestion;
  controls.append(bookmark, hint, reveal, next);

  card.append(renderQuizMeta(session, question), prompt);
  if (image) card.append(image);
  card.append(answerArea, controls, resultArea);
  container.append(card);
}
