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
import { appendIconLabel, createUiIcon, iconNameForModule } from '../ui/icons';
import { moduleMeta } from './homeScreen';
import { renderInlineQuiz } from './inlineQuiz';

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
  const header = el('header', 'topbar module-topbar');
  const back = button('', 'btn ghost');
  appendIconLabel(back, 'arrowLeft', 'ホーム');
  back.onclick = navigateHome;
  const review = button('', 'btn ghost');
  appendIconLabel(review, 'review', '復習');
  review.onclick = navigateReview;
  header.append(back, review);

  const info = el('section', 'hero-card module-cover');
  const meta = moduleMeta(module);
  info.style.setProperty('--module-accent', meta.accent);
  info.dataset.coverGlyph = module.title.trim().slice(0, 1);
  const coverIcon = el('div', 'module-cover-icon');
  coverIcon.append(createUiIcon(iconNameForModule(module), 'module-cover-svg'));
  info.append(
    coverIcon,
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

  const actions = el('section', 'card action-card module-secondary-actions');
  const start = button('', 'v2-start');
  appendIconLabel(start, 'arrowRight', '学習を始める', 'end');
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

  const quick = el('section', 'v2-quick-start');
  const quickLabel = el('div', 'v2-quick-label');
  quickLabel.append(el('strong', '', 'Quick Start'), el('span', '', '問題数だけ選んですぐ開始'));
  const lengths = el('div', 'v2-lengths');
  const quickValues: Array<[string, string]> = [['10', '10問'], ['20', '20問'], ['50', '50問'], ['all', '全部']];
  const quickButtons: HTMLButtonElement[] = [];
  const updateQuickSelection = () => {
    for (const item of quickButtons) item.classList.toggle('active', item.dataset.value === countField.select.value);
  };
  for (const [value, label] of quickValues) {
    const quickButton = button(label, 'v2-length');
    quickButton.dataset.value = value;
    quickButton.onclick = () => {
      countField.select.value = value;
      countField.select.dispatchEvent(new Event('change', { bubbles: true }));
      updateQuickSelection();
    };
    quickButtons.push(quickButton);
    lengths.append(quickButton);
  }
  countField.select.addEventListener('change', updateQuickSelection);
  updateQuickSelection();
  quick.append(quickLabel, lengths, start);

  const customize = el('details', 'v2-customize');
  const customizeSummary = el('summary');
  const customizeTitle = el('span', 'v2-customize-title');
  customizeTitle.append(createUiIcon('sliders', 'v2-customize-icon'), document.createTextNode('学習条件をカスタマイズ'));
  customizeSummary.append(customizeTitle);
  customize.append(customizeSummary, settingsCard);

  screen.append(header, info, quick, customize);
  if (actions.childElementCount) screen.append(actions);
  screen.append(quizMount);
  root.append(screen);
}
