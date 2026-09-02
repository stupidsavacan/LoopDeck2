import { getCorrectAnswer } from '../core/answerJudge';
import type { Attempt, Question } from '../core/models';
import { buildWrongAnswerExplanation } from '../core/wrongAnswerExplanation';
import { learningRepository } from '../data/learningRepository';
import { isSafeImageAssetRef, isSafeImageDataUrl } from '../packs/assetSafety';
import type { PlayerController } from '../flow/playerController';
import type { PlayerState } from '../flow/models';
import { button, clear, el, toast } from '../ui/dom';
import { renderCheckpointScreen } from './checkpointScreen';
import { renderCompleteScreen } from './completeScreen';

function answerText(question: Question): string {
  const answer = getCorrectAnswer(question);
  return Array.isArray(answer) ? answer.join(' / ') : answer;
}

function isSafeResolvedImage(value: string): boolean {
  if (isSafeImageDataUrl(value)) return true;
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin || (url.protocol === 'file:' && window.location.protocol === 'file:');
  } catch {
    return false;
  }
}

function imageNode(question: Question, resolve: (question: Question) => Promise<string | undefined>): HTMLElement | undefined {
  if (!question.imageAsset) return undefined;
  const mount = el('figure', 'player-image');
  if (!isSafeImageAssetRef(question.imageAsset)) { mount.append(el('p', 'image-fallback', '安全でない画像参照のため表示できません。')); return mount; }
  mount.append(el('p', 'muted', '画像を読み込んでいます…'));
  void resolve(question).then((dataUrl) => {
    if (!dataUrl || !isSafeResolvedImage(dataUrl)) { mount.replaceChildren(el('p', 'image-fallback', '画像ファイルが見つかりません。')); return; }
    const image = el('img') as HTMLImageElement; image.src = dataUrl; image.alt = '問題資料画像'; image.loading = 'lazy';
    image.onerror = () => mount.replaceChildren(el('p', 'image-fallback', '画像を表示できません。'));
    mount.replaceChildren(image);
  }).catch(() => mount.replaceChildren(el('p', 'image-fallback', '画像を表示できません。')));
  return mount;
}

export interface PlayerScreenActions {
  exit(): void;
  showPhase(phase: 'player' | 'checkpoint' | 'complete'): void;
  today(): void;
  progress(): void;
}

export async function renderPlayerScreen(root: HTMLElement, controller: PlayerController, actions: PlayerScreenActions): Promise<void> {
  clear(root);
  const state = controller.state();
  if (state.tag === 'checkpoint') {
    root.append(renderCheckpointScreen(state.session, async () => { await controller.continueFromCheckpoint(); actions.showPhase('player'); }, async () => { await controller.pause(); actions.today(); }));
    return;
  }
  if (state.tag === 'complete') {
    const attempts = (await learningRepository.readAll()).attempts;
    root.append(renderCompleteScreen(state.session, attempts, actions.today, actions.progress));
    return;
  }
  if (state.tag === 'error') {
    const screen = el('main', 'player-screen');
    const error = el('section', 'player-error'); error.append(el('h1', '', '学習を再開できません'), el('p', '', state.message));
    const close = button('Todayへ', 'btn primary'); close.onclick = actions.today; error.append(close); screen.append(error); root.append(screen); return;
  }
  if (state.tag === 'feedback') {
    renderFeedback(root, controller, state, actions);
    return;
  }
  await renderQuestion(root, controller, actions);
}

