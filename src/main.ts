import './styles.css';
import './flowStyles.css';
import { finishAppShell } from './app/appShell';
import { AppRouter } from './app/router';
import type { AppRoute } from './app/routes';
import { registerGlobalErrorLogging, writeDebugLog } from './debug/debugLog';
import { learningRepository } from './data/learningRepository';
import { packGateway } from './data/packGateway';
import { settingsRepository } from './data/settingsRepository';
import type { FlowScope, StudyPlan } from './flow/models';
import { PlayerController } from './flow/playerController';
import { readLatestLegacySession } from './flow/legacySessionAdapter';
import { buildModuleSnapshots, buildTodaySnapshot } from './flow/snapshots';
import { buildStudyPlan, createFlowSession } from './flow/studyPlanEngine';
import { renderDebugLogScreen } from './screens/debugLogScreen';
import { renderFocusScreen } from './screens/focusScreen';
import { renderLibraryScreen } from './screens/libraryScreen';
import { renderMoreScreen } from './screens/moreScreen';
import { renderFlowModuleScreen, renderModuleScreen } from './screens/moduleScreen';
import { renderPacksScreen } from './screens/packsScreen';
import { renderPdfWorksheetScreen } from './screens/pdfWorksheetScreen';
import { renderPlayerScreen } from './screens/playerScreen';
import { renderProgressScreen } from './screens/progressScreen';
import { renderTodayScreen } from './screens/todayScreen';
import { button, clear, el, toast } from './ui/dom';
import { renderLoading } from './ui/loading';

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('Missing #app root.');
const root: HTMLElement = appRoot;
registerGlobalErrorLogging();

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function renderFatal(error: unknown): void {
  writeDebugLog({ level: 'error', area: 'startup', code: 'FLOW-STARTUP', userMessage: 'LoopDeck Flowを起動できませんでした。', detail: errorMessage(error), stack: error instanceof Error ? error.stack : undefined });
  clear(root);
  const screen = el('main', 'flow-screen error-screen');
  const card = el('section', 'surface error-surface');
  card.append(el('p', 'flow-eyebrow', 'STARTUP ERROR'), el('h1', '', '起動できませんでした'), el('p', '', errorMessage(error)), el('p', 'muted', 'データベースは削除していません。再読み込みしてもう一度お試しください。'));
  const retry = button('再読み込み', 'btn primary'); retry.onclick = () => window.location.reload(); card.append(retry); screen.append(card); root.append(screen);
  window.LoopDeckAndroid?.showToast?.('LoopDeck Flowの起動に失敗しました。');
}

function applyAppearance(appearance: 'system' | 'light' | 'dark'): void {
  document.documentElement.dataset.theme = appearance === 'system' ? '' : appearance;
  document.documentElement.style.colorScheme = appearance === 'system' ? 'light dark' : appearance;
}

let renderVersion = 0;

const router = new AppRouter(async (route) => {
  const version = ++renderVersion;
  const loading = window.setTimeout(() => { if (version === renderVersion) renderLoading(root, 'Flowを組み立てています…'); }, 500);
  try {
    await renderRoute(route);
    if (version === renderVersion) finishAppShell(root, route, (next) => router.navigate(next));
  } catch (error) {
    if (version === renderVersion) renderFatal(error);
  } finally {
    window.clearTimeout(loading);
  }
});

async function makePlan(scope: FlowScope, budget?: 5 | 10 | 20): Promise<StudyPlan> {
  const [data, preferences, focus] = await Promise.all([learningRepository.readAll(), settingsRepository.getPreferences(), settingsRepository.getFocus()]);
  return buildStudyPlan({
    questions: packGateway.questions,
    attempts: data.attempts,
    reviewCards: data.reviewCards,
    bookmarks: data.bookmarks,
    scope,
    budgetMinutes: budget ?? preferences.defaultBudgetMinutes,
    focusId: focus?.enabled ? focus.focusId : undefined
  });
}

async function startPlan(plan: StudyPlan): Promise<void> {
  if (!plan.queue.length) { toast('この範囲には今すぐ出題できる問題がありません。'); return; }
  const preferences = await settingsRepository.getPreferences();
  const session = createFlowSession(plan, {
    autoNext: preferences.autoNextCorrect,
    autoRevealAfterIdle: preferences.autoRevealAfterIdle,
    showExample: preferences.showExample,
    showNumber: preferences.showNumber,
    showCategory: preferences.showCategory
  });
  await learningRepository.putSession(session);
  router.navigate({ name: 'study', sessionId: session.sessionId, phase: 'player' });
}

