import type { ModuleInfo, Question, StudySettings } from '../core/models';
import {
  canAutoReverseQuestion,
  getModuleStudyQuestionModes,
  getStudyQuestionModeLabel
} from '../core/questionPresentation';
import { buildRangeOptions, createSession, listQuestionCategories, selectSessionQuestions, type QuizSession } from '../core/sessionEngine';
import { getModuleById, getQuestionsForModule, type ResolvedPackView } from '../packs/packResolver';
import { db } from '../storage/db';
import { button, clear, el, toast } from '../ui/dom';
import { renderInlineQuiz } from './inlineQuiz';
import type { AppRoute } from '../app/routes';
import type { FlowScope } from '../flow/models';
import { learningRepository } from '../data/learningRepository';
import { buildModuleSnapshots } from '../flow/snapshots';
import { renderAppHeader } from '../ui/appHeader';

type ToggleSettingKey = 'shuffle' | 'autoNext' | 'autoRevealAfterIdle' | 'showExample' | 'showNumber' | 'showCategory';

export interface StoredSession {
  questionIds: string[];
  index: number;
  mode: 'normal' | 'review';
  settings: StudySettings;
  savedAt: string;
}

function resumeKey(moduleId: string): string {
  return `loopdeck_session_${moduleId}`;
}

