import type { ModuleInfo } from '../core/models';
import { getVisibleBuiltinModules } from '../packs/builtinNormalizer';
import { getActiveModules, type ResolvedPackView } from '../packs/packResolver';
import { button, clear, el } from '../ui/dom';
import { createUiIcon, iconNameForModule } from '../ui/icons';
import { buildHomeFolders, homeModuleMatches, type HomeFolder } from './homeFolders';

type ModuleCardMeta = {
  accent: string;
  accentColor?: string;
  subtitle: string;
  description: string;
  tags: string[];
};

const HOME_LAST_MODULE_KEY = 'loopdeck_last_module_v1';
const HOME_IN_PLAYER_KEY = 'loopdeck_in_player_v1';
const FOLDER_STATE_PREFIX = 'loopdeck_folder_open_v1_';

const DEFAULT_MODULE_ACCENT = '#2563eb';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const SUBJECT_COLOR_FALLBACKS: Array<{ keywords: string[]; accent: string; accentColor: string }> = [
  { keywords: ['geography', 'geo', '地理'], accent: '#15803D', accentColor: '#DCFCE7' },
  { keywords: ['history', 'historical', '歴史'], accent: '#92400E', accentColor: '#FEF3C7' },
  { keywords: ['biology', 'bio', '生物'], accent: '#16A34A', accentColor: '#DCFCE7' },
  { keywords: ['chemistry', 'chemical', '化学'], accent: '#EA580C', accentColor: '#FFEDD5' },
  { keywords: ['english', 'leap', '英語', '英単語'], accent: '#2563EB', accentColor: '#DBEAFE' },
  { keywords: ['kobun', 'japanese', '古文', '国語'], accent: '#9333EA', accentColor: '#F3E8FF' },
  { keywords: ['math', '数学'], accent: '#0891B2', accentColor: '#CFFAFE' }
];

function validHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  return HEX_COLOR.test(color) ? color : undefined;
}

function hexToRgba(hexColor: string, alpha: number): string {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function inferModuleColors(module: ModuleInfo): { accent: string; accentColor?: string } {
  const haystack = [
    module.id,
    module.title,
    module.subject,
    ...(module.tags ?? [])
  ].join(' ').toLocaleLowerCase();

  const fallback = SUBJECT_COLOR_FALLBACKS.find((entry) => entry.keywords.some((keyword) => haystack.includes(keyword.toLocaleLowerCase())));
  return fallback ? { accent: fallback.accent, accentColor: fallback.accentColor } : { accent: DEFAULT_MODULE_ACCENT };
}

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

export function moduleMeta(module: ModuleInfo): ModuleCardMeta {
  const inferred = inferModuleColors(module);
  return {
    accent: validHexColor(module.color) ?? validHexColor(module.accent) ?? inferred.accent,
    accentColor: validHexColor(module.accentColor) ?? inferred.accentColor,
    subtitle: module.subtitle?.trim() || module.subject,
    description: module.description ?? 'シャッフルで学習します。',
    tags: module.tags?.slice(0, 4) ?? [module.subject]
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
  _onOpenReview: () => void,
  _onOpenImport: () => void,
  _onOpenGraphs: () => void
): void {
  clear(root);
  safeSetStorage(HOME_IN_PLAYER_KEY, '0');
  let query = '';

  const visibleModules = getVisibleBuiltinModules(getActiveModules(packView));
  const modulesById = new Map(visibleModules.map((module) => [module.id, module]));
  const homeFolders = buildHomeFolders(packView.packs, visibleModules);

  const screen = el('main', 'screen home-screen');
  const hero = el('section', 'hero');
  const heroCopy = el('div', 'hero-copy');
  heroCopy.append(
    (() => {
      const heading = el('h1');
      heading.setAttribute('aria-label', '今日は、何を学ぶ？');
      heading.append(el('span', 'home-heading-line', '今日は、'), document.createElement('br'), el('span', 'home-heading-line', '何を学ぶ？'));
      return heading;
    })(),
    el('p', '', '教材を開いたら、あとは問題だけに集中。必要なものを棚から選ぶだけ。')
  );
  hero.append(heroCopy);

  const toolbar = el('div', 'toolbar');
  const search = el('input', 'search') as HTMLInputElement;
  search.placeholder = '教材を検索';
  search.autocomplete = 'off';
  search.setAttribute('aria-label', '教材を検索');
  const showAll = button('すべて', 'filter');
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
    card.style.setProperty('--deck-accent', meta.accent);
    card.style.borderColor = hexToRgba(meta.accent, 0.2);
    if (meta.accentColor) card.style.background = `linear-gradient(180deg, ${meta.accentColor}, rgba(255, 255, 255, 0.94) 70%)`;
    card.onclick = () => openModule(module.id);

    const top = el('div', 'card-top');
    const icon = el('div', 'module-icon');
    icon.style.background = meta.accent;
    icon.append(createUiIcon(iconNameForModule(module), 'deck-icon-svg'));
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
      titleBox,
      el('div', 'folder-count', `${modules.length}件`)
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
  notice.append(el('b', '', '使い方：'), document.createTextNode('カードを押すと教材が開きます。主要画面の移動は下のナビゲーションからできます。'));

  screen.append(hero, toolbar, list, notice);
  root.append(screen);
  renderList();
}
