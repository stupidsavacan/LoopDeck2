import { buildDailyStudyStats, buildMistakeBreakdown, buildMistakeTrend, buildModuleStudyStats } from '../core/analyticsEngine';
import type { Attempt } from '../core/models';
import { getActiveModules, getActiveQuestions, type ResolvedPackView } from '../packs/packResolver';
import { db } from '../storage/db';
import { button, clear, el } from '../ui/dom';

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const seconds = (value: number): string => `${Math.round(value / 100) / 10}秒`;

function renderHeatmap(root: HTMLElement, attempts: Attempt[]): void {
  const card = el('section', 'card graph-card');
  card.innerHTML = '<h2>学習の継続</h2>';
  const stats = buildDailyStudyStats(attempts, 28);
  if (!attempts.length) {
    card.append(el('p', 'empty', 'まだ学習履歴がありません。問題を解くとここに日別の記録が出ます。'));
    root.append(card);
    return;
  }

  const max = Math.max(1, ...stats.map((item) => item.attempts));
  const grid = el('div', 'heatmap-grid');
  for (const day of stats) {
    const cell = el('span', 'heat-cell') as HTMLSpanElement;
    cell.style.setProperty('--level', String(day.attempts / max));
    cell.title = `${day.date}: ${day.attempts}問 / 正答率 ${percent(day.accuracy)}`;
    cell.setAttribute('aria-label', cell.title);
    grid.append(cell);
  }
  card.append(grid, el('p', 'hint', '直近28日の回答数です。濃い日ほど多く解いています。'));
  root.append(card);
}

function renderModuleStats(root: HTMLElement, attempts: Attempt[], packView: ResolvedPackView): void {
  const stats = buildModuleStudyStats(attempts, getActiveModules(packView)).slice(0, 8);
  const card = el('section', 'card graph-card');
  card.innerHTML = '<h2>正答率と回答速度</h2>';

  if (!stats.length) {
    card.append(el('p', 'empty', 'まだ比較できる回答履歴がありません。'));
    root.append(card);
    return;
  }

  const list = el('div', 'module-stat-list');
  for (const item of stats) {
    const row = el('div', 'module-stat-row');
    const accuracyWidth = `${Math.max(4, Math.round(item.accuracy * 100))}%`;
    row.innerHTML = `
      <div>
        <strong>${item.title}</strong>
        <small>${item.attempts}回 / 平均 ${seconds(item.averageElapsedMs)}</small>
      </div>
      <div class="accuracy-meter"><span style="width:${accuracyWidth}"></span></div>
      <b>${percent(item.accuracy)}</b>
    `;
    list.append(row);
  }
  card.append(list);
  root.append(card);
}

function renderTrend(root: HTMLElement, attempts: Attempt[]): void {
  const trend = buildMistakeTrend(attempts, 14);
  const card = el('section', 'card graph-card');
  card.innerHTML = '<h2>ミスの推移</h2>';

  if (!trend.some((item) => item.mistakes > 0)) {
    card.append(el('p', 'empty', 'まだミス履歴がありません。'));
    root.append(card);
    return;
  }

  const max = Math.max(1, ...trend.map((item) => item.mistakes));
  const bars = el('div', 'trend-bars');
  for (const item of trend) {
    const bar = el('span', 'trend-bar') as HTMLSpanElement;
    bar.style.setProperty('--height', `${Math.max(6, (item.mistakes / max) * 100)}%`);
    bar.title = `${item.date}: ${item.mistakes}件`;
    bar.setAttribute('aria-label', bar.title);
    bars.append(bar);
  }
  card.append(bars, el('p', 'hint', '現時点では、復習キューの近似として日別のミス件数を表示しています。'));
  root.append(card);
}

function renderBreakdown(root: HTMLElement, attempts: Attempt[], packView: ResolvedPackView): void {
  const breakdown = buildMistakeBreakdown(attempts, getActiveQuestions(packView));
  const card = el('section', 'card graph-card');
  card.innerHTML = '<h2>ミスの内訳</h2>';

  if (!breakdown.length) {
    card.append(el('p', 'empty', '分類できるミス履歴がまだありません。'));
    root.append(card);
    return;
  }

  const list = el('div', 'breakdown-list');
  const max = Math.max(1, ...breakdown.map((item) => item.count));
  for (const item of breakdown) {
    const row = el('div', 'breakdown-row');
    row.innerHTML = `
      <span>${item.label}</span>
      <div class="breakdown-meter"><span style="width:${Math.max(8, (item.count / max) * 100)}%"></span></div>
      <strong>${item.count}</strong>
    `;
    list.append(row);
  }
  card.append(list);
  root.append(card);
}

export async function renderGraphsScreen(root: HTMLElement, packView: ResolvedPackView, navigateHome: () => void, navigateReview: () => void): Promise<void> {
  clear(root);
  const attempts = await db.getAttempts();

  const screen = el('main', 'screen graphs-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  const review = button('復習センター', 'btn ghost');
  review.onclick = navigateReview;
  header.append(back, review);

  const hero = el('section', 'hero-card study-hero-card');
  const correct = attempts.filter((attempt) => attempt.result === 'correct').length;
  const mistakes = attempts.filter((attempt) => attempt.result !== 'correct').length;
  hero.innerHTML = `
    <p class="eyebrow">Study Graphs</p>
    <h1>グラフ</h1>
    <p>解いた履歴から、続いている日・正答率・ミスの傾向を軽く見返します。</p>
    <div class="stats-row"><span>${attempts.length}回答</span><span>正解 ${correct}</span><span>ミス ${mistakes}</span></div>
  `;

  const grid = el('section', 'graph-grid');
  renderHeatmap(grid, attempts);
  renderModuleStats(grid, attempts, packView);
  renderTrend(grid, attempts);
  renderBreakdown(grid, attempts, packView);

  screen.append(header, hero, grid);
  root.append(screen);
}