async function startScope(scope: FlowScope, budget?: 5 | 10 | 20): Promise<void> { await startPlan(await makePlan(scope, budget)); }

async function resumeSession(sessionId: string): Promise<void> {
  let session = await learningRepository.getSession(sessionId);
  if (!session && sessionId.startsWith('legacy-')) {
    session = readLatestLegacySession(packGateway.activeView);
    if (session) await learningRepository.putSession(session);
  }
  if (!session) { toast('続きのセッションが見つかりません。'); return; }
  router.navigate({ name: 'study', sessionId: session.sessionId, phase: session.phase === 'checkpoint' ? 'checkpoint' : session.phase === 'complete' ? 'complete' : 'player' });
}

async function renderRoute(route: AppRoute): Promise<void> {
  if (route.name === 'debugLog') {
    renderDebugLogScreen(root, () => router.navigate({ name: 'more' }));
    root.querySelector('main')?.classList.add('flow-screen');
    return;
  }

  await packGateway.load();
  const preferences = await settingsRepository.getPreferences();
  applyAppearance(preferences.appearance);

  switch (route.name) {
    case 'today': {
      const snapshot = await buildTodaySnapshot(packGateway.activeView);
      renderTodayScreen(root, snapshot, {
        navigate: (next) => router.navigate(next),
        startPlan: (plan) => void startPlan(plan),
        resume: (sessionId) => void resumeSession(sessionId),
        changeBudget: (minutes) => void settingsRepository.putPreferences({ ...preferences, defaultBudgetMinutes: minutes }).then(() => router.navigate({ name: 'today' }, { replace: true }))
      });
      return;
    }
    case 'library': {
      const snapshots = buildModuleSnapshots(packGateway.activeView, await learningRepository.readAll());
      renderLibraryScreen(root, snapshots, (next) => router.navigate(next));
      return;
    }
    case 'module':
      await renderFlowModuleScreen(root, packGateway.activeView, route.moduleId, (next) => router.navigate(next), (scope, budget) => void startScope(scope, budget));
      return;
    case 'moduleCustom':
      await renderModuleScreen(root, packGateway.activeView, route.moduleId, () => router.navigate({ name: 'module', moduleId: route.moduleId }), () => router.navigate({ name: 'progress', view: 'attention' }), () => router.navigate({ name: 'progress', view: 'overview' }));
      root.querySelector('main')?.classList.add('flow-screen', 'custom-session-screen');
      return;
    case 'progress': {
      const data = await learningRepository.readAll();
      renderProgressScreen(root, buildModuleSnapshots(packGateway.activeView, data), data.attempts, route.view, (next) => router.navigate(next), (scope) => void startScope(scope, 5));
      return;
    }
    case 'more': {
      const focus = await settingsRepository.getFocus();
      renderMoreScreen(root, preferences, focus, (next) => router.navigate(next), (next) => void settingsRepository.putPreferences(next).then(() => router.navigate({ name: 'more' }, { replace: true })));
      return;
    }
    case 'focus': {
      const focus = await settingsRepository.getFocus();
      renderFocusScreen(root, packGateway.modules, focus, () => router.navigate({ name: 'more' }), async (next) => settingsRepository.putFocus(next));
      return;
    }
    case 'packs':
      await renderPacksScreen(root, packGateway.activeView, () => router.navigate({ name: 'more' }), async () => { await packGateway.load(); router.navigate({ name: 'packs', mode: route.mode }, { replace: true }); });
      return;
    case 'pdfWorksheet':
      await renderPdfWorksheetScreen(root, packGateway.activeView, () => router.navigate({ name: 'more' }));
      root.querySelector('main')?.classList.add('flow-screen');
      return;
    case 'study': {
      const session = await learningRepository.getSession(route.sessionId);
      if (!session) { router.navigate({ name: 'today' }, { replace: true }); return; }
      const controller = new PlayerController(session, packGateway, learningRepository);
      await controller.activate();
      await renderPlayerScreen(root, controller, {
        exit: () => router.navigate({ name: 'today' }),
        showPhase: (phase) => router.navigate({ name: 'study', sessionId: route.sessionId, phase }, { replace: true }),
        today: () => router.navigate({ name: 'today' }),
        progress: () => router.navigate({ name: 'progress', view: 'overview' })
      });
      return;
    }
  }
}

router.start();
