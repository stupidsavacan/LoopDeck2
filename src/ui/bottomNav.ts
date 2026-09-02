import { button, el } from './dom';

export type BottomNavSection = 'today' | 'library' | 'progress' | 'more';

const ICONS: Record<BottomNavSection, string> = { today: '◉', library: '▤', progress: '↗', more: '•••' };
const LABELS: Record<BottomNavSection, string> = { today: 'Today', library: '教材', progress: '進捗', more: 'その他' };

export function renderBottomNav(current: BottomNavSection, navigate: (section: BottomNavSection) => void): HTMLElement {
  const nav = el('nav', 'flow-bottom-nav');
  nav.setAttribute('aria-label', '主要ナビゲーション');
  for (const section of Object.keys(LABELS) as BottomNavSection[]) {
    const item = button('', `flow-nav-item${current === section ? ' is-active' : ''}`);
    item.setAttribute('aria-label', LABELS[section]);
    if (current === section) item.setAttribute('aria-current', 'page');
    item.append(el('span', 'flow-nav-icon', ICONS[section]), el('span', 'flow-nav-label', LABELS[section]));
    item.onclick = () => { if (section !== current) navigate(section); };
    nav.append(item);
  }
  return nav;
}
