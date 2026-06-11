import type { LoopDeckPack, ModuleInfo, Question } from '../core/models';
import { createJapaneseToEnglishWorksheetPlan, isJapaneseToEnglishWorksheetQuestion } from '../pdf/worksheetPlanner';
import { buildWorksheetRangeOptions, filterWorksheetQuestionsByRange, formatWorksheetModuleLabel } from '../pdf/worksheetSelection';
import type { ResolvedPackView } from '../packs/packResolver';
import { button, clear, el, toast } from '../ui/dom';

declare global {
  interface Window {
    LoopDeckAndroid?: {
      saveFile(filename: string, mimeType: string, base64Data: string): void;
      beginSaveFile?(saveId: string, filename: string, mimeType: string, expectedBytes: number, expectedChunks: number): boolean;
      appendSaveFileChunk?(saveId: string, chunkIndex: number, base64Chunk: string): boolean;
      finishSaveFile?(saveId: string): boolean;
      canUseNativeSave?(): boolean;
      showToast?(message: string): void;
    };
  }
}

interface WorksheetModuleOption {
  packId: string;
  module: ModuleInfo;
  questions: Question[];
  label: string;
}

export interface NativeSaveResult {
  id: string;
  ok: boolean;
  code: string;
  message: string;
  bytes?: number;
}

type ProgressReporter = (code: string, message: string, detail?: string) => void;

const ANDROID_SAVE_CHUNK_SIZE = 48_000;
const NATIVE_SAVE_TIMEOUT_MS = 120_000;

function makeOption(value: string, label: string): HTMLOptionElement {
  const option = el('option', '', label) as HTMLOptionElement;
  option.value = value;
  return option;
}

function safeFileStem(value: string): string {
  return value.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'worksheet';
}

function exportError(code: string, message: string, cause?: unknown): Error {
  const causeText = cause instanceof Error ? cause.message : cause ? String(cause) : '';
  return new Error(`[${code}] ${message}${causeText ? ` / ${causeText}` : ''}`);
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /^\[([A-Z0-9-]+)\]/.exec(message)?.[1] ?? 'PDF-E999';
}

function baseErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^\[[A-Z0-9-]+\]\s*/, '');
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      if (!base64) reject(exportError('PDF-B002', 'PDFのbase64化結果が空です。'));
      else resolve(base64);
    };
    reader.onerror = () => reject(exportError('PDF-B001', 'PDF Blobをbase64に変換できません。', reader.error));
    reader.readAsDataURL(blob);
  });
}

export function waitForNativeSave(saveId: string, timeoutMs = NATIVE_SAVE_TIMEOUT_MS): Promise<NativeSaveResult> {
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.removeEventListener('loopdeck-native-save-result', handler);
      window.clearTimeout(timeoutId);
    };
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<NativeSaveResult>).detail;
      if (!detail || detail.id !== saveId) return;
      cleanup();
      if (detail.ok) resolve(detail);
      else reject(exportError(detail.code || 'SAV-E999', detail.message || 'Android保存に失敗しました。'));
    };
    window.addEventListener('loopdeck-native-save-result', handler);
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(exportError('SAV-A032', 'Android保存結果を受信できませんでした。もう一度お試しください。'));
    }, timeoutMs);
  });
}

