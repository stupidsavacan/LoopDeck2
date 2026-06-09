import type { ModuleInfo } from '../core/models';
import { getVisibleBuiltinModules } from '../packs/builtinNormalizer';
import { getActiveModules, type ResolvedPackView } from '../packs/packResolver';
import { button, clear, el } from '../ui/dom';
import { buildHomeFolders, homeModuleMatches, type HomeFolder } from './homeFolders';

type ModuleCardMeta = {
  icon: string;
  accent: string;
  subtitle: string;
  description: string;
  tags: string[];
  folderId: string;
};

const HOME_LAST_MODULE_KEY = 'loopdeck_last_module_v1';
const HOME_IN_PLAYER_KEY = 'loopdeck_in_player_v1';
const FOLDER_STATE_PREFIX = 'loopdeck_folder_open_v1_';

const MODULE_CARD_META: Record<string, ModuleCardMeta> = {
  history: {
    icon: '歴',
    accent: '#2563eb',
    subtitle: '歴史総合 一問一答',
    description: '帝国主義とアジアの民族運動など、歴史総合の重要語句を短く確認します。',
    tags: ['歴史', '社会', 'テスト'],
    folderId: 'term1_midterm'
  },
  geography: {
    icon: '地',
    accent: '#0f766e',
    subtitle: '地理総合 地形・地誌',
    description: '地形ノート、重要語句、図解系の確認に使う地理教材です。',
    tags: ['地理', '社会', '4択'],
    folderId: 'term1_midterm'
  },
  chemistry: {
    icon: '化',
    accent: '#ea580c',
    subtitle: '化学 一問一答',
    description: '化学の重要語句を短い確認でテンポよく進めます。',
    tags: ['化学', '理科', '入力'],
    folderId: 'term1_midterm'
  },
  biology: {
    icon: '生',
    accent: '#16a34a',
    subtitle: '生物 一問一答',
    description: '生物の重要語句を軽いカード学習として使います。',
    tags: ['生物', '理科', '復習'],
    folderId: 'term1_midterm'
  },
  leap: {
    icon: '単',
    accent: '#7c3aed',
    subtitle: '英単語テスト 001-200',
    description: 'LEAP 001〜200。英単語の確認をシャッフルで進めます。',
    tags: ['英単語', '001-200', '中間'],
    folderId: 'term1_midterm'
  },
  leap_final: {
    icon: '単',
    accent: '#6d28d9',
    subtitle: '英単語テスト 201-300',
    description: 'LEAP 201〜300。期末範囲の英単語を確認します。',
    tags: ['英単語', '201-300', '期末'],
    folderId: 'term1_final'
  },
  english_comm: {
    icon: '英',
    accent: '#2563eb',
    subtitle: '英語コミュニケーション',
    description: 'Switch系の単語、本文理解、翻訳問題をまとめた英コミュ教材。',
    tags: ['英コミュ', '本文', '翻訳'],
    folderId: 'term1_midterm'
  },
  kobun_conjugation: {
    icon: '活',
    accent: '#9333ea',
    subtitle: '古文文法 活用識別',
    description: '動詞の活用、識別ルール、古文本文の確認問題。',
    tags: ['古文', '動詞', '活用'],
    folderId: 'term1_midterm'
  },
  english: {
    icon: '英',
    accent: '#0891b2',
    subtitle: '英語表現 暗唱文テスト',
    description: '英文暗記、穴埋め、英作文系の確認教材。',
    tags: ['暗唱', '穴埋め', '英作文'],
    folderId: 'term1_midterm'
  }
};

function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in some embedded contexts.
  }
}

function moduleMeta(module: ModuleInfo): ModuleCardMeta {
  const defaultMeta = MODULE_CARD_META[module.id];
  if (defaultMeta) {
    return {
      ...defaultMeta,
      description: module.description ?? defaultMeta.description,
      tags: module.tags?.slice(0, 4) ?? defaultMeta.tags,
      folderId: module.folderId || defaultMeta.folderId
    };
  }

  return {
    icon: module.title.slice(0, 1) || '教',
    accent: '#2563eb',
    subtitle: module.subject,
    description: module.description ?? 'シャッフルで学習します。',
    tags: module.tags?.slice(0, 4) ?? [module.subject],
    folderId: module.folderId || 'other'
  };
}

