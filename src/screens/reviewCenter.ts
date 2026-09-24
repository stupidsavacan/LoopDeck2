import type { ModuleInfo, Question, ReviewCard, StudySettings } from '../core/models';
import {
  analyzeProblems,
  buildMistakeQuestions,
  buildReviewQueue,
  DEFAULT_REVIEW_LOOKBACK_DAYS,
  DEFAULT_REVIEW_SCORE_HALF_LIFE_DAYS,
  filterRecentAttempts,
  summarizeWeakModules
} from '../core/reviewEngine';
import { bucketReviewCards, buildSrsReviewQueue, summarizeReviewSchedule } from '../core/scheduler';
import { createSession, type QuizSession } from '../core/sessionEngine';
import { getActiveQuestions, type ResolvedPackView } from '../packs/packResolver';
import { db } from '../storage/db';
import { button, clear, el, toast } from '../ui/dom';
import { appendIconLabel } from '../ui/icons';
import { renderInlineQuiz } from './inlineQuiz';

const REVIEW_SCOPE_KEY = 'loopdeck_review_scope_session_v1';
type ReviewScope = 'recent' | 'all';

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const seconds = (value: number): string => `${Math.round(value / 100) / 10}秒`;

function questionsForCards(cards: ReviewCard[], questionsById: Map<string, Question>): Question[] {
  return cards.map((card) => questionsById.get(card.questionId)).filter((question): question is Question => Boolean(question));
}

function stat(label: string, value: string | number): HTMLElement {
  return el('span', '', `${label} ${value}`);
}

function readReviewScope(): ReviewScope {
  try {
    return sessionStorage.getItem(REVIEW_SCOPE_KEY) === 'all' ? 'all' : 'recent';
  } catch {
    return 'recent';
  }
}

function writeReviewScope(scope: ReviewScope): void {
  try {
    sessionStorage.setItem(REVIEW_SCOPE_KEY, scope);
  } catch {
    // Storage may be unavailable in embedded/private contexts.
  }
}

function reviewStateLabel(card: ReviewCard): string {
  switch (card.state) {
    case 'learning': return '学習中';
    case 'relearning': return '再学習';
    case 'leech': return '苦手固定';
    case 'mastered': return '習得済み';
    case 'suspended': return '停止中';
    case 'new': return '新規';
    default: return '復習';
  }
}

