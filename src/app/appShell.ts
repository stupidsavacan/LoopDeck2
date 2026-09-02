import { mainSection, type AppRoute } from './routes';
import { renderBottomNav, type BottomNavSection } from '../ui/bottomNav';

const ROUTES: Record<BottomNavSection, AppRoute> = {
  today: { name: 'today' },
  library: { name: 'library' },
  progress: { name: 'progress', view: 'overview' },
  more: { name: 'more' }
};

export function finishAppShell(root: HTMLElement, route: AppRoute, navigate: (route: AppRoute) => void): void {
  const section = mainSection(route);
  if (!section || route.name === 'study') return;
  const main = root.querySelector<HTMLElement>('main');
  if (!main || main.querySelector('.flow-bottom-nav')) return;
  main.classList.add('with-bottom-nav');
  main.append(renderBottomNav(section, (next) => navigate(ROUTES[next])));
}
