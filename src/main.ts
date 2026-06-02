import './styles.css';
import type { LoopDeckPack } from './core/models';
import { loadBuiltinPacks } from './packs/builtinLoader';
import { db } from './storage/db';
import { renderHomeScreen } from './screens/homeScreen';
import { renderModuleScreen } from './screens/moduleScreen';
import { renderReviewCenter } from './screens/reviewCenter';
import { renderImportScreen } from './screens/importScreen';

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('Missing #app root.');
const root: HTMLElement = appRoot;

let packs: LoopDeckPack[] = [];

async function loadPacks(): Promise<void> {
  packs = [...loadBuiltinPacks(), ...(await db.getImportedPacks())];
}

async function showHome(): Promise<void> {
  await loadPacks();
  renderHomeScreen(root, packs, (moduleId) => void showModule(moduleId), () => void showReview(), () => void showImport());
}

async function showModule(moduleId: string): Promise<void> {
  await loadPacks();
  await renderModuleScreen(root, packs, moduleId, () => void showHome(), () => void showReview());
}

async function showReview(): Promise<void> {
  await loadPacks();
  await renderReviewCenter(root, packs, () => void showHome());
}

async function showImport(): Promise<void> {
  await loadPacks();
  renderImportScreen(root, packs, () => void showHome(), async () => {
    await showHome();
  });
}

void showHome();