export async function renderReviewCenter(
  root: HTMLElement,
  packView: ResolvedPackView,
  navigateHome: () => void,
  navigateGraphs: () => void
): Promise<void> {
  const attempts = await db.getAttempts();
  const reviewCards = await db.getReviewCards();
  const questions = getActiveQuestions(packView);
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const modules = packView.moduleById;
  const now = new Date();
  const scope = readReviewScope();

  const recentAttempts = filterRecentAttempts(attempts, now, DEFAULT_REVIEW_LOOKBACK_DAYS);
  const scopedAttempts = scope === 'recent' ? recentAttempts : attempts;
  const activeModuleIds = new Set(scopedAttempts.map((attempt) => attempt.moduleId));
  const recentQuestionIds = new Set(recentAttempts.map((attempt) => attempt.questionId));
  const scopedReviewCards = scope === 'recent'
    ? reviewCards.filter((card) => recentQuestionIds.has(card.questionId))
    : reviewCards;

  const queue = buildReviewQueue(
    scopedAttempts,
    questions,
    scope === 'recent' ? { now, halfLifeDays: DEFAULT_REVIEW_SCORE_HALF_LIFE_DAYS } : {}
  );
  const mistakes = buildMistakeQuestions(questions, scopedAttempts);
  const analyses = analyzeProblems(
    scopedAttempts,
    questions,
    scope === 'recent' ? { now, halfLifeDays: DEFAULT_REVIEW_SCORE_HALF_LIFE_DAYS } : {}
  ).filter((item) => item.needsAttention).slice(0, 8);
  const weak = summarizeWeakModules(scopedAttempts);
  const schedule = summarizeReviewSchedule(scopedReviewCards, now);
  const allSchedule = summarizeReviewSchedule(reviewCards, now);
  const buckets = bucketReviewCards(scopedReviewCards, now);
  const srsQueue = buildSrsReviewQueue(scopedReviewCards, now, 30);
  const hiddenDueCount = scope === 'recent' ? Math.max(0, allSchedule.dueToday - schedule.dueToday) : 0;
  const mount = el('div', 'quiz-mount');

  clear(root);
  const screen = el('main', 'screen review-screen');
  const header = el('header', 'topbar');
  const back = button('', 'btn ghost');
  appendIconLabel(back, 'arrowLeft', 'ホーム');
  back.onclick = navigateHome;
  const graphs = button('', 'btn ghost');
  appendIconLabel(graphs, 'chart', '分析');
  graphs.onclick = navigateGraphs;
  header.append(back, graphs);

  const hero = el('section', 'hero-card');
  hero.append(
    el('p', 'eyebrow', 'REVIEW'),
    el('h1', '', '復習'),
    el(
      'p',
      '',
      scope === 'recent'
        ? `最近${DEFAULT_REVIEW_LOOKBACK_DAYS}日に解いた問題を中心に表示します。古い問題は自動で主画面から外れます。`
        : '過去の教材を含む全履歴を表示しています。'
    )
  );
  const stats = el('div', 'stats-row');
  stats.append(
    stat('今日の復習', `${schedule.dueToday}問`),
    stat(scope === 'recent' ? '最近の弱点' : '全履歴の弱点', `${queue.length}問`),
    stat('対象教材', `${activeModuleIds.size}件`)
  );

  const scopeActions = el('div', 'review-scope-actions');
  const scopeToggle = button(scope === 'recent' ? '過去の教材も表示' : `最近${DEFAULT_REVIEW_LOOKBACK_DAYS}日に戻す`, 'btn ghost');
  scopeToggle.onclick = () => {
    writeReviewScope(scope === 'recent' ? 'all' : 'recent');
    rerender();
  };
  scopeActions.append(scopeToggle);
  if (hiddenDueCount > 0) {
    scopeActions.append(el('span', 'hint', `過去教材の復習予定 ${hiddenDueCount}問は非表示です。`));
  }
  hero.append(stats, scopeActions);

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
    const session = createSession(reviewModule, items, settings, 'review', questions);
    const update = (next: QuizSession) => renderInlineQuiz(mount, next, { onSessionChange: update, onComplete: rerender });
    renderInlineQuiz(mount, session, { onSessionChange: update, onComplete: rerender });
  }

  const srsCard = el('section', 'card action-card');
  srsCard.append(el('h2', '', '今日の復習'));
  const srsStats = el('div', 'stats-row');
  srsStats.append(
    stat('対象', `${schedule.dueToday}問`),
    stat('期限切れ', `${schedule.overdue}問`),
    stat('目安', `${schedule.estimatedMinutes}分`)
  );
  const startSrs = button('今日の復習を始める', 'btn primary');
  startSrs.onclick = () => startReviewSession(questionsForCards(srsQueue, questionsById), '今日の復習', 'srs-due', 30, false);
  srsCard.append(srsStats, startSrs);

  const srsDetails = el('details', 'review-details');
  srsDetails.append(el('summary', '', '内訳・個別メニュー'));
  const detailedStats = el('div', 'stats-row');
  detailedStats.append(
    stat('学習中', `${schedule.learning}問`),
    stat('再学習', `${schedule.relearning}問`),
    stat('苦手固定', `${schedule.leech}問`),
    stat('習得済み', `${schedule.mastered}問`)
  );
  const srsActions = el('div', 'data-actions');
  const overdue = button('期限切れだけ復習', 'btn');
  overdue.onclick = () => startReviewSession(questionsForCards(buckets.overdue, questionsById), '期限切れ復習', 'srs-overdue', 30, false);
  const leech = button('苦手固定だけ復習', 'btn');
  leech.onclick = () => startReviewSession(questionsForCards(buckets.leech, questionsById), '苦手固定復習', 'srs-leech', 30, false);
  const reset = button('復習データをリセット', 'btn ghost danger');
  reset.onclick = async () => {
    if (!window.confirm('SRSのReviewCardとReviewLogを削除します。回答履歴・ブックマーク・教材は残ります。')) return;
    await db.clearReviewData();
    toast('SRS復習データを削除しました。');
    rerender();
  };
  srsActions.append(overdue, leech, reset);
  srsDetails.append(detailedStats, srsActions, el('p', 'hint', '回答結果と回答時間から次回の復習時期を自動調整します。'));
  srsCard.append(srsDetails);

  const weakActionCard = el('section', 'card action-card');
  weakActionCard.append(el('h2', '', scope === 'recent' ? '最近の弱点' : '履歴から見つけた弱点'));
  const startWeak = button('弱点を復習する', 'btn primary');
  startWeak.onclick = () => startReviewSession(queue.map((item) => item.question), '弱点復習', 'history-weak-queue', 20, true);
  weakActionCard.append(
    startWeak,
    el(
      'p',
      'hint',
      scope === 'recent'
        ? `最近${DEFAULT_REVIEW_LOOKBACK_DAYS}日のミス・答え表示・遅い正解を使い、古い記録ほど優先度を下げます。`
        : '全履歴のミス・答え表示・遅い正解から優先度を計算しています。'
    )
  );

  const weakDetails = el('details', 'review-details');
  weakDetails.append(el('summary', '', '履歴データの管理'));
  const clearWrong = button('ミス記録だけ消す', 'btn ghost danger');
  clearWrong.onclick = async () => {
    if (!window.confirm('不正解・答え表示の履歴だけ削除します。正解履歴とブックマークは残します。')) return;
    await db.clearWrongAttempts();
    toast('ミス記録を削除しました。');
    rerender();
  };
  weakDetails.append(clearWrong);
  weakActionCard.append(weakDetails);

  const actionGrid = el('section', 'review-action-grid');
  actionGrid.append(srsCard, weakActionCard);

  const srsListCard = el('section', 'card');
  srsListCard.append(el('h2', '', '今日の候補'));
  const srsList = el('div', 'priority-list');
  for (const card of srsQueue.slice(0, 3)) {
    const question = questionsById.get(card.questionId);
    if (!question) continue;
    const row = el('div', `priority-row priority-${card.state}`);
    const meta = el('div', 'pack-meta');
    meta.append(
      el('span', '', question.prompt),
      el('small', '', `${modules.get(card.moduleId)?.title ?? card.moduleId} / ${reviewStateLabel(card)} / 間隔 ${card.intervalDays}日`)
    );
    const one = button('この問題を復習', 'btn');
    one.onclick = () => startReviewSession([question], modules.get(card.moduleId)?.title ?? '問題別復習', `srs-${card.questionId}`, 1, false);
    row.append(meta, one);
    srsList.append(row);
  }
  if (!srsList.childElementCount) {
    srsList.append(el('p', 'empty', scope === 'recent'
      ? `最近${DEFAULT_REVIEW_LOOKBACK_DAYS}日に解いた問題には、今日の復習予定がありません。`
      : '今日の復習予定はありません。'));
  }
  if (srsQueue.length > 3) srsList.append(el('p', 'hint', `ほか ${srsQueue.length - 3}問。開始すると順番に出題します。`));
  srsListCard.append(srsList);

  const queueCard = el('section', 'card');
  queueCard.append(el('h2', '', scope === 'recent' ? '最近の弱点候補' : '全履歴の弱点候補'));
  const queueList = el('div', 'priority-list');
  for (const item of queue.slice(0, 3)) {
    const row = el('div', `priority-row priority-${item.label}`);
    const meta = el('div', 'pack-meta');
    meta.append(
      el('span', '', item.question.prompt),
      el('small', '', `${modules.get(item.question.moduleId)?.title ?? item.question.moduleId} / ${item.label}`)
    );
    const one = button('この問題から復習', 'btn');
    one.onclick = () => startReviewSession([item.question], modules.get(item.question.moduleId)?.title ?? '問題別復習', `review-${item.question.id}`, 1, false);
    row.append(meta, one);
    queueList.append(row);
  }
  if (!queueList.childElementCount) queueList.append(el('p', 'empty', '今の範囲には弱点候補がありません。'));
  if (queue.length > 3) queueList.append(el('p', 'hint', `ほか ${queue.length - 3}問。弱点復習では上位20問を出題します。`));
  queueCard.append(queueList);

  const listGrid = el('section', 'review-list-grid');
  listGrid.append(srsListCard, queueCard);

  const advanced = el('details', 'card review-analysis');
  advanced.append(el('summary', '', '詳しい分析'));
  const analysisGrid = el('div', 'review-analysis-grid');

  const weakSection = el('section', 'review-subsection');
  weakSection.append(el('h3', '', 'ミスが多い教材'));
  const weakList = el('div', 'weak-list');
  const rows = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 6);
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
    weakList.append(row);
  }
  if (!weakList.childElementCount) weakList.append(el('p', 'empty', 'この範囲にはミス履歴がありません。'));
  weakSection.append(weakList);

  const problemSection = el('section', 'review-subsection');
  problemSection.append(el('h3', '', '問題別分析'));
  const analysisList = el('div', 'problem-list');
  for (const item of analyses) {
    const row = el('div', 'problem-row');
    const meta = el('div', 'pack-meta');
    const module = modules.get(item.question.moduleId);
    const tags = el('div', 'tag-row');
    for (const tag of item.mistakeTags.slice(0, 3)) tags.append(el('span', 'tag', tag));
    meta.append(
      el('span', '', item.question.prompt),
      el('small', '', `${module?.title ?? item.question.moduleId} / 正答率 ${percent(item.accuracy)} / 平均 ${seconds(item.averageElapsedMs)}`),
      tags
    );
    row.append(meta);
    analysisList.append(row);
  }
  if (!analysisList.childElementCount) analysisList.append(el('p', 'empty', '分析できる履歴はありません。'));
  problemSection.append(analysisList);

  analysisGrid.append(weakSection, problemSection);
  advanced.append(analysisGrid);

  screen.append(header, hero, actionGrid, listGrid, advanced, mount);
  root.append(screen);
}
