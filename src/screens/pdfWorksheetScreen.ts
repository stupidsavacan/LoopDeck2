import type { LoopDeckPack, ModuleInfo, Question } from '../core/models';
import { createJapaneseToEnglishWorksheetPlan, isJapaneseToEnglishWorksheetQuestion } from '../pdf/worksheetPlanner';
import { buildWorksheetRangeOptions, filterWorksheetQuestionsByRange, formatWorksheetModuleLabel } from '../pdf/worksheetSelection';
import type { ResolvedPackView } from '../packs/packResolver';
import { button, clear, el, toast } from '../ui/dom';

interface WorksheetModuleOption {
  packId: string;
  module: ModuleInfo;
  questions: Question[];
  label: string;
}

function makeOption(value: string, label: string): HTMLOptionElement {
  const option = el('option', '', label) as HTMLOptionElement;
  option.value = value;
  return option;
}

function safeFileStem(value: string): string {
  return value.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'worksheet';
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? '').split(',', 2)[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('PDF could not be read.'));
    reader.readAsDataURL(blob);
  });
}

async function savePdf(blob: Blob, filename: string): Promise<void> {
  if (window.LoopDeckAndroid?.saveFile) {
    window.LoopDeckAndroid.saveFile(filename, 'application/pdf', await blobToBase64(blob));
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getPackQuestionsForModule(pack: LoopDeckPack, module: ModuleInfo): Question[] {
  const questionsById = new Map(pack.questions.map((question) => [question.id, question]));
  return module.questionIds.map((questionId) => questionsById.get(questionId)).filter((question): question is Question => Boolean(question));
}

function supportedQuestions(pack: LoopDeckPack, module: ModuleInfo): Question[] {
  return getPackQuestionsForModule(pack, module).filter(isJapaneseToEnglishWorksheetQuestion);
}

function disambiguateLabels(options: WorksheetModuleOption[]): WorksheetModuleOption[] {
  const labelCounts = new Map<string, number>();
  for (const option of options) labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1);
  return options.map((option) => {
    if ((labelCounts.get(option.label) ?? 0) <= 1) return option;
    return { ...option, label: `${option.label} / ${option.packId}` };
  });
}

function worksheetModuleOptions(packView: ResolvedPackView): WorksheetModuleOption[] {
  const options: WorksheetModuleOption[] = [];
  for (const pack of packView.packs) {
    for (const module of pack.modules) {
      const questions = supportedQuestions(pack, module);
      if (!questions.length) continue;
      options.push({ packId: pack.packId, module, questions, label: formatWorksheetModuleLabel(module, questions) });
    }
  }
  return disambiguateLabels(options);
}

export async function renderPdfWorksheetScreen(root: HTMLElement, packView: ResolvedPackView, navigateHome: () => void): Promise<void> {
  clear(root);
  const modules = worksheetModuleOptions(packView);
  const screen = el('main', 'screen pdf-worksheet-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  header.append(back);

  const intro = el('section', 'hero-card');
  intro.append(
    el('p', 'eyebrow', 'A4 / Japanese to English'),
    el('h1', '', 'PDFプリント作成'),
    el('p', '', '日本語の意味から英語を書く、テスト対策用のA4プリントを作成します。')
  );

  const setup = el('section', 'card setup-card');
  setup.append(el('h2', '', '出力設定'));
  if (!modules.length) {
    setup.append(el('p', 'empty', '出力できる入力式の教材がありません。'));
    screen.append(header, intro, setup);
    root.append(screen);
    return;
  }

  const grid = el('div', 'settings-grid');
  const moduleLabel = el('label', 'field-label');
  const moduleSelect = el('select', 'study-select') as HTMLSelectElement;
  modules.forEach((option, index) => moduleSelect.append(makeOption(String(index), option.label)));
  moduleLabel.append(el('span', '', '教材'), moduleSelect);

  const rangeLabel = el('label', 'field-label');
  const rangeSelect = el('select', 'study-select') as HTMLSelectElement;
  rangeLabel.append(el('span', '', '範囲'), rangeSelect);

  const answerLabel = el('label', 'check-label');
  const includeAnswers = document.createElement('input');
  includeAnswers.type = 'checkbox';
  includeAnswers.checked = true;
  answerLabel.append(includeAnswers, document.createTextNode(' 解答ページを付ける'));

  const summary = el('p', 'hint');
  let selectedQuestions: Question[] = [];

  function selectedModuleOption(): WorksheetModuleOption {
    return modules[Number(moduleSelect.value)] ?? modules[0];
  }

  function refreshRangeOptions(): void {
    const selected = selectedModuleOption();
    rangeSelect.replaceChildren(...buildWorksheetRangeOptions(selected.questions).map((option) => makeOption(option.value, option.label)));
    selectedQuestions = selected.questions;
    refreshSummary();
  }

  function refreshSummary(): void {
    const selected = selectedModuleOption();
    selectedQuestions = filterWorksheetQuestionsByRange(selected.questions, rangeSelect.value || 'all');
    const questionPages = Math.ceil(selectedQuestions.length / 25);
    const totalPages = questionPages * (includeAnswers.checked ? 2 : 1);
    summary.textContent = `${selectedQuestions.length}問 / ${totalPages}ページ。問題ページを先に、解答は後ろに出力します。`;
  }

  moduleSelect.onchange = refreshRangeOptions;
  rangeSelect.onchange = refreshSummary;
  includeAnswers.onchange = refreshSummary;
  refreshRangeOptions();

  grid.append(moduleLabel, rangeLabel);
  setup.append(grid, answerLabel, summary);

  const actions = el('section', 'card action-card');
  const exportButton = button('PDFを書き出す', 'btn primary');
  exportButton.onclick = async () => {
    const selected = selectedModuleOption();
    if (!selectedQuestions.length) {
      toast('出力できる問題がありません。');
      return;
    }
    exportButton.disabled = true;
    exportButton.textContent = 'PDFを作成中...';
    try {
      const plan = createJapaneseToEnglishWorksheetPlan(selected.module, selectedQuestions, includeAnswers.checked);
      const { generateWorksheetPdfBlob } = await import('../pdf/worksheetPdf');
      const pdf = await generateWorksheetPdfBlob(plan);
      await savePdf(pdf, `${safeFileStem(selected.label)}-${safeFileStem(plan.rangeLabel)}.pdf`);
      toast('PDFプリントを書き出しました。');
    } catch (error) {
      toast(`PDF作成に失敗しました：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = 'PDFを書き出す';
    }
  };
  actions.append(exportButton);

  const note = el('section', 'card');
  note.append(el('h2', '', '対応範囲'), el('p', 'hint', 'A4縦・1ページ25問・日本語から英語の入力式問題に対応しています。選択問題・画像問題・逆方向は出力しません。'));

  screen.append(header, intro, setup, actions, note);
  root.append(screen);
}
