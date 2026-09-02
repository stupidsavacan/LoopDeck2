import type { ResolvedPackView } from '../packs/packResolver';
import { renderImportScreen } from './importScreen';

export async function renderPacksScreen(root: HTMLElement, view: ResolvedPackView, onBack: () => void, onChanged: () => Promise<void>): Promise<void> {
  await renderImportScreen(root, view, onBack, onChanged);
  const screen = root.querySelector<HTMLElement>('main');
  screen?.classList.add('flow-screen', 'packs-screen');
  screen?.classList.remove('screen');
  const hero = screen?.querySelector<HTMLElement>('.hero-card');
  hero?.classList.add('surface', 'packs-hero');
  const title = hero?.querySelector('h1');
  if (title) title.textContent = '教材パック';
  const back = screen?.querySelector<HTMLButtonElement>('.topbar button');
  if (back) { back.textContent = '←'; back.className = 'icon-button'; back.setAttribute('aria-label', 'その他へ戻る'); }
}
