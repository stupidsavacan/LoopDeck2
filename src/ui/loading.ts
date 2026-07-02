import { el } from './dom';

export function renderLoading(root: HTMLElement, message = '読み込み中です…'): void {
  const screen = el('main', 'screen loading-screen');
  const card = el('section', 'hero-card loading-card');
  const spinner = el('div', 'loading-spinner');
  spinner.setAttribute('aria-hidden', 'true');
  const title = el('h1', '', message);
  const hint = el('p', 'hint', '少しだけお待ちください。画面を準備しています。');
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.append(spinner, title, hint);
  screen.append(card);
  root.replaceChildren(screen);
}
