import type { FolderInfo, LoopDeckPack, ModuleInfo } from '../core/models';
import { getVisibleStudyModules } from '../packs/studyhomeNormalizer';
import { button, clear, el } from '../ui/dom';

function moduleMatches(module: ModuleInfo, query: string): boolean {
  if (!query.trim()) return true;
  const text = `${module.title} ${module.subject} ${(module.tags ?? []).join(' ')}`.toLowerCase();
  return text.includes(query.trim().toLowerCase());
}

function uniqueFolders(packs: LoopDeckPack[]): FolderInfo[] {
  const seen = new Set<string>();
  const folders: FolderInfo[] = [];
  for (const folder of packs.flatMap((pack) => pack.folders)) {
    if (seen.has(folder.id)) continue;
    seen.add(folder.id);
    folders.push(folder);
  }
  return folders;
}

function folderTitle(folder: FolderInfo | undefined, fallbackId: string): string {
  return folder?.title || fallbackId || 'その他';
}

export function renderHomeScreen(
  root: HTMLElement,
  packs: LoopDeckPack[],
  onOpenModule: (moduleId: string) => void,
  onOpenReview: () => void,
  onOpenImport: () => void,
  onOpenGraphs: () => void
): void {
  clear(root);
  let query = '';

  const visibleModules = getVisibleStudyModules(packs.flatMap((pack) => pack.modules));
  const totalQuestions = visibleModules.reduce((sum, module) => sum + module.questionIds.length, 0);

  const screen = el('main', 'screen home-screen');
  const hero = el('section', 'hero');
  const heroCopy = el('div');
  heroCopy.append(
    el('p', 'eyebrow', 'StudyHome rescued deck'),
    el('h1', '', 'LoopDeck'),
    el('p', '', '救出したStudyHome教材を、軽いカード画面からすぐシャッフル学習できるローカル学習デッキ。'),
  );
  const heroStats = el('div', 'stats-row');
  heroStats.append(el('span', '', `${visibleModules.length}教材`), el('span', '', `${totalQuestions}問`));
  heroCopy.append(heroStats);

  const heroActions = el('div', 'hero-actions');
  const review = button('復習センター', 'btn primary');
  review.onclick = onOpenReview;
  const graphs = button('グラフ', 'btn ghost light');
  graphs.onclick = onOpenGraphs;
  const importer = button('教材入出力', 'btn ghost light');
  importer.onclick = onOpenImport;
  heroActions.append(review, graphs, importer);
  hero.append(heroCopy, heroActions);

  const search = el('input', 'search') as HTMLInputElement;
  search.placeholder = '教材を検索';
  search.setAttribute('aria-label', '教材を検索');

  const list = el('div', 'folder-list');

  function renderList(): void {
    clear(list);
    const folders = uniqueFolders(packs);
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    const modules = visibleModules.filter((module) => moduleMatches(module, query));
    const orderedFolderIds = [
      ...folders.map((folder) => folder.id),
      ...modules.map((module) => module.folderId).filter((folderId) => !folderById.has(folderId))
    ].filter((folderId, index, all) => all.indexOf(folderId) === index);

    for (const folderId of orderedFolderIds) {
      const folderModules = modules.filter((module) => module.folderId === folderId);
      if (!folderModules.length) continue;

      const section = el('section', 'folder-section');
      section.append(el('h2', '', folderTitle(folderById.get(folderId), folderId)));
      const grid = el('div', 'module-grid');
      for (const module of folderModules) {
        const card = el('button', 'module-card') as HTMLButtonElement;
        card.type = 'button';
        card.onclick = () => onOpenModule(module.id);
        card.append(
          el('span', 'module-subject', module.subject),
          el('strong', '', module.title),
          el('small', '', module.description ?? 'シャッフルで学習'),
          el('span', 'module-card-footer', `${module.questionIds.length}問`)
        );
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
