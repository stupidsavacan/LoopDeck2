import './styles.css';
import './homeFeatures.css';
import './mobileUxFixes.css';
import { registerGlobalErrorLogging, writeDebugLog } from './debug/debugLog';
import { loadBuiltinPacks } from './packs/builtinLoader';
import { setActivePackAssetView } from './packs/packAssetResolver';
import { resolveActivePacks, type ResolvedPackView } from './packs/packResolver';
import { db } from './storage/db';
import { renderHomeScreen } from './screens/homeScreen';
import { renderModuleScreen } from './screens/moduleScreen';
import { renderReviewCenter } from './screens/reviewCenter';
import { renderImportScreen } from './screens/importScreen';
import { renderGraphsScreen } from './screens/graphsScreen';
import { renderPdfWorksheetScreen } from './screens/pdfWorksheetScreen';
import { renderDebugLogScreen } from './screens/debugLogScreen';
import { renderBottomNav, type BottomNavSection } from './ui/bottomNav';
import { button, el } from './ui/dom';
import { renderLoading } from './ui/loading';

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('Missing #app root.');
const root: HTMLElement = appRoot;
const ROUTE_LOADING_DELAY_MS = 2000;

registerGlobalErrorLogging();

let packView: ResolvedPackView = resolveActivePacks([]);

export type AppRoute =
  | { name: 'home' }
  | { name: 'module'; moduleId: string }
  | { name: 'review' }
  | { name: 'import' }
  | { name: 'graphs' }
  | { name: 'pdfWorksheet' }
  | { name: 'debugLog' };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderStartupError(error: unknown): void {
  writeDebugLog({
    level: 'error',
    area: 'startup',
    code: 'APP-STARTUP',
    userMessage: 'LoopDeckを起動できませんでした。',
    detail: errorMessage(error),
    stack: error instanceof Error ? error.stack : undefined
  });

  const screen = document.createElement('main');
  screen.className = 'screen';
  const card = document.createElement('section');
  card.className = 'hero-card';
  const title = document.createElement('h1');
  title.textContent = 'LoopDeckを起動できませんでした';
  const body = document.createElement('p');
  body.textContent = errorMessage(error);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = '画面が真っ白にならないよう、起動時エラーを表示しています。アプリを再起動しても続く場合はこの文面を教えてください。';
  card.append(title, body, hint);
  screen.append(card);
  root.replaceChildren(screen);
  window.LoopDeckAndroid?.showToast?.('LoopDeckの起動に失敗しました。');
}

function run(task: () => Promise<void>): void {
  void task().catch(renderStartupError);
}

async function loadPacks(): Promise<void> {
  const loadedPacks = [...loadBuiltinPacks(), ...(await db.getImportedPacks())];
  packView = resolveActivePacks(loadedPacks);
  setActivePackAssetView(packView);
}

function routeToUrl(route: AppRoute): string {
  switch (route.name) {
    case 'home': return '#home';
    case 'module': return `#module/${encodeURIComponent(route.moduleId)}`;
    case 'review': return '#review';
    case 'import': return '#import';
    case 'graphs': return '#graphs';
    case 'pdfWorksheet': return '#pdf-worksheet';
    case 'debugLog': return '#debug-log';
  }
}

function routeFromUrl(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash || hash === 'home') return { name: 'home' };
  const [routeName, ...parts] = hash.split('/');
  if (routeName === 'module') {
    const encodedId = parts.join('/');
    if (!encodedId) return { name: 'home' };
    try {
      return { name: 'module', moduleId: decodeURIComponent(encodedId) };
    } catch {
      return { name: 'home' };
    }
  }
  if (routeName === 'review') return { name: 'review' };
  if (routeName === 'import') return { name: 'import' };
  if (routeName === 'graphs') return { name: 'graphs' };
  if (routeName === 'pdf-worksheet') return { name: 'pdfWorksheet' };
  if (routeName === 'debug-log') return { name: 'debugLog' };
  return { name: 'home' };
}

function isAppRoute(value: unknown): value is AppRoute {
  if (typeof value !== 'object' || value === null) return false;
  const route = value as Partial<AppRoute>;
  return route.name === 'home' || route.name === 'review' || route.name === 'import' || route.name === 'graphs' || route.name === 'pdfWorksheet' || route.name === 'debugLog' || (route.name === 'module' && typeof route.moduleId === 'string');
}

