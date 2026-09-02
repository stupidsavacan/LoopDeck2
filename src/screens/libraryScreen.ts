import type { AppRoute } from '../app/routes';
import type { ModuleSnapshot } from '../flow/models';
import { button, clear, el } from '../ui/dom';
import { renderAppHeader } from '../ui/appHeader';

export function renderLibraryScreen(root: HTMLElement, snapshots: ModuleSnapshot[], navigate: (route: AppRoute) => void): void {
  clear(root);
  const screen = el('main', 'flow-screen library-screen');
  screen.append(renderAppHeader({ eyebrow: 'LIBRARY', title: '教材', subtitle: `${snapshots.length}教材をローカルに保存` }));
  const search = el('input', 'flow-search') as HTMLInputElement;
  search.type = 'search';
  search.placeholder = '教材名・科目・タグを検索';
  search.setAttribute('aria-label', '教材を検索');
  const list = el('section', 'library-grid');

  const render = (): void => {
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase('ja');
    const filtered = snapshots.filter(({ module }) => !query || [module.title, module.subject, module.description, ...(module.tags ?? [])].filter(Boolean).join(' ').toLocaleLowerCase('ja').includes(query));
    for (const snapshot of filtered) {
      const card = button('', 'library-card');
      const progress = snapshot.totalQuestions ? snapshot.answeredQuestionCount / snapshot.totalQuestions : 0;
      const top = el('div', 'library-card-top');
      top.append(el('span', 'subject-label', snapshot.module.subject), el('span', 'muted', `${snapshot.totalQuestions}問`));
      const meter = el('div', 'thin-meter');
      const fill = el('span') as HTMLSpanElement;
      fill.style.width = `${Math.round(progress * 100)}%`;
      meter.append(fill);
      card.append(top, el('h2', '', snapshot.module.title), el('p', 'muted clamp-2', snapshot.module.description ?? '短いFlowで、この教材を進めます。'), meter);
      const meta = el('div', 'card-meta');
      meta.append(el('span', '', `学習済み ${snapshot.answeredQuestionCount}`), el('span', '', snapshot.attentionCount ? `注意 ${snapshot.attentionCount}` : `未回答 ${snapshot.unseenCount}`));
      card.append(meta);
      card.onclick = () => navigate({ name: 'module', moduleId: snapshot.module.id });
      list.append(card);
    }
    if (!filtered.length) list.append(el('p', 'empty-state', '一致する教材はありません。'));
  };
  search.oninput = render;
  render();
  screen.append(search, list);
  root.append(screen);
}
