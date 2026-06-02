import type { LoopDeckPack, ModuleInfo, Question, StudySettings } from '../core/models';
import { buildMistakeQuestions, summarizeWeakModules } from '../core/reviewEngine';
import { createSession, type QuizSession } from '../core/sessionEngine';
import { db } from '../storage/db';
import { button, clear, el, toast } from '../ui/dom';
import { renderInlineQuiz } from './inlineQuiz';

function allQuestions(packs: LoopDeckPack[]): Question[] {
  return packs.flatMap((pack) => pack.questions);
}

function moduleById(packs: LoopDeckPack[]): Map<string, ModuleInfo> {
  return new Map(packs.flatMap((pack) => pack.modules).map((module) => [module.id, module]));
}

export async function renderReviewCenter(
  root: HTMLElement,
  packs: LoopDeckPack[],
  navigateHome: () => void,
  navigateGraphs: () => void
): Promise<void> {
  clear(root);
  const attempts = await db.getAttempts();
  const mistakes = buildMistakeQuestions(allQuestions(packs), attempts);
  const weak = summarizeWeakModules(attempts);
  const modules = moduleById(packs);
  const mount = el('div', 'quiz-mount');

  const screen = el('main', 'screen review-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  const graphs = button('グラフ', 'btn ghost');
  graphs.onclick = navigateGraphs;
  header.append(back, graphs);

  const hero = el('section', 'hero-card');
  hero.append(
    el('p', 'eyebrow', 'Review Loop'),
    el('h1', '', '復習センター'),
    el('p', '', '間違えた問題を全教材から集めて、すぐ復習を始めます。')
  );
  const stats = el('div', 'stats-row');
  stats.append(el('span', '', `復習対象 ${mistakes.length}問`), el('span', '', `履歴 ${attempts.length}件`));
  hero.append(stats);

  const actions = el('section', 'card action-card');
  const start = button('今すぐ復習', 'btn primary');

  function rerender(): void {
    void renderReviewCenter(root, packs, navigateHome, navigateGraphs);
  }

  function startReviewSession(items: Question[], title: string, moduleId = 'review-all'): void {
    if (!items.length) {
      toast('まだ復習対象がありません。');
      return;
    }
    const reviewModule: ModuleInfo = {
      id: moduleId,
      folderId: 'review',
      title,
      subject: '復習',
      questionIds: items.map((question) => question.id)
    };
    const settings: StudySettings = { shuffle: true, autoNext: true, questionLimit: Math.min(20, items.length) };
    const session = createSession(reviewModule, items, settings, 'review');
    const update = (next: QuizSession) => renderInlineQuiz(mount, next, { onSessionChange: update, onComplete: rerender });
    renderInlineQuiz(mount, session, { onSessionChange: update, onComplete: rerender });
  }

  start.onclick = () => startReviewSession(mistakes, '復習センター');
  actions.append(start, el('p', 'hint', '直近のミスから最大20問をシャッフルします。'));

  const weakCard = el('section', 'card');
  weakCard.append(el('h2', '', 'ミスが多い教材'));
  const list = el('div', 'weak-list');
  const rows = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [moduleId, count] of rows) {
    const module = modules.get(moduleId);
    const moduleMistakes = mistakes.filter((question) => question.moduleId === moduleId);
    if (!moduleMistakes.length) continue;

    const row = el('div', 'weak-row');
    const meta = el('div', 'pack-meta');
    meta.append(el('span', '', module?.title ?? '不明な教材'), el('small', '', `${count}件 / 復習 ${moduleMistakes.length}問`));
    const startModule = button('この教材を復習', 'btn');
    startModule.onclick = () => startReviewSession(moduleMistakes, module?.title ?? '教材別復習', `review-${moduleId}`);
    row.append(meta, startModule);
    list.append(row);
  }
  if (!list.childElementCount) {
    list.append(el('p', 'empty', 'まだミス履歴がありません。'));
  }
  weakCard.append(list);

  screen.append(header, hero, actions, weakCard, mount);
  root.append(screen);
}
