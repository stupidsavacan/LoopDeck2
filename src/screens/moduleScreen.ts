import type { LoopDeckPack, ModuleInfo, Question, StudySettings } from '../core/models';
import { createSession, type QuizSession } from '../core/sessionEngine';
import { db } from '../storage/db';
import { button, clear, el, toast } from '../ui/dom';
import { renderInlineQuiz } from './inlineQuiz';

function moduleQuestions(packs: LoopDeckPack[], module: ModuleInfo): Question[] {
  const questions = packs.flatMap((pack) => pack.questions);
  const byId = new Map(questions.map((question) => [question.id, question]));
  return module.questionIds.map((id) => byId.get(id)).filter((question): question is Question => Boolean(question));
}

export async function renderModuleScreen(
  root: HTMLElement,
  packs: LoopDeckPack[],
  moduleId: string,
  navigateHome: () => void,
  navigateReview: () => void,
  navigateGraphs: () => void
): Promise<void> {
  clear(root);
  const foundModule = packs.flatMap((pack) => pack.modules).find((item) => item.id === moduleId);
  if (!foundModule) {
    root.append(el('p', 'empty', '教材が見つかりません。'));
    return;
  }
  const module: ModuleInfo = foundModule;

  const questions = moduleQuestions(packs, module);
  const attempts = await db.getAttempts();
  const bookmarks = await db.getBookmarks();
  const wrongIds = new Set(attempts.filter((attempt) => attempt.result !== 'correct').map((attempt) => attempt.questionId));
  const wrongQuestions = questions.filter((question) => wrongIds.has(question.id));
  const bookmarkedQuestions = questions.filter((question) => bookmarks.includes(question.id));

  const screen = el('main', 'screen module-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  const navActions = el('div', 'topbar-actions');
  const review = button('復習センター', 'btn ghost');
  review.onclick = navigateReview;
  const graphs = button('グラフ', 'btn ghost');
  graphs.onclick = navigateGraphs;
  navActions.append(review, graphs);
  header.append(back, navActions);

  const info = el('section', 'hero-card');
  info.append(
    el('p', 'eyebrow', module.subject),
    el('h1', '', module.title),
    el('p', '', module.description ?? '旧StudyHome風のインライン学習で進めます。')
  );
  if (module.tags?.length) {
    const tags = el('div', 'tag-row');
    for (const tag of module.tags.slice(0, 4)) tags.append(el('span', 'tag', tag));
    info.append(tags);
  }
  const stats = el('div', 'stats-row');
  stats.append(
    el('span', '', `${questions.length}問`),
    el('span', '', `ミス ${wrongQuestions.length}問`),
    el('span', '', `ブックマーク ${bookmarkedQuestions.length}問`)
  );
  info.append(stats);

  const settings: StudySettings = { shuffle: true, autoNext: true, questionLimit: 'all' };
  const settingsCard = el('section', 'card');
  settingsCard.append(el('h2', '', '学習の準備'));
  const settingRow = el('div', 'setting-row');
  const shuffleLabel = el('label', 'check-label');
  const shuffleInput = document.createElement('input');
  shuffleInput.type = 'checkbox';
  shuffleInput.checked = true;
  shuffleInput.onchange = () => {
    settings.shuffle = shuffleInput.checked;
  };
  shuffleLabel.append(shuffleInput, document.createTextNode(' シャッフル'));

  const autoNextLabel = el('label', 'check-label');
  const autoNextInput = document.createElement('input');
  autoNextInput.type = 'checkbox';
  autoNextInput.checked = true;
  autoNextInput.onchange = () => {
    settings.autoNext = autoNextInput.checked;
  };
  autoNextLabel.append(autoNextInput, document.createTextNode(' 正解時に自動で次へ'));
  settingRow.append(shuffleLabel, autoNextLabel);
  settingsCard.append(settingRow, el('p', 'hint', '基本はシャッフル前提です。必要なときだけ切り替えられます。'));

  const actions = el('section', 'card action-card');
  const start = button('シャッフルで開始', 'btn primary');
  const quizMount = el('div', 'quiz-mount');

  function rerender(): void {
    void renderModuleScreen(root, packs, moduleId, navigateHome, navigateReview, navigateGraphs);
  }

  function startSession(items: Question[], mode: 'normal' | 'review'): void {
    if (!items.length) {
      toast('出題できる問題がありません。');
      return;
    }
    const session = createSession(module, items, settings, mode);
    const update = (next: QuizSession) => renderInlineQuiz(quizMount, next, { onSessionChange: update, onComplete: rerender });
    renderInlineQuiz(quizMount, session, { onSessionChange: update, onComplete: rerender });
  }

  start.onclick = () => startSession(questions, 'normal');
  actions.append(start);

  if (wrongQuestions.length) {
    const mistakes = button(`間違いだけ ${wrongQuestions.length}問`, 'btn');
    mistakes.onclick = () => startSession(wrongQuestions, 'review');
    actions.append(mistakes);
  }

  if (bookmarkedQuestions.length) {
    const bookmark = button(`ブックマーク ${bookmarkedQuestions.length}問`, 'btn');
    bookmark.onclick = () => startSession(bookmarkedQuestions, 'review');
    actions.append(bookmark);
  }

  screen.append(header, info, settingsCard, actions, quizMount);
  root.append(screen);
}
