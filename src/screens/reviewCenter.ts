import type { LoopDeckPack, ModuleInfo, Question, StudySettings } from '../core/models';
import { analyzeProblems, buildMistakeQuestions, buildReviewQueue, summarizeWeakModules } from '../core/reviewEngine';
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

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const seconds = (value: number): string => `${Math.round(value / 100) / 10}秒`;

export async function renderReviewCenter(
  root: HTMLElement,
  packs: LoopDeckPack[],
  navigateHome: () => void,
  navigateGraphs: () => void
): Promise<void> {
  clear(root);
  const attempts = await db.getAttempts();
  const questions = allQuestions(packs);
  const mistakes = buildMistakeQuestions(questions, attempts);
  const queue = buildReviewQueue(attempts, questions);
  const analyses = analyzeProblems(attempts, questions).filter((item) => item.needsAttention).slice(0, 12);
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
    el('p', '', '間違い・答え表示・ニアミス・遅い正解を見て、優先度の高い問題から復習します。')
  );
  const stats = el('div', 'stats-row');
  stats.append(
    el('span', '', `復習対象 ${mistakes.length}問`),
    el('span', '', `優先キュー ${queue.length}問`),
    el('span', '', `履歴 ${attempts.length}件`)
  );
  hero.append(stats);

  const actions = el('section', 'card action-card');
  const start = button('優先キューを復習', 'btn primary');
  const clearWrong = button('ミス記録だけ消す', 'btn ghost danger');

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
    const settings: StudySettings = {
      shuffle: true,
      autoNext: true,
      questionLimit: Math.min(20, items.length),
      answerFormat: 'input',
      showExample: true,
      showNumber: true,
      showCategory: true
    };
    const session = createSession(reviewModule, items, settings, 'review');
    const update = (next: QuizSession) => renderInlineQuiz(mount, next, { onSessionChange: update, onComplete: rerender });
    renderInlineQuiz(mount, session, { onSessionChange: update, onComplete: rerender });
  }

  start.onclick = () => startReviewSession(queue.map((item) => item.question), '復習センター');
  clearWrong.onclick = async () => {
    if (!window.confirm('不正解・答え表示の履歴だけ削除します。正解履歴とブックマークは残します。')) return;
    await db.clearWrongAttempts();
    toast('ミス記録を削除しました。');
    rerender();
  };
  actions.append(start, clearWrong, el('p', 'hint', '優先キューは最大20問をシャッフルして始めます。'));

  const queueCard = el('section', 'card');
  queueCard.append(el('h2', '', '優先復習キュー'));
  const queueList = el('div', 'priority-list');
  for (const item of queue.slice(0, 10)) {
    const row = el('div', `priority-row priority-${item.label}`);
    const meta = el('div', 'pack-meta');
    meta.append(
      el('span', '', item.question.prompt),
      el('small', '', `${modules.get(item.question.moduleId)?.title ?? item.question.moduleId} / ${item.label} / score ${item.score}`)
    );
    const one = button('この問題から復習', 'btn');
    one.onclick = () => startReviewSession([item.question], modules.get(item.question.moduleId)?.title ?? '問題別復習', `review-${item.question.id}`);
    row.append(meta, one);
    queueList.append(row);
  }
  if (!queueList.childElementCount) queueList.append(el('p', 'empty', 'まだ優先復習キューはありません。'));
  queueCard.append(queueList);

  const weakCard = el('section', 'card');
  weakCard.append(el('h2', '', 'ミスが多い教材'));
  const list = el('div', 'weak-list');
  const rows = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [currentModuleId, count] of rows) {
    const module = modules.get(currentModuleId);
    const moduleMistakes = mistakes.filter((question) => question.moduleId === currentModuleId);
    if (!moduleMistakes.length) continue;

    const row = el('div', 'weak-row');
    const meta = el('div', 'pack-meta');
    meta.append(el('span', '', module?.title ?? '不明な教材'), el('small', '', `${count}件 / 復習 ${moduleMistakes.length}問`));
    const startModule = button('この教材を復習', 'btn');
    startModule.onclick = () => startReviewSession(moduleMistakes, module?.title ?? '教材別復習', `review-${currentModuleId}`);
    row.append(meta, startModule);
    list.append(row);
  }
  if (!list.childElementCount) {
    list.append(el('p', 'empty', 'まだミス履歴がありません。'));
  }
  weakCard.append(list);

  const analysisCard = el('section', 'card');
  analysisCard.append(el('h2', '', '問題別分析'));
  const analysisList = el('div', 'problem-list');
  for (const item of analyses) {
    const row = el('div', 'problem-row');
    const meta = el('div', 'pack-meta');
    const module = modules.get(item.question.moduleId);
    const tags = el('div', 'tag-row');
    for (const tag of item.mistakeTags.slice(0, 4)) tags.append(el('span', 'tag', tag));
    meta.append(
      el('span', '', item.question.prompt),
      el('small', '', `${module?.title ?? item.question.moduleId} / 正答率 ${percent(item.accuracy)} / 平均 ${seconds(item.averageElapsedMs)} / ${item.priorityLabel}`),
      tags
    );
    row.append(meta);
    analysisList.append(row);
  }
  if (!analysisList.childElementCount) analysisList.append(el('p', 'empty', '分析できる履歴はまだありません。'));
  analysisCard.append(analysisList);

  screen.append(header, hero, actions, queueCard, weakCard, analysisCard, mount);
  root.append(screen);
}