async function renderQuestion(root: HTMLElement, controller: PlayerController, actions: PlayerScreenActions): Promise<void> {
  const presentation = controller.presentation();
  if (!presentation) { actions.today(); return; }
  const { question, answerFormat, choices } = presentation;
  const session = controller.record;
  const entry = controller.currentEntry;
  const screen = el('main', 'player-screen');
  const top = el('header', 'player-topbar');
  const close = button('×', 'icon-button player-close'); close.setAttribute('aria-label', '中断してTodayへ');
  close.onclick = async () => { await controller.pause(); actions.exit(); };
  const progress = el('div', 'player-progress');
  const fill = el('span') as HTMLSpanElement; fill.style.width = `${Math.round((session.index / Math.max(1, session.entries.length)) * 100)}%`; progress.append(fill);
  top.append(close, progress, el('span', 'player-count', `${session.index + 1}/${session.entries.length}`));

  const content = el('section', 'player-content');
  const meta = el('div', 'player-meta');
  meta.append(el('span', `reason-chip reason-${entry.primaryReason}`, entry.primaryReason === 'due' ? '復習予定' : entry.primaryReason === 'weak' ? '苦手' : entry.primaryReason === 'new' ? '新しい問題' : '続き'));
  if (session.settings.showCategory && question.category) meta.append(el('span', 'meta-chip', question.category));
  if (session.settings.showNumber && question.number) meta.append(el('span', 'meta-chip', `No.${question.number}`));
  content.append(meta, el('h1', 'player-prompt', question.prompt));
  const image = imageNode(question, (target) => controller.resolveQuestionImage(target)); if (image) content.append(image);
  if (session.settings.showExample && question.example) content.append(el('p', 'example-line', question.example));
  const answerArea = el('div', 'player-answer-area');
  const selected = new Set(session.selectedChoices);
  let draft = session.draftInput ?? '';
  let composing = false;
  let hintShown = false;
  let visibility = (): void => {};

  const submitAnswer = async (answer: string | string[], revealed = false): Promise<void> => {
    document.removeEventListener('visibilitychange', visibility);
    const result = await controller.submit(answer, revealed);
    if (result.tag === 'feedback') renderFeedback(root, controller, result, actions);
    else if (result.tag === 'error') { toast('保存に失敗しました。もう一度お試しください。'); }
  };

  if (answerFormat === 'input') {
    const input = el('input', 'player-input') as HTMLInputElement;
    input.placeholder = '答えを入力'; input.value = draft; input.autocomplete = 'off';
    input.addEventListener('input', () => { if (composing || input.value === draft) return; draft = input.value; controller.resetIdle(); void controller.updateDraft(draft); });
    input.addEventListener('paste', () => controller.resetIdle());
    input.addEventListener('compositionstart', () => { composing = true; controller.pauseIdle('composition'); });
    input.addEventListener('compositionend', () => { composing = false; draft = input.value; controller.resumeIdle('composition', true); void controller.updateDraft(draft); });
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !composing && !event.isComposing) { event.preventDefault(); void submitAnswer(input.value); } });
    const submit = button('回答する', 'btn primary player-submit'); submit.onclick = () => void submitAnswer(input.value);
    answerArea.append(input, submit);
    window.setTimeout(() => input.focus(), 0);
  } else if (question.type === 'multi_select') {
    const list = el('div', 'player-choice-list');
    for (const choice of choices) {
      const choiceButton = button(choice, `player-choice${selected.has(choice) ? ' is-selected' : ''}`);
      choiceButton.onclick = () => {
        if (selected.has(choice)) selected.delete(choice); else selected.add(choice);
        choiceButton.classList.toggle('is-selected', selected.has(choice)); controller.resetIdle(); void controller.updateDraft('', [...selected]);
      };
      list.append(choiceButton);
    }
    const submit = button('選択を確定', 'btn primary player-submit'); submit.onclick = () => void submitAnswer([...selected]);
    answerArea.append(list, submit);
  } else {
    const list = el('div', 'player-choice-list');
    for (const choice of choices) { const choiceButton = button(choice, 'player-choice'); choiceButton.onclick = () => void submitAnswer(choice); list.append(choiceButton); }
    answerArea.append(list);
  }
  content.append(answerArea);

  const tools = el('footer', 'player-tools');
  const bookmark = button('☆', 'icon-button'); bookmark.setAttribute('aria-label', 'ブックマーク');
  let bookmarked = (await learningRepository.getBookmarks()).includes(question.id);
  bookmark.textContent = bookmarked ? '★' : '☆';
  bookmark.onclick = async () => { bookmarked = !bookmarked; await learningRepository.setBookmark(question.id, bookmarked); bookmark.textContent = bookmarked ? '★' : '☆'; };
  const hint = button('ヒント', 'btn ghost small'); hint.disabled = !(question.example || question.explanation);
  hint.onclick = () => { if (hintShown) return; hintShown = true; const panel = el('p', 'hint-panel', question.example ?? question.explanation ?? ''); content.insertBefore(panel, answerArea); controller.resetIdle(); };
  const reveal = button('答えを見る', 'btn ghost small'); reveal.onclick = () => void submitAnswer('', true);
  tools.append(bookmark, hint, reveal);
  screen.append(top, content, tools); root.replaceChildren(screen);
  visibility = () => document.hidden ? controller.pauseIdle('hidden') : controller.resumeIdle('hidden');
  document.addEventListener('visibilitychange', visibility, { once: false });
  controller.startIdle((expired) => { document.removeEventListener('visibilitychange', visibility); if (expired.tag === 'feedback') renderFeedback(root, controller, expired, actions); });
}

function renderFeedback(root: HTMLElement, controller: PlayerController, state: Extract<PlayerState, { tag: 'feedback' }>, actions: PlayerScreenActions): void {
  const presentation = controller.presentation();
  if (!presentation) return;
  const { question } = presentation;
  const attempt: Attempt = state.attempt;
  const screen = el('main', `player-screen feedback-screen feedback-${attempt.result}`);
  const top = el('header', 'player-topbar');
  const label = attempt.result === 'correct' ? '正解' : attempt.result === 'wrong' ? 'もう一度つながる' : '答えを確認';
  top.append(el('span', 'feedback-label', label), el('span', 'player-count', `${state.session.index + 1}/${state.session.entries.length}`));
  const card = el('section', 'feedback-card');
  card.append(el('p', 'flow-eyebrow', attempt.result.toUpperCase()), el('h1', '', answerText(question)));
  if (question.explanation) card.append(el('p', 'feedback-explanation', question.explanation));
  if (attempt.result === 'wrong' && typeof attempt.input === 'string') {
    const source = presentation.answerFormat === 'input' ? 'input' : 'choice';
    const explanation = buildWrongAnswerExplanation(source, attempt.input, question, controller.questionPool);
    if (explanation?.found && explanation.explanation) card.append(el('p', 'wrong-context', `${explanation.matchedAnswer ?? explanation.value}：${explanation.explanation}`));
  }
  card.append(el('p', 'muted', `${Math.round(attempt.elapsedMs / 100) / 10}秒${attempt.nearMiss ? ' · かなり近い答え' : ''}`));
  const next = button('次へ', 'btn primary');
  let moved = false;
  const move = async (): Promise<void> => {
    if (moved) return;
    moved = true;
    const nextState = await controller.next();
    if (nextState.tag === 'checkpoint') actions.showPhase('checkpoint');
    else if (nextState.tag === 'complete') actions.showPhase('complete');
    else await renderQuestion(root, controller, actions);
  };
  next.onclick = () => void move();
  card.append(next); screen.append(card); root.replaceChildren(screen);
  if (attempt.result === 'correct' && state.session.settings.autoNext) window.setTimeout(() => void move(), 650);
}
