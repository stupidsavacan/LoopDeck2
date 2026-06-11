import './styles.css';
import './homeFeatures.css';
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

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('Missing #app root.');
const root: HTMLElement = appRoot;

let packView: ResolvedPackView = resolveActivePacks([]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderStartupError(error: unknown): void {
  const screen = document.createElement('main');
  screen.className = 'screen';
  const card = document.createElement('section');
  card.className = 'hero-card';
  const title = document.createElement('h1');
  title.textContent = 'LoopDeck\u3092\u8d77\u52d5\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f';
  const body = document.createElement('p');
  body.textContent = errorMessage(error);
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = '\u753b\u9762\u304c\u771f\u3063\u767d\u306b\u306a\u3089\u306a\u3044\u3088\u3046\u3001\u8d77\u52d5\u6642\u30a8\u30e9\u30fc\u3092\u8868\u793a\u3057\u3066\u3044\u307e\u3059\u3002\u30a2\u30d7\u30ea\u3092\u518d\u8d77\u52d5\u3057\u3066\u3082\u7d9a\u304f\u5834\u5408\u306f\u3053\u306e\u6587\u9762\u3092\u6559\u3048\u3066\u304f\u3060\u3055\u3044\u3002';
  card.append(title, body, hint);
  screen.append(card);
  root.replaceChildren(screen);
  window.LoopDeckAndroid?.showToast?.('LoopDeck\u306e\u8d77\u52d5\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002');
}

function run(task: () => Promise<void>): void {
  void task().catch(renderStartupError);
}

async function loadPacks(): Promise<void> {
  const loadedPacks = [...loadBuiltinPacks(), ...(await db.getImportedPacks())];
  packView = resolveActivePacks(loadedPacks);
  setActivePackAssetView(packView);
}

function addPdfWorksheetMenuItem(): void {
  const drawer = root.querySelector('.menu-drawer');
  if (!drawer || drawer.querySelector('[data-pdf-worksheet]')) return;
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'menu-item';
  item.dataset.pdfWorksheet = 'true';
  const title = document.createElement('b');
  title.textContent = 'PDF\u30d7\u30ea\u30f3\u30c8\u4f5c\u6210';
  const description = document.createElement('span');
  description.textContent = '\u65e5\u672c\u8a9e\u304b\u3089\u82f1\u8a9e\u306eA4\u8a9e\u5f59\u30d7\u30ea\u30f3\u30c8\u3092\u4f5c\u6210';
  item.append(title, description);
  item.onclick = () => run(showPdfWorksheet);
  drawer.append(item);
}

async function showHome(): Promise<void> {
  await loadPacks();
  renderHomeScreen(
    root,
    packView,
    (moduleId) => run(() => showModule(moduleId)),
    () => run(showReview),
    () => run(showImport),
    () => run(showGraphs)
  );
  addPdfWorksheetMenuItem();
}

async function showModule(moduleId: string): Promise<void> {
  await loadPacks();
  await renderModuleScreen(root, packView, moduleId, () => run(showHome), () => run(showReview), () => run(showGraphs));
}

async function showReview(): Promise<void> {
  await loadPacks();
  await renderReviewCenter(root, packView, () => run(showHome), () => run(showGraphs));
}

async function showImport(): Promise<void> {
  await loadPacks();
  await renderImportScreen(root, packView, () => run(showHome), async () => {
    await showHome();
  });
}

async function showGraphs(): Promise<void> {
  await loadPacks();
  await renderGraphsScreen(root, packView, () => run(showHome), () => run(showReview));
}

async function showPdfWorksheet(): Promise<void> {
  await loadPacks();
  await renderPdfWorksheetScreen(root, packView, () => run(showHome));
}

run(showHome);
