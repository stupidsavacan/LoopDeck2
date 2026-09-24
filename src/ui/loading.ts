import { el } from './dom';

export function renderLoading(root: HTMLElement, message = '読み込み中です…'): void {
  const screen = el('main', 'screen loading-screen');
  const card = el('section', 'editorial-system-state loading-card');
  const mark = el('div', 'system-state-mark', 'LD');
  mark.setAttribute('aria-hidden', 'true');
  const spinner = el('div', 'loading-spinner');
  spinner.setAttribute('aria-hidden', 'true');
  const copy = el('div', 'system-state-copy');
  copy.append(
    el('p', 'eyebrow', 'LOOPDECK'),
    el('h1', '', message),
    el('p', 'hint', '画面を準備しています。')
  );
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.append(mark, spinner, copy);
  screen.append(card);
  root.replaceChildren(screen);
}