function loadingMessage(route: AppRoute): string {
  switch (route.name) {
    case 'home': return '教材を読み込んでいます…';
    case 'module': return '教材情報を読み込んでいます…';
    case 'review': return '復習データを読み込んでいます…';
    case 'graphs': return '学習記録を集計しています…';
    case 'import': return '教材データを読み込んでいます…';
    case 'pdfWorksheet': return 'PDF作成画面を準備しています…';
    case 'debugLog': return 'デバッグログを読み込んでいます…';
  }
}

function navigate(route: AppRoute, options: { replace?: boolean } = {}): void {
  const url = routeToUrl(route);
  const sameRoute = window.location.hash === url;
  if (options.replace) history.replaceState(route, '', url);
  else if (!sameRoute) history.pushState(route, '', url);
  run(() => renderRoute(route));
}

function appendMainNavigation(current: BottomNavSection | undefined): void {
  const screen = root.querySelector<HTMLElement>('main.screen');
  if (!screen || screen.querySelector('.bottom-nav')) return;
  screen.append(renderBottomNav(
    current,
    () => navigate({ name: 'home' }),
    () => navigate({ name: 'review' }),
    () => navigate({ name: 'graphs' })
  ));
}

function appendHomeManagementLinks(): void {
  const screen = root.querySelector<HTMLElement>('main.home-screen');
  if (!screen || screen.querySelector('[data-home-management]')) return;

  const management = el('section', 'card management-card');
  management.dataset.homeManagement = 'true';
  management.append(el('h2', '', '教材更新・管理・出力'));
  const actions = el('div', 'update-actions');
  const importButton = button('教材入出力を開く', 'tool-link');
  importButton.onclick = () => navigate({ name: 'import' });
  const pdfButton = button('PDFプリントを作成する', 'tool-link secondary');
  pdfButton.onclick = () => navigate({ name: 'pdfWorksheet' });
  actions.append(importButton, pdfButton);
  management.append(el('p', 'small-note', '教材パックの追加・更新、バックアップ、PDFプリント作成をここにまとめています。'), actions);
  screen.append(management);

  const version = button('LoopDeck v0.1.0', 'version-trigger');
  version.setAttribute('aria-label', 'LoopDeck バージョン情報');
  let tapCount = 0;
  let resetTimer = 0;
  version.onclick = () => {
    tapCount += 1;
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => { tapCount = 0; }, 5000);
    if (tapCount >= 7) {
      tapCount = 0;
      navigate({ name: 'debugLog' });
    }
  };
  screen.append(version);
}

async function renderRoute(route: AppRoute): Promise<void> {
  const loadingTimer = window.setTimeout(() => {
    renderLoading(root, loadingMessage(route));
  }, ROUTE_LOADING_DELAY_MS);
  try {
    if (route.name === 'debugLog') {
      renderDebugLogScreen(root, () => navigate({ name: 'home' }));
      return;
    }

    await loadPacks();

    switch (route.name) {
      case 'home':
        renderHomeScreen(
          root,
          packView,
          (moduleId) => navigate({ name: 'module', moduleId }),
          () => navigate({ name: 'review' }),
          () => navigate({ name: 'import' }),
          () => navigate({ name: 'graphs' })
        );
        appendHomeManagementLinks();
        appendMainNavigation('home');
        return;
      case 'module':
        await renderModuleScreen(root, packView, route.moduleId, () => navigate({ name: 'home' }), () => navigate({ name: 'review' }), () => navigate({ name: 'graphs' }));
        appendMainNavigation('home');
        return;
      case 'review':
        await renderReviewCenter(root, packView, () => navigate({ name: 'home' }), () => navigate({ name: 'graphs' }));
        appendMainNavigation('review');
        return;
      case 'import':
        await renderImportScreen(root, packView, () => navigate({ name: 'home' }), async () => navigate({ name: 'home' }));
        appendMainNavigation(undefined);
        return;
      case 'graphs':
        await renderGraphsScreen(root, packView, () => navigate({ name: 'home' }), () => navigate({ name: 'review' }));
        appendMainNavigation('graphs');
        return;
      case 'pdfWorksheet':
        await renderPdfWorksheetScreen(root, packView, () => navigate({ name: 'home' }));
        appendMainNavigation(undefined);
        return;
    }
  } finally {
    window.clearTimeout(loadingTimer);
  }
}

window.addEventListener('popstate', (event) => {
  const route = isAppRoute(event.state) ? event.state : routeFromUrl();
  run(() => renderRoute(route));
});

const initialRoute = routeFromUrl();
history.replaceState(initialRoute, '', routeToUrl(initialRoute));
navigate(initialRoute, { replace: true });