export function readStoredSession(moduleId: string, byId: Map<string, Question>): StoredSession | undefined {
  try {
    const raw = localStorage.getItem(resumeKey(moduleId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!Array.isArray(parsed.questionIds) || parsed.index >= parsed.questionIds.length) return undefined;
    if (!parsed.questionIds.every((id) => byId.has(id))) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function saveStoredSession(moduleId: string, session: QuizSession): void {
  const stored: StoredSession = {
    questionIds: session.queue.map((question) => question.id),
    index: session.index,
    mode: session.mode,
    settings: session.settings,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(resumeKey(moduleId), JSON.stringify(stored));
}

function clearStoredSession(moduleId: string): void {
  localStorage.removeItem(resumeKey(moduleId));
}

function makeSelect(labelText: string, className = 'study-select'): { wrap: HTMLElement; select: HTMLSelectElement } {
  const wrap = el('label', 'field-label');
  const label = el('span', '', labelText);
  const select = el('select', className) as HTMLSelectElement;
  wrap.append(label, select);
  return { wrap, select };
}

export function runtimeSettings(settings: StudySettings): StudySettings {
  return {
    ...settings,
    shuffle: false,
    questionLimit: 'all',
    selectedRange: 'all',
    selectedCategory: 'all',
    filter: 'all'
  };
}

export async function renderModuleScreen(
  root: HTMLElement,
  packView: ResolvedPackView,
  moduleId: string,
  navigateHome: () => void,
  navigateReview: () => void,
  navigateGraphs: () => void
): Promise<void> {
  const foundModule = getModuleById(packView, moduleId);
  if (!foundModule) {
    clear(root);
    root.append(el('p', 'empty', '教材が見つかりません。'));
    return;
  }
  const module: ModuleInfo = foundModule;

  const questions = getQuestionsForModule(packView, module);
  const modulePackId = packView.modulePackIdById.get(module.id);
  const sessionQuestionPool = modulePackId
    ? packView.questions.filter((question) => packView.questionPackIdById.get(question.id) === modulePackId)
    : questions;
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const attempts = await db.getAttempts();
  const bookmarks = await db.getBookmarks();
  const wrongIds = new Set(attempts.filter((attempt) => attempt.result !== 'correct').map((attempt) => attempt.questionId));
  const bookmarkIds = new Set(bookmarks);
  const wrongQuestions = questions.filter((question) => wrongIds.has(question.id));
  const bookmarkedQuestions = questions.filter((question) => bookmarkIds.has(question.id));
  const categories = listQuestionCategories(questions);
  const storedSession = readStoredSession(module.id, questionsById);

  clear(root);
  const screen = el('main', 'screen module-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  const navActions = el('div', 'topbar-actions');
  const review = button('復習センター', 'btn ghost');
  review.onclick = navigateReview;
  const graphs = button('グラフ', 'btn ghost');
  graphs.onclick = navigateGraphs;
  navActions.append(review, graphs);
  header.append(back, navActions);

  const info = el('section', 'hero-card');
  info.append(
    el('p', 'eyebrow', module.subject),
    el('h1', '', module.title),
    el('p', '', module.description ?? 'インライン学習でテンポよく進めます。')
  );
  if (module.tags?.length) {
    const tags = el('div', 'tag-row');
    for (const tag of module.tags.slice(0, 4)) tags.append(el('span', 'tag', tag));
    info.append(tags);
  }
  const stats = el('div', 'stats-row');
  stats.append(
    el('span', '', `${questions.length}問`),
    el('span', '', `ミス ${wrongQuestions.length}問`),
    el('span', '', `ブックマーク ${bookmarkedQuestions.length}問`)
  );
  info.append(stats);

  const settings: StudySettings = {
    shuffle: true,
    autoNext: true,
    autoRevealAfterIdle: false,
    questionLimit: 'all',
    selectedRange: 'all',
    selectedCategory: 'all',
    filter: 'all',
    answerFormat: 'auto',
    questionMode: 'as_stored',
    showExample: true,
    showNumber: true,
    showCategory: true
  };

  const settingsCard = el('section', 'card setup-card');
  settingsCard.append(el('h2', '', 'テスト前設定'));
  const settingsGrid = el('div', 'settings-grid');

  const countField = makeSelect('問題数');
  for (const [value, label] of [['10', '10問'], ['20', '20問'], ['50', '50問'], ['all', '全部']] as const) {
    const option = el('option', '', label) as HTMLOptionElement;
    option.value = value;
    countField.select.append(option);
  }
  countField.select.value = 'all';
  countField.select.onchange = () => {
    settings.questionLimit = countField.select.value === 'all' ? 'all' : Number(countField.select.value);
  };

  const rangeField = makeSelect('範囲');
  for (const optionInfo of buildRangeOptions(questions)) {
    const option = el('option', '', optionInfo.label) as HTMLOptionElement;
    option.value = optionInfo.value;
    rangeField.select.append(option);
  }
  const wrongOption = el('option', '', `間違いだけ (${wrongQuestions.length}問)`) as HTMLOptionElement;
  wrongOption.value = 'wrong';
  rangeField.select.append(wrongOption);
  const bookmarkOption = el('option', '', `ブックマーク (${bookmarkedQuestions.length}問)`) as HTMLOptionElement;
  bookmarkOption.value = 'bookmarked';
  rangeField.select.append(bookmarkOption);
  rangeField.select.onchange = () => {
    settings.selectedRange = rangeField.select.value;
  };

  const categoryField = makeSelect('カテゴリ');
  const allCategory = el('option', '', '全部') as HTMLOptionElement;
  allCategory.value = 'all';
  categoryField.select.append(allCategory);
  for (const category of categories) {
    const option = el('option', '', category) as HTMLOptionElement;
    option.value = category;
    categoryField.select.append(option);
  }
  categoryField.select.disabled = categories.length === 0;
  categoryField.select.onchange = () => {
    settings.selectedCategory = categoryField.select.value;
  };

  const answerField = makeSelect('回答形式');
  for (const [value, label] of [['auto', '自動'], ['choice', '4択'], ['input', '入力']] as const) {
    const option = el('option', '', label) as HTMLOptionElement;
    option.value = value;
    answerField.select.append(option);
  }
  answerField.select.onchange = () => {
    settings.answerFormat = answerField.select.value as StudySettings['answerFormat'];
  };

  const questionModeField = makeSelect('出題形式');
  const questionModes = getModuleStudyQuestionModes(questions);
  const sampleQuestion = questions.find((question) => question.sides) ?? questions.find(canAutoReverseQuestion) ?? questions[0];
  for (const mode of questionModes) {
    const option = el('option', '', getStudyQuestionModeLabel(mode, sampleQuestion)) as HTMLOptionElement;
    option.value = mode;
    questionModeField.select.append(option);
  }
  questionModeField.select.value = settings.questionMode ?? 'as_stored';
  questionModeField.select.disabled = questionModes.length <= 1;
  questionModeField.select.onchange = () => {
    settings.questionMode = questionModeField.select.value as StudySettings['questionMode'];
  };

  settingsGrid.append(countField.wrap, rangeField.wrap, categoryField.wrap, answerField.wrap, questionModeField.wrap);
  settingsCard.append(settingsGrid);

  const settingRow = el('div', 'setting-row');
  const toggles: Array<[ToggleSettingKey, string]> = [
    ['shuffle', 'シャッフル'],
    ['autoNext', '正解時に自動で次へ'],
    ['autoRevealAfterIdle', '10秒無操作で答えを表示'],
    ['showExample', '例文表示'],
    ['showNumber', '番号表示'],
    ['showCategory', 'カテゴリ表示']
  ];
  for (const [key, label] of toggles) {
    const wrap = el('label', 'check-label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(settings[key]);
    input.onchange = () => {
      settings[key] = input.checked;
    };
    wrap.append(input, document.createTextNode(` ${label}`));
    settingRow.append(wrap);
  }
  settingsCard.append(settingRow, el('p', 'hint', '通常はシャッフルONで使います。必要なら問題数や範囲を絞れます。'));

  const actions = el('section', 'card action-card');
  const start = button('開始', 'btn primary');
  const quizMount = el('div', 'quiz-mount');

  function rerender(): void {
    void renderModuleScreen(root, packView, moduleId, navigateHome, navigateReview, navigateGraphs);
  }

  function mountSession(session: QuizSession): void {
    saveStoredSession(module.id, session);
    const update = (next: QuizSession) => {
      saveStoredSession(module.id, next);
      mountSession(next);
    };
    renderInlineQuiz(quizMount, session, {
      onSessionChange: update,
      onComplete: () => {
        clearStoredSession(module.id);
        rerender();
      }
    });
  }

  function startSession(baseSettings: StudySettings, mode: 'normal' | 'review'): void {
    const selected = selectSessionQuestions(questions, baseSettings, { wrongQuestionIds: wrongIds, bookmarkedQuestionIds: bookmarkIds });
    if (!selected.length) {
      toast('出題できる問題がありません。');
      return;
    }
    const session = createSession(module, selected, runtimeSettings(baseSettings), mode, sessionQuestionPool);
    mountSession(session);
  }

  start.onclick = () => startSession(settings, 'normal');
  actions.append(start);

  if (storedSession) {
    const resume = button(`再開 (${storedSession.index + 1}/${storedSession.questionIds.length})`, 'btn');
    resume.onclick = () => {
      const restoredQuestions = storedSession.questionIds.map((id) => questionsById.get(id)).filter((question): question is Question => Boolean(question));
      const session = createSession(module, restoredQuestions, runtimeSettings(storedSession.settings), storedSession.mode, sessionQuestionPool);
      mountSession({ ...session, index: storedSession.index });
    };
    actions.append(resume);
  }

  if (wrongQuestions.length) {
    const mistakes = button(`間違いだけ ${wrongQuestions.length}問`, 'btn');
    mistakes.onclick = () => startSession({ ...settings, selectedRange: 'all', filter: 'wrong' }, 'review');
    actions.append(mistakes);
  }

  if (bookmarkedQuestions.length) {
    const bookmark = button(`ブックマーク ${bookmarkedQuestions.length}問`, 'btn');
    bookmark.onclick = () => startSession({ ...settings, selectedRange: 'all', filter: 'bookmarked' }, 'review');
    actions.append(bookmark);
  }

  screen.append(header, info, settingsCard, actions, quizMount);
  root.append(screen);
}

export async function renderFlowModuleScreen(
  root: HTMLElement,
  packView: ResolvedPackView,
  moduleId: string,
  navigate: (route: AppRoute) => void,
  startScope: (scope: FlowScope, budget?: 5 | 10 | 20) => void
): Promise<void> {
  const module = getModuleById(packView, moduleId);
  if (!module) {
    clear(root);
    const screen = el('main', 'flow-screen');
    screen.append(renderAppHeader({ title: '教材が見つかりません', onBack: () => navigate({ name: 'library' }) }), el('p', 'empty-state', '教材パックが更新された可能性があります。'));
    root.append(screen);
    return;
  }
  const data = await learningRepository.readAll();
  const snapshot = buildModuleSnapshots(packView, data).find((item) => item.module.id === moduleId);
  if (!snapshot) return;
  clear(root);
  const screen = el('main', 'flow-screen module-detail-screen');
  screen.append(renderAppHeader({ eyebrow: module.subject, title: module.title, subtitle: module.description, onBack: () => navigate({ name: 'library' }) }));
  const overview = el('section', 'module-hero surface');
  const ring = el('div', 'progress-ring');
  const progress = snapshot.totalQuestions ? Math.round(snapshot.answeredQuestionCount / snapshot.totalQuestions * 100) : 0;
  ring.style.setProperty('--progress', `${progress * 3.6}deg`);
  ring.append(el('strong', '', `${progress}%`), el('span', '', '学習済み'));
  const stats = el('div', 'module-stats');
  for (const [value, label] of [[snapshot.totalQuestions, '問題'], [snapshot.attentionCount, '注意'], [snapshot.bookmarkCount, '保存']] as const) {
    const stat = el('div', 'metric compact'); stat.append(el('strong', '', String(value)), el('span', '', label)); stats.append(stat);
  }
  overview.append(ring, stats);
  const actions = el('div', 'primary-actions');
  const start = button('この教材を5分', 'btn primary'); start.onclick = () => startScope({ kind: 'modules', moduleIds: [moduleId] }, 5);
  const attention = button('苦手だけ', 'btn secondary'); attention.disabled = snapshot.attentionCount === 0; attention.onclick = () => startScope({ kind: 'attention', moduleId }, 5);
  actions.append(start, attention);
  overview.append(actions);
  screen.append(overview);

  const breakdown = el('section', 'section-block');
  breakdown.append(el('div', 'section-heading', 'この教材の状態'));
  const rows: Array<[string, string]> = [
    ['未回答', `${snapshot.unseenCount}問`],
    ['復習予定', `${snapshot.dueCount}問`],
    ['苦手', `${snapshot.weakCount}問`],
    ['直近の正答率', snapshot.attemptCount ? `${Math.round(snapshot.recentAccuracy * 100)}%` : 'まだ記録なし']
  ];
  const list = el('div', 'definition-list');
  for (const [label, value] of rows) { const row = el('div', 'definition-row'); row.append(el('span', '', label), el('strong', '', value)); list.append(row); }
  breakdown.append(list);
  const custom = button('範囲・形式を指定する', 'btn ghost full'); custom.onclick = () => navigate({ name: 'moduleCustom', moduleId });
  breakdown.append(custom);
  screen.append(breakdown);
  root.append(screen);
}
