import type { ModuleInfo, Question } from '../core/models';
import { buildRangeOptions, filterStudyQuestions } from '../core/sessionEngine';
import { createJapaneseToEnglishWorksheetPlan, isJapaneseToEnglishWorksheetQuestion } from '../pdf/worksheetPlanner';
import { getActiveModules, getQuestionsForModule, type ResolvedPackView } from '../packs/packResolver';
import { button, clear, el, toast } from '../ui/dom';

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

function supportedQuestions(packView: ResolvedPackView, module: ModuleInfo): Question[] {
  return getQuestionsForModule(packView, module).filter(isJapaneseToEnglishWorksheetQuestion);
}

export async function renderPdfWorksheetScreen(root: HTMLElement, packView: ResolvedPackView, navigateHome: () => void): Promise<void> {
  clear(root);
  const modules = getActiveModules(packView).filter((module) => supportedQuestions(packView, module).length > 0);
  const screen = el('main', 'screen pdf-worksheet-screen');
  const header = el('header', 'topbar');
  const back = button('\u2190 \u30db\u30fc\u30e0', 'btn ghost');
  back.onclick = navigateHome;
  header.append(back);

  const intro = el('section', 'hero-card');
  intro.append(
    el('p', 'eyebrow', 'A4 / Japanese to English'),
    el('h1', '', 'PDF\u30d7\u30ea\u30f3\u30c8\u4f5c\u6210'),
    el('p', '', '\u65e5\u672c\u8a9e\u306e\u610f\u5473\u304b\u3089\u82f1\u8a9e\u3092\u66f8\u304f\u3001\u30c6\u30b9\u30c8\u5bfe\u7b56\u7528\u306eA4\u30d7\u30ea\u30f3\u30c8\u3092\u4f5c\u6210\u3057\u307e\u3059\u3002')
  );

  const setup = el('section', 'card setup-card');
  setup.append(el('h2', '', '\u51fa\u529b\u8a2d\u5b9a'));
  if (!modules.length) {
    setup.append(el('p', 'empty', '\u51fa\u529b\u3067\u304d\u308b\u5165\u529b\u5f0f\u306e\u6559\u6750\u304c\u3042\u308a\u307e\u305b\u3093\u3002'));
    screen.append(header, intro, setup);
    root.append(screen);
    return;
  }

  const grid = el('div', 'settings-grid');
  const moduleLabel = el('label', 'field-label');
  const moduleSelect = el('select', 'study-select') as HTMLSelectElement;
  for (const module of modules) moduleSelect.append(makeOption(module.id, `${module.title} (${supportedQuestions(packView, module).length}\u554f)`));
  moduleLabel.append(el('span', '', '\u6559\u6750'), moduleSelect);

  const rangeLabel = el('label', 'field-label');
  const rangeSelect = el('select', 'study-select') as HTMLSelectElement;
  rangeLabel.append(el('span', '', '\u7bc4\u56f2'), rangeSelect);

  const answerLabel = el('label', 'check-label');
  const includeAnswers = document.createElement('input');
  includeAnswers.type = 'checkbox';
  includeAnswers.checked = true;
  answerLabel.append(includeAnswers, document.createTextNode(' \u89e3\u7b54\u30da\u30fc\u30b8\u3092\u4ed8\u3051\u308b'));

  const summary = el('p', 'hint');
  let selectedQuestions: Question[] = [];

  function refreshRangeOptions(): void {
    const module = modules.find((item) => item.id === moduleSelect.value) ?? modules[0];
    const questions = supportedQuestions(packView, module);
    rangeSelect.replaceChildren(...buildRangeOptions(questions).map((option) => makeOption(option.value, option.label)));
    selectedQuestions = questions;
    refreshSummary();
  }

  function refreshSummary(): void {
    const module = modules.find((item) => item.id === moduleSelect.value) ?? modules[0];
    const questions = supportedQuestions(packView, module);
    selectedQuestions = filterStudyQuestions(questions, { shuffle: false, autoNext: false, questionLimit: 'all', selectedRange: rangeSelect.value || 'all' });
    const questionPages = Math.ceil(selectedQuestions.length / 25);
    const totalPages = questionPages * (includeAnswers.checked ? 2 : 1);
    summary.textContent = `${selectedQuestions.length}\u554f / ${totalPages}\u30da\u30fc\u30b8\u3002\u554f\u984c\u30da\u30fc\u30b8\u3092\u5148\u306b\u3001\u89e3\u7b54\u306f\u5f8c\u308d\u306b\u51fa\u529b\u3057\u307e\u3059\u3002`;
  }

  moduleSelect.onchange = refreshRangeOptions;
  rangeSelect.onchange = refreshSummary;
  includeAnswers.onchange = refreshSummary;
  refreshRangeOptions();

  grid.append(moduleLabel, rangeLabel);
  setup.append(grid, answerLabel, summary);

  const actions = el('section', 'card action-card');
  const exportButton = button('PDF\u3092\u66f8\u304d\u51fa\u3059', 'btn primary');
  exportButton.onclick = async () => {
    const module = modules.find((item) => item.id === moduleSelect.value) ?? modules[0];
    if (!selectedQuestions.length) {
      toast('\u51fa\u529b\u3067\u304d\u308b\u554f\u984c\u304c\u3042\u308a\u307e\u305b\u3093\u3002');
      return;
    }
    exportButton.disabled = true;
    exportButton.textContent = 'PDF\u3092\u4f5c\u6210\u4e2d...';
    try {
      const plan = createJapaneseToEnglishWorksheetPlan(module, selectedQuestions, includeAnswers.checked);
      const { generateWorksheetPdfBlob } = await import('../pdf/worksheetPdf');
      const pdf = await generateWorksheetPdfBlob(plan);
      await savePdf(pdf, `${safeFileStem(module.title)}-${safeFileStem(plan.rangeLabel)}.pdf`);
      toast('PDF\u30d7\u30ea\u30f3\u30c8\u3092\u66f8\u304d\u51fa\u3057\u307e\u3057\u305f\u3002');
    } catch (error) {
      toast(`PDF\u4f5c\u6210\u306b\u5931\u6557\u3057\u307e\u3057\u305f\uff1a${error instanceof Error ? error.message : String(error)}`);
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = 'PDF\u3092\u66f8\u304d\u51fa\u3059';
    }
  };
  actions.append(exportButton);

  const note = el('section', 'card');
  note.append(el('h2', '', '\u5bfe\u5fdc\u7bc4\u56f2'), el('p', 'hint', 'A4\u7e26\u30fb1\u30da\u30fc\u30b825\u554f\u30fb\u65e5\u672c\u8a9e\u304b\u3089\u82f1\u8a9e\u306e\u5165\u529b\u5f0f\u554f\u984c\u306b\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u3059\u3002\u9078\u629e\u554f\u984c\u30fb\u753b\u50cf\u554f\u984c\u30fb\u9006\u65b9\u5411\u306f\u51fa\u529b\u3057\u307e\u305b\u3093\u3002'));

  screen.append(header, intro, setup, actions, note);
  root.append(screen);
}
