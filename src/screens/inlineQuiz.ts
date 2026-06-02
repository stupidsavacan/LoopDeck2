import { judgeQuestion, getCorrectAnswer } from '../core/answerJudge';
import type { Attempt, Question } from '../core/models';
import { advanceSession, currentQuestion, elapsedForCurrent, isSessionComplete, type QuizSession } from '../core/sessionEngine';
import { isSafeImageAssetRef } from '../packs/assetSafety';
import { db } from '../storage/db';
import { button, clear, el } from '../ui/dom';

export interface InlineQuizCallbacks {
  onSessionChange(session: QuizSession): void;
  onComplete(): void;
}

function answerToText(answer: string | string[]): string {
  return Array.isArray(answer) ? answer.join(' / ') : answer;
}

function renderResult(container: HTMLElement, question: Question, correct: boolean, input: string | string[], elapsedMs: number, mode: 'normal' | 'review'): void {
  const answer = getCorrectAnswer(question);
  const result = el('div', correct ? 'result correct' : 'result wrong');
  result.innerHTML = `
    <strong>${correct ? '正解' : '不正解'}</strong>
    <span>答え：${answerToText(answer)}</span>
    <small>${Math.round(elapsedMs / 100) / 10}秒</small>
  `;
  container.append(result);

  if (question.explanation) {
    const explanation = el('p', 'explanation');
    explanation.textContent = question.explanation;
    container.append(explanation);
  }

  void db.addAttempt({
    attemptId: `${Date.now()}-${crypto.randomUUID()}`,
    questionId: question.id,
    moduleId: question.moduleId,
    answeredAt: new Date().toISOString(),
    result: correct ? 'correct' : 'wrong',
    input,
    answer,
    elapsedMs,
    mode
  } satisfies Attempt);
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

export function renderInlineQuiz(container: HTMLElement, session: QuizSession, callbacks: InlineQuizCallbacks): void {
  clear(container);

  if (isSessionComplete(session)) {
    const done = el('div', 'quiz-card done');
    done.innerHTML = `<h3>セッション完了</h3><p>${session.queue.length}問の学習が終わりました。</p>`;
    const back = button('教材詳細に戻る', 'btn primary');
    back.onclick = callbacks.onComplete;
    done.append(back);
    container.append(done);
    return;
  }

  const maybeQuestion = currentQuestion(session);
  if (!maybeQuestion) return;
  const question: Question = maybeQuestion;

  const card = el('section', 'quiz-card');
  const meta = el('div', 'quiz-meta', `${session.index + 1} / ${session.queue.length}`);
  const prompt = el('h3', 'question-prompt', question.prompt);
  const image = renderImageReference(question);
  const answerArea = el('div', 'answer-area');
  const controls = el('div', 'quiz-controls');
  const resultArea = el('div', 'result-area');
  let selectedAnswer: string | string[] = '';
  let answered = false;

  function submitAnswer(answer: string | string[], revealed = false): void {
    if (answered) return;
    answered = true;
    const elapsedMs = elapsedForCurrent(session);

    if (revealed) {
      const correctAnswer = getCorrectAnswer(question);
      resultArea.innerHTML = `<div class="result wrong"><strong>答え表示</strong><span>答え：${answerToText(correctAnswer)}</span></div>`;
      if (question.explanation) {
        const explanation = el('p', 'explanation', question.explanation);
        resultArea.append(explanation);
      }
      void db.addAttempt({
        attemptId: `${Date.now()}-${crypto.randomUUID()}`,
        questionId: question.id,
        moduleId: question.moduleId,
        answeredAt: new Date().toISOString(),
        result: 'revealed',
        input: '',
        answer: correctAnswer,
        elapsedMs,
        mode: session.mode
      });
      return;
    }

    const correct = judgeQuestion(question, answer);
    renderResult(resultArea, question, correct, answer, elapsedMs, session.mode);

    if (correct && session.settings.autoNext) {
      window.setTimeout(nextQuestion, 650);
    }
  }

  function nextQuestion(): void {
    callbacks.onSessionChange(advanceSession(session));
  }

  if (question.type === 'input') {
    const input = el('input', 'text-input') as HTMLInputElement;
    input.placeholder = '答えを入力';
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submitAnswer(input.value);
    });
    selectedAnswer = input.value;
    const submit = button('回答する', 'btn primary');
    submit.onclick = () => submitAnswer(input.value);
    answerArea.append(input, submit);
    window.setTimeout(() => input.focus(), 0);
  }

  if (question.type === 'choice') {
    const list = el('div', 'choice-list');
    question.choices.forEach((choice) => {
      const choiceButton = button(choice, 'choice-btn');
      choiceButton.onclick = () => {
        selectedAnswer = choice;
        submitAnswer(choice);
      };
      list.append(choiceButton);
    });
    answerArea.append(list);
  }

  if (question.type === 'multi_select') {
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
    submit.onclick = () => submitAnswer([...selected]);
    answerArea.append(list, submit);
  }

  const reveal = button('答えを見る', 'btn ghost');
  reveal.onclick = () => submitAnswer(selectedAnswer, true);
  const next = button('次へ', 'btn');
  next.onclick = nextQuestion;
  controls.append(reveal, next);

  card.append(meta, prompt);
  if (image) card.append(image);
  card.append(answerArea, controls, resultArea);
  container.append(card);
}
