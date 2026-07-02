import { button, el } from './dom';

export type BottomNavSection = 'home' | 'review' | 'graphs';

interface BottomNavItem {
  id: BottomNavSection;
  label: string;
  icon: string;
  action: () => void;
}

export function renderBottomNav(
  current: BottomNavSection | undefined,
  navigateHome: () => void,
  navigateReview: () => void,
  navigateGraphs: () => void
): HTMLElement {
  const nav = el('nav', 'bottom-nav');
  nav.setAttribute('aria-label', '主要ナビゲーション');

  const items: BottomNavItem[] = [
    { id: 'home', label: '学習ホーム', icon: '⌂', action: navigateHome },
    { id: 'review', label: '復習', icon: '↻', action: navigateReview },
    { id: 'graphs', label: 'グラフ', icon: '▥', action: navigateGraphs }
  ];

  for (const item of items) {
    const navButton = button('', current === item.id ? 'bottom-nav-item active' : 'bottom-nav-item');
    navButton.setAttribute('aria-label', item.label);
    if (current === item.id) navButton.setAttribute('aria-current', 'page');
    navButton.append(el('span', 'bottom-nav-icon', item.icon), el('span', 'bottom-nav-label', item.label));
    navButton.onclick = () => {
      if (current !== item.id) item.action();
    };
    nav.append(navButton);
  }

  return nav;
}