function moduleMatches(module: ModuleInfo, query: string): boolean {
  return homeModuleMatches(module, query, moduleMeta(module));
}

function folderOpen(folderId: string): boolean {
  return safeGetStorage(FOLDER_STATE_PREFIX + folderId) !== '0';
}

function setFolderOpen(folderId: string, open: boolean): void {
  safeSetStorage(FOLDER_STATE_PREFIX + folderId, open ? '1' : '0');
}

function displayTags(module: ModuleInfo): string[] {
  const meta = moduleMeta(module);
  return [...meta.tags, `${module.questionIds.length}問`].slice(0, 5);
}

export function renderHomeScreen(
  root: HTMLElement,
  packView: ResolvedPackView,
  onOpenModule: (moduleId: string) => void,
  onOpenReview: () => void,
  onOpenImport: () => void,
  onOpenGraphs: () => void
): void {
  clear(root);
  safeSetStorage(HOME_IN_PLAYER_KEY, '0');
  let query = '';

  const visibleModules = getVisibleBuiltinModules(getActiveModules(packView));
  const modulesById = new Map(visibleModules.map((module) => [module.id, module]));
  const homeFolders = buildHomeFolders(packView.packs, visibleModules);

  const screen = el('main', 'screen home-screen');
  const hero = el('section', 'hero');
  const menuOpen = button('☰', 'menu-open');
  menuOpen.setAttribute('aria-label', 'メニュー');
  const heroCopy = el('div', 'hero-copy');
  heroCopy.append(
    el('h1', '', '学習ホーム'),
    el('p', '', '教材をテストごとのフォルダにまとめたスマホ向けホーム。LoopDeckで軽く、すばやく学習できます。')
  );
  hero.append(menuOpen, heroCopy);

  const menu = el('div', 'utility-menu') as HTMLDivElement;
  menu.hidden = true;
  const backdrop = el('div', 'menu-backdrop');
  const drawer = el('aside', 'menu-drawer');
  drawer.setAttribute('aria-label', 'メニュー');
  const menuHead = el('div', 'menu-head');
  const menuClose = button('×', 'menu-close');
  menuClose.setAttribute('aria-label', '閉じる');
  menuHead.append(el('b', '', 'メニュー'), menuClose);
  const reviewItem = button('', 'menu-item');
  reviewItem.append(el('b', '', '復習センター'), el('span', '', '解答記録から復習候補を自動抽出'));
  reviewItem.onclick = onOpenReview;
  const graphsItem = button('', 'menu-item');
  graphsItem.append(el('b', '', 'グラフ'), el('span', '', '学習の継続、正答率、ミス傾向を見る'));
  graphsItem.onclick = onOpenGraphs;
  const importItem = button('', 'menu-item');
  importItem.append(el('b', '', '教材更新'), el('span', '', '教材パックの取り込み、書き出し、APK案内'));
  importItem.onclick = onOpenImport;
  drawer.append(menuHead, reviewItem, graphsItem, importItem);
  menu.append(backdrop, drawer);
  const closeMenu = () => { menu.hidden = true; };
  menuOpen.onclick = () => { menu.hidden = false; };
  menuClose.onclick = closeMenu;
  backdrop.addEventListener('click', closeMenu);

  const toolbar = el('div', 'toolbar');
  const search = el('input', 'search') as HTMLInputElement;
  search.placeholder = '教材を検索 例：歴史、地理、化学、生物、英単語、英コミュ';
  search.autocomplete = 'off';
  search.setAttribute('aria-label', '教材を検索');
  const showAll = button('全部表示', 'filter');
  toolbar.append(search, showAll);

  const list = el('section', 'folder-list');
  list.setAttribute('aria-label', '教材一覧');

  function openModule(moduleId: string): void {
    safeSetStorage(HOME_LAST_MODULE_KEY, moduleId);
    safeSetStorage(HOME_IN_PLAYER_KEY, '1');
    onOpenModule(moduleId);
  }

  function renderModuleCard(module: ModuleInfo): HTMLButtonElement {
    const meta = moduleMeta(module);
    const card = el('button', 'module-card ready') as HTMLButtonElement;
    card.type = 'button';
    card.style.borderColor = `${meta.accent}33`;
    card.onclick = () => openModule(module.id);

    const top = el('div', 'card-top');
    const icon = el('div', 'module-icon', meta.icon);
    icon.style.background = meta.accent;
    const title = el('div', 'title');
    title.append(el('h2', '', module.title), el('div', 'subtitle', meta.subtitle));
    top.append(icon, title);

    const tags = el('div', 'tags');
    for (const tag of displayTags(module)) tags.append(el('span', 'tag', tag));

    card.append(top, el('p', 'desc', meta.description), tags);
    return card;
  }

  function renderSearchResults(modules: ModuleInfo[]): void {
    clear(list);
    list.className = 'module-grid search-grid';
    for (const module of modules) list.append(renderModuleCard(module));
    if (!modules.length) {
      list.append(el('div', 'empty-state', '該当する教材がありません。'));
    }
  }

  function renderFolder(folder: HomeFolder): HTMLElement | undefined {
    const modules = folder.moduleIds.map((id) => modulesById.get(id)).filter((module): module is ModuleInfo => Boolean(module));
    if (!modules.length) return undefined;

    const isOpen = folderOpen(folder.id);
    const shell = el('section', 'folder-shell');
    const head = button('', 'folder-head');
    head.setAttribute('aria-expanded', String(isOpen));
    const titleBox = el('div', 'folder-titlebox');
    titleBox.append(el('h2', '', folder.title), el('p', '', folder.description));
    const folderTags = el('div', 'folder-tags');
    for (const tag of folder.tags) folderTags.append(el('span', '', tag));
    titleBox.append(folderTags);
    head.append(
      el('div', 'folder-icon', '📁'),
      titleBox,
      el('div', 'folder-count', `${modules.length}件`),
      el('div', 'folder-chevron', isOpen ? '⌃' : '⌄')
    );

    const content = el('div', isOpen ? 'folder-content open' : 'folder-content');
    if (isOpen) for (const module of modules) content.append(renderModuleCard(module));
    head.onclick = () => {
      setFolderOpen(folder.id, !isOpen);
      renderList();
    };
    shell.append(head, content);
    return shell;
  }

  function renderList(): void {
    const modules = visibleModules.filter((module) => moduleMatches(module, query));
    if (query.trim()) {
      renderSearchResults(modules);
      return;
    }

    clear(list);
    list.className = 'folder-list';
    for (const folder of homeFolders) {
      const folderNode = renderFolder(folder);
      if (folderNode) list.append(folderNode);
    }

    if (!list.childElementCount) {
      list.append(el('div', 'empty-state', '表示できる教材がありません。'));
    }
  }

  search.addEventListener('input', () => {
    query = search.value;
    renderList();
  });
  showAll.onclick = () => {
    search.value = '';
    query = '';
    for (const folder of homeFolders) setFolderOpen(folder.id, true);
    renderList();
  };

  const notice = el('div', 'notice');
  notice.append(el('b', '', '使い方：'), document.createTextNode('カードを押すと教材が開きます。戻るときは上の「← ホーム」。'));

  const update = el('details', 'howto');
  const updateBox = el('div', 'update-box');
  const openImport = button('教材入出力を開く', 'tool-link');
  openImport.onclick = onOpenImport;
  updateBox.append(
    el('b', '', '必要なときだけ教材を更新'),
    el('p', 'small-note', '新しい更新パッケージZIPを受け取ったら、ここから読み込めます。APKの署名付き書き出し案内も教材入出力にまとめています。'),
    el('div', 'update-actions')
  );
  updateBox.querySelector('.update-actions')?.append(openImport);
  update.append(el('summary', '', '教材更新'), updateBox);

  screen.append(hero, menu, toolbar, list, notice, update);
  root.append(screen);
  renderList();
}
