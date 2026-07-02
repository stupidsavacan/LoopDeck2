import { clearDebugLogs, formatDebugLogsForCopy, readDebugLogs, writeDebugLog, type DebugLogEntry } from '../debug/debugLog';
import { button, clear, el, toast } from '../ui/dom';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ja-JP', { hour12: false });
}

function renderLogCard(log: DebugLogEntry): HTMLElement {
  const card = el('article', `debug-log-card ${log.level}`);
  const head = el('div', 'debug-log-head');
  head.append(el('strong', '', formatDate(log.timestamp)), el('span', '', `${log.level.toUpperCase()} / ${log.area}`));

  const details = el('div', 'debug-log-details');
  if (log.code) details.append(el('code', '', log.code));
  if (log.userMessage) details.append(el('p', '', log.userMessage));
  if (log.detail) details.append(el('p', 'hint', log.detail));
  if (log.route) details.append(el('small', '', `route: ${log.route}`));
  if (log.stack) {
    const stack = el('pre', 'debug-stack');
    stack.textContent = log.stack;
    details.append(stack);
  }

  card.append(head, details);
  return card;
}

export function renderDebugLogScreen(root: HTMLElement, navigateHome: () => void): void {
  clear(root);
  const logs = readDebugLogs();
  const screen = el('main', 'screen debug-log-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  header.append(back);

  const hero = el('section', 'hero-card');
  hero.append(
    el('p', 'eyebrow', 'Hidden developer tools'),
    el('h1', '', 'デバッグログ'),
    el('p', '', '通常UIには出さない内部エラーコードや例外情報を確認できます。')
  );
  const stats = el('div', 'stats-row');
  stats.append(el('span', '', `${logs.length}件`));
  hero.append(stats);

  const actions = el('section', 'card action-card');
  const copy = button('ログをコピー', 'btn primary');
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(formatDebugLogsForCopy(readDebugLogs()));
      toast('デバッグログをコピーしました。');
    } catch (error) {
      writeDebugLog({
        level: 'error',
        area: 'debugLog',
        code: 'DBG-COPY',
        userMessage: 'コピーできませんでした。',
        detail: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      toast('コピーできませんでした。');
    }
  };

  const clearButton = button('ログを消去', 'btn ghost danger');
  clearButton.onclick = () => {
    if (!window.confirm('ログをすべて消去しますか？')) return;
    clearDebugLogs();
    toast('デバッグログを消去しました。');
    renderDebugLogScreen(root, navigateHome);
  };
  actions.append(copy, clearButton);

  const list = el('section', 'debug-log-list');
  if (!logs.length) {
    list.append(el('p', 'empty', 'まだログはありません。'));
  } else {
    for (const log of logs) list.append(renderLogCard(log));
  }

  screen.append(header, hero, actions, list);
  root.append(screen);
}
