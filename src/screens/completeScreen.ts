import type { Attempt } from '../core/models';
import type { FlowSessionRecord } from '../flow/models';
import { button, el } from '../ui/dom';

export function renderCompleteScreen(session: FlowSessionRecord, attempts: Attempt[], onToday: () => void, onProgress: () => void): HTMLElement {
  const sessionAttempts = attempts.filter((attempt) => session.completedAttemptIds.includes(attempt.attemptId));
  const correct = sessionAttempts.filter((attempt) => attempt.result === 'correct').length;
  const accuracy = sessionAttempts.length ? Math.round(correct / sessionAttempts.length * 100) : 0;
  const wrap = el('main', 'player-screen complete-screen');
  const card = el('section', 'complete-card');
  card.append(el('p', 'flow-eyebrow', 'FLOW COMPLETE'), el('div', 'complete-mark', '✓'), el('h1', '', '今日の一歩、完了'), el('p', 'muted', `${sessionAttempts.length}問を学習しました`));
  const metrics = el('div', 'metric-grid complete-metrics');
  for (const [value, label] of [[String(correct), '正解'], [`${accuracy}%`, '正答率'], [String(sessionAttempts.filter((attempt) => attempt.result !== 'correct').length), '次に回す']] as const) {
    const metric = el('div', 'metric'); metric.append(el('strong', '', value), el('span', '', label)); metrics.append(metric);
  }
  const today = button('Todayへ', 'btn primary'); today.onclick = onToday;
  const progress = button('進捗を見る', 'btn ghost'); progress.onclick = onProgress;
  card.append(metrics, today, progress);
  wrap.append(card);
  return wrap;
}
