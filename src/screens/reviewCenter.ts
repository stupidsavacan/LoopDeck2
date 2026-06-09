import type { ModuleInfo, Question, ReviewCard, StudySettings } from '../core/models';
import { analyzeProblems, buildMistakeQuestions, buildReviewQueue, summarizeWeakModules } from '../core/reviewEngine';
import { bucketReviewCards, buildSrsReviewQueue, summarizeReviewSchedule } from '../core/scheduler';
import { createSession, type QuizSession } from '../core/sessionEngine';
import { getActiveQuestions, type ResolvedPackView } from '../packs/packResolver';
import { db } from '../storage/db';
import { button, clear, el, toast } from '../ui/dom';
import { renderInlineQuiz } from './inlineQuiz';

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const seconds = (value: number): string => `${Math.round(value / 100) / 10}秒`;

function questionsForCards(cards: ReviewCard[], questionsById: Map<string, Question>): Question[] {
  return cards.map((card) => questionsById.get(card.questionId)).filter((question): question is Question => Boolean(question));
}

function stat(label: string, value: string | number): HTMLElement {
  const item = el('span', '', `${label} ${value}`);
  return item;
}

export async function renderReviewCenter(
  root: HTMLElement,
  packView: ResolvedPackView,
  navigateHome: () => void,
  navigateGraphs: () => void
): Promise<void> {
  clear(root);
  const attempts = await db.getAttempts();
  const reviewCards = await db.getReviewCards();
  const questions = getActiveQuestions(packView);
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const mistakes = buildMistakeQuestions(questions, attempts);
  const queue = buildReviewQueue(attempts, questions);
  const analyses = analyzeProblems(attempts, questions).filter((item) => item.needsAttention).slice(0, 12);
  const weak = summarizeWeakModules(attempts);
  const modules = packView.moduleById;
  const schedule = summarizeReviewSchedule(reviewCards);
  const buckets = bucketReviewCards(reviewCards);
  const srsQueue = buildSrsReviewQueue(reviewCards, new Date(), 30);
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
    el('p', '', 'SRSの復習予定と、解答履歴から見つけた弱点キューを分けて確認できます。')
  );
  const stats = el('div', 'stats-row');
  stats.append(
    stat('今日のSRS復習', `${schedule.dueToday}問`),
    stat('履歴ベース弱点', `${queue.length}問`),
    stat('回答履歴', `${attempts.length}件`)
  );
  hero.append(stats);

  function rerender(): void {
    void renderReviewCenter(root, packView, navigateHome, navigateGraphs);
  }

  function startReviewSession(items: Question[], title: string, moduleId = 'review-all', limit = 20, shuffle = true): void {
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
      shuffle,
      autoNext: true,
      questionLimit: Math.min(limit, items.length),
      answerFormat: 'input',
      showExample: true,
      showNumber: true,
      showCategory: true
    };
    const session = createSession(reviewModule, items, settings, 'review');
    const update = (next: QuizSession) => renderInlineQuiz(mount, next, { onSessionChange: update, onComplete: rerender });
    renderInlineQuiz(mount, session, { onSessionChange: update, onComplete: rerender });
  }

  const srsCard = el('section', 'card action-card');
  srsCard.append(el('h2', '', 'SRS due review'));
  const srsStats = el('div', 'stats-row');
  srsStats.append(
    stat('今日', `${schedule.dueToday}問`),
    stat('期限切れ', `${schedule.overdue}問`),
    stat('Learning', `${schedule.learning}問`),
    stat('Relearning', `${schedule.relearning}問`),
    stat('Leech', `${schedule.leech}問`),
    stat('Mastered', `${schedule.mastered}問`),
    stat('推定', `${schedule.estimatedMinutes}分`)
  );

  const srsActions = el('div', 'data-actions');
  const startSrs = button('今日の復習を始める', 'btn primary');
  startSrs.onclick = () => startReviewSession(questionsForCards(srsQueue, questionsById), 'SRS 今日の復習', 'srs-due', 30, false);
  const overdue = button('期限切れだけ復習', 'btn');
  overdue.onclick = () => startReviewSession(questionsForCards(buckets.overdue, questionsById), 'SRS 期限切れ', 'srs-overdue', 30, false);
  const leech = button('苦手固定だけ復習', 'btn');
  leech.onclick = () => startReviewSession(questionsForCards(buckets.leech, questionsById), 'SRS 苦手固定', 'srs-leech', 30, false);
  const reset = button('復習データをリセット', 'btn ghost danger');
  reset.onclick = async () => {
    if (!window.confirm('SRSのReviewCardとReviewLogを削除します。回答履歴・ブックマーク・教材は残ります。')) return;
    await db.clearReviewData();
    toast('SRS復習データを削除しました。');
    rerender();
  };
  srsActions.append(startSrs, overdue, leech, reset);
  srsCard.append(srsStats, srsActions, el('p', 'hint', 'SRSは回答結果と回答時間から自動で again / hard / good / easy を推定します。評価ボタンは表示しません。'));

  const actions = el('section', 'card action-card');
  actions.append(el('h2', '', 'History-based weak queue'));
  const start = button('履歴ベースの弱点キューを復習', 'btn primary');
  const clearWrong = button('ミス記録だけ消す', 'btn ghost danger');
  start.onclick = () => startReviewSession(queue.map((item) => item.question), '履歴ベース弱点キュー', 'history-weak-queue', 20, true);
  clearWrong.onclick = async () => {
    if (!window.confirm('不正解・答え表示の履歴だけ削除します。正解履歴とブックマークは残します。')) return;
    await db.clearWrongAttempts();
    toast('ミス記録を削除しました。');
    rerender();
  };
  actions.append(start, clearWrong, el('p', 'hint', '履歴ベース弱点キューは、ミス・答え表示・ニアミス・遅い正解などから優先度を計算します。'));

  const srsListCard = el('section', 'card');
  srsListCard.append(el('h2', '', '今日のSRS候補'));
  const srsList = el('div', 'priority-list');
  for (const card of srsQueue.slice(0, 10)) {
    const question = questionsById.get(card.questionId);
    if (!question) continue;
    const row = el('div', `priority-row priority-${card.state}`);
    const meta = el('div', 'pack-meta');
    meta.append(
      el('span', '', question.prompt),
      el('small', '', `${modules.get(card.moduleId)?.title ?? card.moduleId} / ${card.state} / interval ${card.intervalDays}日 / ease ${Math.round(card.ease * 100) / 100}`)
    );
    const one = button('この問題を復習', 'btn');
    one.onclick = () => startReviewSession([question], modules.get(card.moduleId)?.title ?? '問題別復習', `srs-${card.questionId}`, 1, false);
    row.append(meta, one);
    srsList.append(row);
  }
  if (!srsList.childElementCount) srsList.append(el('p', 'empty', '今日のSRS復習はまだありません。問題を解くと復習予定が作られます。'));
  srsListCard.append(srsList);

  const queueCard = el('section', 'card');
  queueCard.append(el('h2', '', '履歴ベース弱点キュー'));
  const queueList = el('div', 'priority-list');
  for (const item of queue.slice(0, 10)) {
    const row = el('div', `priority-row priority-${item.label}`);
    const meta = el('div', 'pack-meta');
    meta.append(
      el('span', '', item.question.prompt),
      el('small', '', `${modules.get(item.question.moduleId)?.title ?? item.question.moduleId} / ${item.label} / score ${item.score}`)
    );
    const one = button('この問題から復習', 'btn');
    one.onclick = () => startReviewSession([item.question], modules.get(item.question.moduleId)?.title ?? '問題別復習', `review-${item.question.id}`, 1, false);
    row.append(meta, one);
    queueList.append(row);
  }
  if (!queueList.childElementCount) queueList.append(el('p', 'empty', 'まだ履歴ベース弱点キューはありません。'));
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
    startModule.onclick = () => startReviewSession(moduleMistakes, module?.title ?? '教材別復習', `review-${currentModuleId}`, 20, true);
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

  screen.append(header, hero, srsCard, actions, srsListCard, queueCard, weakCard, analysisCard, mount);
  root.append(screen);
}
