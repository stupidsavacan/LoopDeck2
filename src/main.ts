import './styles.css';
import './homeFeatures.css';
import type { LoopDeckPack } from './core/models';
import { loadBuiltinPacks } from './packs/builtinLoader';
import { db } from './storage/db';
import { renderHomeScreen } from './screens/homeScreen';
import { renderModuleScreen } from './screens/moduleScreen';
import { renderReviewCenter } from './screens/reviewCenter';
import { renderImportScreen } from './screens/importScreen';
import { renderGraphsScreen } from './screens/graphsScreen';

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('Missing #app root.');
const root: HTMLElement = appRoot;

let packs: LoopDeckPack[] = [];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderStartupError(error: unknown): void {
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
  packs = [...loadBuiltinPacks(), ...(await db.getImportedPacks())];
}

async function showHome(): Promise<void> {
  await loadPacks();
  renderHomeScreen(
    root,
    packs,
    (moduleId) => run(() => showModule(moduleId)),
    () => run(showReview),
    () => run(showImport),
    () => run(showGraphs)
  );
}

async function showModule(moduleId: string): Promise<void> {
  await loadPacks();
  await renderModuleScreen(root, packs, moduleId, () => run(showHome), () => run(showReview), () => run(showGraphs));
}

async function showReview(): Promise<void> {
  await loadPacks();
  await renderReviewCenter(root, packs, () => run(showHome), () => run(showGraphs));
}

async function showImport(): Promise<void> {
  await loadPacks();
  await renderImportScreen(root, packs, () => run(showHome), async () => {
    await showHome();
  });
}

async function showGraphs(): Promise<void> {
  await loadPacks();
  await renderGraphsScreen(root, packs, () => run(showHome), () => run(showReview));
}

run(showHome);
