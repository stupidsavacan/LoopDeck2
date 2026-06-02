import type { LoopDeckPack, ModuleInfo } from '../core/models';
import { button, clear, el } from '../ui/dom';

function moduleMatches(module: ModuleInfo, query: string): boolean {
  if (!query.trim()) return true;
  const text = `${module.title} ${module.subject} ${(module.tags ?? []).join(' ')}`.toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

export function renderHomeScreen(
  root: HTMLElement,
  packs: LoopDeckPack[],
  onOpenModule: (moduleId: string) => void,
  onOpenReview: () => void,
  onOpenImport: () => void
): void {
  clear(root);
  let query = '';

  const screen = el('main', 'screen');
  const hero = el('section', 'hero');
  hero.innerHTML = `
    <div>
      <p class="eyebrow">StudyHome successor</p>
      <h1>LoopDeck</h1>
      <p>教材を入れて、解いて、間違いを復習に回すローカル学習デッキ。</p>
    </div>
  `;
  const heroActions = el('div', 'hero-actions');
  const review = button('復習センター', 'btn primary');
  review.onclick = onOpenReview;
  const importer = button('教材追加', 'btn ghost light');
  importer.onclick = onOpenImport;
  heroActions.append(review, importer);
  hero.append(heroActions);

  const search = el('input', 'search') as HTMLInputElement;
  search.placeholder = '教材を検索';

  const list = el('div', 'folder-list');

  function renderList(): void {
    clear(list);
    const folders = packs.flatMap((pack) => pack.folders);
    const modules = packs.flatMap((pack) => pack.modules).filter((module) => moduleMatches(module, query));

    for (const folder of folders) {
      const folderModules = modules.filter((module) => module.folderId === folder.id);
      if (!folderModules.length) continue;

      const section = el('section', 'folder-section');
      section.innerHTML = `<h2>${folder.title}</h2>`;
      const grid = el('div', 'module-grid');
      for (const module of folderModules) {
        const card = el('button', 'module-card') as HTMLButtonElement;
        card.type = 'button';
        card.innerHTML = `
          <span class="module-subject">${module.subject}</span>
          <strong>${module.title}</strong>
          <small>${module.questionIds.length}問 ${module.tags?.map((tag) => `#${tag}`).join(' ') ?? ''}</small>
        `;
        card.onclick = () => onOpenModule(module.id);
        grid.append(card);
      }
      section.append(grid);
      list.append(section);
    }

    if (!list.childElementCount) {
      list.append(el('p', 'empty', '該当する教材がありません。'));
    }
  }

  search.addEventListener('input', () => {
    query = search.value;
    renderList();
  });

  screen.append(hero, search, list);
  root.append(screen);
  renderList();
}
