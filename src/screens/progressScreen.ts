import type { AppRoute } from '../app/routes';
import type { Attempt } from '../core/models';
import type { ModuleSnapshot, FlowScope } from '../flow/models';
import { button, clear, el } from '../ui/dom';
import { renderAppHeader } from '../ui/appHeader';

export function renderProgressScreen(
  root: HTMLElement,
  snapshots: ModuleSnapshot[],
  attempts: Attempt[],
  view: 'overview' | 'attention' | 'history',
  navigate: (route: AppRoute) => void,
  startScope: (scope: FlowScope) => void
): void {
  clear(root);
  const screen = el('main', 'flow-screen progress-screen');
  screen.append(renderAppHeader({ eyebrow: 'PROGRESS', title: view === 'attention' ? '注意するところ' : view === 'history' ? '学習履歴' : '進捗', subtitle: '数字を、次の行動へつなげる' }));
  const tabs = el('div', 'subnav');
  for (const [id, label] of [['overview', '概要'], ['attention', '注意'], ['history', '履歴']] as const) {
    const tab = button(label, `subnav-item${view === id ? ' is-active' : ''}`);
    tab.onclick = () => navigate({ name: 'progress', view: id });
    tabs.append(tab);
  }
  screen.append(tabs);

  if (view === 'overview') {
    const totalCorrect = attempts.filter((attempt) => attempt.result === 'correct').length;
    const overview = el('section', 'metric-grid');
    for (const [value, label] of [[String(attempts.length), '回答'], [`${attempts.length ? Math.round(totalCorrect / attempts.length * 100) : 0}%`, '正答率'], [String(snapshots.reduce((sum, item) => sum + item.attentionCount, 0)), '注意する問題']] as const) {
      const metric = el('div', 'metric'); metric.append(el('strong', '', value), el('span', '', label)); overview.append(metric);
    }
    screen.append(overview);
  }

  if (view === 'history') {
    const history = el('section', 'timeline');
    for (const attempt of [...attempts].sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt)).slice(0, 40)) {
      const row = el('div', 'timeline-row');
      row.append(el('span', `result-dot result-${attempt.result}`), el('div', '', `${attempt.moduleId} · ${attempt.result === 'correct' ? '正解' : attempt.result === 'wrong' ? '不正解' : '答え表示'}`), el('time', 'muted', new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(attempt.answeredAt))));
      history.append(row);
    }
    if (!attempts.length) history.append(el('p', 'empty-state', '問題を解くと、ここに学習の流れが残ります。'));
    screen.append(history);
  } else {
    const ranked = snapshots.filter((item) => item.attemptCount || item.unseenCount).sort((a, b) => b.attentionCount - a.attentionCount || b.attemptCount - a.attemptCount);
    const list = el('section', 'progress-list');
    for (const snapshot of ranked.slice(0, view === 'attention' ? 20 : 8)) {
      const row = el('article', 'progress-row');
      const copy = el('div', 'module-copy');
      copy.append(el('strong', '', snapshot.module.title), el('span', 'muted', snapshot.attentionCount ? `${snapshot.attentionCount}問に注意 · 最近${Math.round(snapshot.recentAccuracy * 100)}%` : `${snapshot.unseenCount}問が未回答`));
      const action = button(snapshot.attentionCount ? '5問やる' : '始める', 'btn secondary small');
      action.onclick = () => startScope({ kind: 'modules', moduleIds: [snapshot.module.id] });
      row.append(copy, action);
      list.append(row);
    }
    if (!ranked.length) list.append(el('p', 'empty-state', 'まだ比較できる学習履歴がありません。'));
    screen.append(list);
  }
  root.append(screen);
}
