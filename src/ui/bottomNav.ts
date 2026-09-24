import { button, el } from './dom';
import { createUiIcon, type UiIconName } from './icons';

export type BottomNavSection = 'home' | 'review' | 'graphs';

interface BottomNavItem {
  id: BottomNavSection;
  label: string;
  icon: UiIconName;
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
    { id: 'home', label: 'ホーム', icon: 'home', action: navigateHome },
    { id: 'review', label: '復習', icon: 'review', action: navigateReview },
    { id: 'graphs', label: '分析', icon: 'chart', action: navigateGraphs }
  ];

  for (const item of items) {
    const navButton = button('', current === item.id ? 'bottom-nav-item active' : 'bottom-nav-item');
    navButton.setAttribute('aria-label', item.label);
    if (current === item.id) navButton.setAttribute('aria-current', 'page');

    const icon = el('span', 'bottom-nav-icon');
    icon.append(createUiIcon(item.icon, 'bottom-nav-svg'));
    navButton.append(icon, el('span', 'bottom-nav-label', item.label));
    navButton.onclick = () => {
      if (current !== item.id) item.action();
    };
    nav.append(navButton);
  }

  return nav;
}
