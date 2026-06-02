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

export async function renderReviewCenter(root: HTMLElement, packs: LoopDeckPack[], navigateHome: () => void): Promise<void> {
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
  header.append(back);

  const hero = el('section', 'hero-card');
  hero.innerHTML = `
    <p class="eyebrow">Review Loop</p>
    <h1>復習センター</h1>
    <p>間違えた問題を全教材から集めて、すぐ復習を始めます。</p>
    <div class="stats-row"><span>復習対象 ${mistakes.length}問</span><span>履歴 ${attempts.length}件</span></div>
  `;

  const actions = el('section', 'card action-card');
  const start = button('今すぐ復習', 'btn primary');
  start.onclick = () => {
    if (!mistakes.length) {
      toast('まだ復習対象がありません。');
      return;
    }
    const reviewModule: ModuleInfo = {
      id: 'review-all',
      folderId: 'review',
      title: '復習センター',
      subject: 'review',
      questionIds: mistakes.map((question) => question.id)
    };
    const settings: StudySettings = { shuffle: true, autoNext: true, questionLimit: Math.min(20, mistakes.length) };
    const session = createSession(reviewModule, mistakes, settings, 'review');
    const update = (next: QuizSession) => renderInlineQuiz(mount, next, { onSessionChange: update, onComplete: () => renderReviewCenter(root, packs, navigateHome) });
    renderInlineQuiz(mount, session, { onSessionChange: update, onComplete: () => renderReviewCenter(root, packs, navigateHome) });
  };
  actions.append(start);

  const weakCard = el('section', 'card');
  weakCard.innerHTML = '<h2>ミスが多い教材</h2>';
  const list = el('div', 'weak-list');
  const rows = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!rows.length) {
    list.append(el('p', 'empty', 'まだミス履歴がありません。'));
  } else {
    for (const [moduleId, count] of rows) {
      const row = el('div', 'weak-row');
      row.innerHTML = `<span>${modules.get(moduleId)?.title ?? moduleId}</span><strong>${count}件</strong>`;
      list.append(row);
    }
  }
  weakCard.append(list);

  screen.append(header, hero, actions, weakCard, mount);
  root.append(screen);
}
