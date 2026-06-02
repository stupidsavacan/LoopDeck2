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

export async function renderModuleScreen(root: HTMLElement, packs: LoopDeckPack[], moduleId: string, navigateHome: () => void, navigateReview: () => void): Promise<void> {
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
  const review = button('復習センター', 'btn ghost');
  review.onclick = navigateReview;
  header.append(back, review);

  const info = el('section', 'hero-card');
  info.innerHTML = `
    <p class="eyebrow">${module.subject}</p>
    <h1>${module.title}</h1>
    <p>${module.description ?? '旧StudyHome風のインライン学習で進めます。'}</p>
    <div class="stats-row">
      <span>${questions.length}問</span>
      <span>ミス ${wrongQuestions.length}問</span>
      <span>ブックマーク ${bookmarkedQuestions.length}問</span>
    </div>
  `;

  const settings: StudySettings = { shuffle: true, autoNext: true, questionLimit: 'all' };
  const settingsCard = el('section', 'card');
  settingsCard.innerHTML = `<h2>学習管理</h2>`;
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
  autoNextLabel.append(autoNextInput, document.createTextNode(' 自動で次へ'));
  const note = el('p', 'hint', '基本はシャッフル前提です。必要ならチェックを外せます。');
  settingRow.append(shuffleLabel, autoNextLabel);
  settingsCard.append(settingRow, note);

  const actions = el('section', 'card action-card');
  const start = button('テスト開始', 'btn primary');
  const quizMount = el('div', 'quiz-mount');

  function startSession(items: Question[], mode: 'normal' | 'review'): void {
    if (!items.length) {
      toast('出題できる問題がありません。');
      return;
    }
    const session = createSession(module, items, settings, mode);
    const update = (next: QuizSession) => renderInlineQuiz(quizMount, next, { onSessionChange: update, onComplete: () => renderModuleScreen(root, packs, moduleId, navigateHome, navigateReview) });
    renderInlineQuiz(quizMount, session, { onSessionChange: update, onComplete: () => renderModuleScreen(root, packs, moduleId, navigateHome, navigateReview) });
  }

  start.onclick = () => startSession(questions, 'normal');
  actions.append(start);

  if (wrongQuestions.length) {
    const mistakes = button('間違いだけ', 'btn');
    mistakes.onclick = () => startSession(wrongQuestions, 'review');
    actions.append(mistakes);
  }

  if (bookmarkedQuestions.length) {
    const bookmark = button('ブックマーク', 'btn');
    bookmark.onclick = () => startSession(bookmarkedQuestions, 'review');
    actions.append(bookmark);
  }

  screen.append(header, info, settingsCard, actions, quizMount);
  root.append(screen);
}