async function savePdf(blob: Blob, filename: string, progress: ProgressReporter): Promise<void> {
  if (blob.type !== 'application/pdf') throw exportError('PDF-V002', `PDF BlobのMIME typeが不正です: ${blob.type || '(empty)'}`);
  if (blob.size <= 0) throw exportError('PDF-V001', 'PDF Blobのサイズが0Bです。保存を中止しました。');

  const android = window.LoopDeckAndroid;
  if (android?.beginSaveFile && android.appendSaveFileChunk && android.finishSaveFile) {
    progress('PDF-B010', 'PDFをbase64へ変換中', `${blob.size.toLocaleString()} bytes`);
    const base64 = await blobToBase64(blob);
    const chunks = Math.max(1, Math.ceil(base64.length / ANDROID_SAVE_CHUNK_SIZE));
    const saveId = `worksheet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    progress('SAV-A010', 'Android保存セッションを開始中', `${chunks} chunks / ${base64.length.toLocaleString()} chars`);

    if (!android.beginSaveFile(saveId, filename, 'application/pdf', blob.size, chunks)) {
      throw exportError('SAV-A011', 'Android保存セッションの開始に失敗しました。');
    }

    for (let index = 0; index < chunks; index += 1) {
      const chunk = base64.slice(index * ANDROID_SAVE_CHUNK_SIZE, (index + 1) * ANDROID_SAVE_CHUNK_SIZE);
      if (!android.appendSaveFileChunk(saveId, index, chunk)) {
        throw exportError('SAV-A012', `Android保存チャンク送信に失敗しました。chunk=${index + 1}/${chunks}`);
      }
      if (index === 0 || index === chunks - 1 || (index + 1) % 10 === 0) {
        progress('SAV-A020', 'AndroidへPDFデータを送信中', `${index + 1}/${chunks} chunks`);
      }
    }

    progress('SAV-A030', '保存先選択画面を開いています', 'ファイル名と保存先を選んでください。');
    if (!android.finishSaveFile(saveId)) throw exportError('SAV-A031', 'Android保存処理の開始に失敗しました。');
    const result = await waitForNativeSave(saveId);
    progress(result.code || 'SAV-OK', 'Android保存が完了しました', `${(result.bytes ?? blob.size).toLocaleString()} bytes`);
    return;
  }

  if (android?.saveFile) {
    progress('SAV-L010', '旧Android保存方式で保存します', '保存完了結果はアプリへ戻りません。');
    android.saveFile(filename, 'application/pdf', await blobToBase64(blob));
    return;
  }

  progress('WEB-S010', 'ブラウザ保存を開始します', filename);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  progress('WEB-S020', 'ブラウザ保存を開始しました', `${blob.size.toLocaleString()} bytes`);
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
  for (const module of packView.modules) {
    const packId = packView.modulePackIdById.get(module.id);
    const pack = packId ? packView.packById.get(packId) : undefined;
    if (!packId || !pack) continue;
    const questions = supportedQuestions(pack, module);
    if (!questions.length) continue;
    options.push({ packId, module, questions, label: formatWorksheetModuleLabel(module, questions) });
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
  actions.append(exportButton);

  const statusCard = el('section', 'card export-status-card');
  const statusTitle = el('h2', '', '書き出し状況');
  const statusMessage = el('p', 'export-status-message', '待機中');
  const statusCode = el('code', 'export-status-code', 'PDF-IDLE');
  const statusDetail = el('p', 'hint export-status-detail', 'PDFを書き出すと、ここに進行状況とエラーコードが表示されます。');
  const statusLog = el('ol', 'export-status-log');
  statusCard.append(statusTitle, statusMessage, statusCode, statusDetail, statusLog);

  function reportProgress(code: string, message: string, detail = ''): void {
    statusMessage.textContent = message;
    statusCode.textContent = code;
    statusDetail.textContent = detail || '詳細なし';
    const item = el('li', '', `[${code}] ${message}${detail ? ` — ${detail}` : ''}`);
    statusLog.append(item);
    while (statusLog.childElementCount > 24) statusLog.firstElementChild?.remove();
  }

  exportButton.onclick = async () => {
    const selected = selectedModuleOption();
    if (!selectedQuestions.length) {
      reportProgress('PDF-S000', '出力できる問題がありません', selected.label);
      toast('[PDF-S000] 出力できる問題がありません。');
      return;
    }
    exportButton.disabled = true;
    exportButton.textContent = 'PDFを作成中...';
    statusLog.replaceChildren();
    try {
      reportProgress('PDF-S010', '出力設定を読み込みました', `${selected.label} / ${selectedQuestions.length}問`);
      const plan = createJapaneseToEnglishWorksheetPlan(selected.module, selectedQuestions, includeAnswers.checked);
      if (!plan.pages.length) throw exportError('PDF-P001', 'PDFに出力できるページがありません。');
      reportProgress('PDF-P010', 'PDFページ構成を作成しました', `${plan.pages.length}ページ / ${plan.rows.length}問`);

      reportProgress('PDF-M010', 'PDF生成モジュールを読み込み中', '../pdf/worksheetPdf');
      const { generateWorksheetPdfBlob } = await import('../pdf/worksheetPdf');

      reportProgress('PDF-G010', 'PDF本体を生成中', '日本語フォントを埋め込みます。');
      const pdf = await generateWorksheetPdfBlob(plan);
      reportProgress('PDF-G020', 'PDF Blobを生成しました', `${pdf.size.toLocaleString()} bytes / ${pdf.type || '(no type)'}`);
      if (pdf.size <= 0) throw exportError('PDF-G021', 'PDF Blobが0Bです。');

      const filename = `${safeFileStem(selected.label)}-${safeFileStem(plan.rangeLabel)}.pdf`;
      reportProgress('PDF-S020', '保存処理を開始します', filename);
      await savePdf(pdf, filename, reportProgress);
      toast('[PDF-OK] PDFプリントを書き出しました。');
    } catch (error) {
      const code = errorCode(error);
      const message = baseErrorMessage(error);
      reportProgress(code, 'PDF作成/保存に失敗しました', message);
      toast(`[${code}] ${message}`);
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = 'PDFを書き出す';
    }
  };

  const note = el('section', 'card');
  note.append(el('h2', '', '対応範囲'), el('p', 'hint', 'A4縦・1ページ25問・日本語から英語の入力式問題に対応しています。選択問題・画像問題・逆方向は出力しません。'));

  screen.append(header, intro, setup, actions, statusCard, note);
  root.append(screen);
}
