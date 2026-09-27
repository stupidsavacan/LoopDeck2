import { reportIssue } from '../debug/reportIssue';
import { writeDebugLog } from '../debug/debugLog';
import type { LoopDeckPack, ModuleInfo, Question } from '../core/models';
import { createJapaneseToEnglishWorksheetPlan, isJapaneseToEnglishWorksheetQuestion } from '../pdf/worksheetPlanner';
import { buildWorksheetRangeOptions, filterWorksheetQuestionsByRange, formatWorksheetModuleLabel } from '../pdf/worksheetSelection';
import type { ResolvedPackView } from '../packs/packResolver';
import { button, clear, el, toast } from '../ui/dom';
import { appendIconLabel } from '../ui/icons';

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

export async function renderPdfWorksheetScreen(
  root: HTMLElement,
  packView: ResolvedPackView,
  navigateHome: () => void,
  isCurrent: () => boolean = () => true
): Promise<void> {
  if (!isCurrent()) return;
  const modules = worksheetModuleOptions(packView);
  if (!isCurrent()) return;
  clear(root);
  const screen = el('main', 'screen pdf-worksheet-screen');
  const header = el('header', 'topbar');
  const back = button('', 'btn ghost');
  appendIconLabel(back, 'arrowLeft', 'ホーム');
  back.onclick = navigateHome;
  header.append(back);

  const intro = el('section', 'hero-card worksheet-hero');
  intro.append(
    el('p', 'eyebrow', 'WORKSHEET / A4'),
    el('h1', '', 'PDFプリント'),
    el('p', '', '日本語の意味から英語を書く、テスト対策用のA4プリントを作成します。')
  );

  const setup = el('section', 'card setup-card worksheet-setup');
  setup.append(el('p', 'eyebrow', 'SETUP'), el('h2', '', '出力設定'));
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

  const countLabel = el('label', 'field-label');
  const countSelect = el('select', 'study-select') as HTMLSelectElement;
  [['all', '全部'], ['10', '10問'], ['20', '20問'], ['50', '50問']].forEach(([value, label]) => countSelect.append(makeOption(value, label)));
  countLabel.append(el('span', '', '問題数'), countSelect);

  const shuffleLabel = el('label', 'check-label');
  const shuffle = document.createElement('input');
  shuffle.type = 'checkbox';
  shuffleLabel.append(shuffle, document.createTextNode(' 問題をシャッフル'));

  const includeAnswerLabel = el('label', 'check-label');
  const includeAnswer = document.createElement('input');
  includeAnswer.type = 'checkbox';
  includeAnswer.checked = true;
  includeAnswerLabel.append(includeAnswer, document.createTextNode(' 解答ページを付ける'));

  const titleLabel = el('label', 'field-label');
  const titleInput = el('input', 'study-input') as HTMLInputElement;
  titleInput.placeholder = '例: LEAP 301–400 小テスト';
  titleLabel.append(el('span', '', 'タイトル'), titleInput);

  grid.append(moduleLabel, rangeLabel, countLabel, titleLabel);
  setup.append(grid, shuffleLabel, includeAnswerLabel);

  const status = el('section', 'card worksheet-status');
  status.append(el('p', 'eyebrow', 'STATUS'));
  const statusTitle = el('h2', '', '準備完了');
  const statusDetail = el('p', 'hint', '教材と範囲を選んでPDFを作成します。');
  const statusLog = el('div', 'worksheet-status-log');
  status.append(statusTitle, statusDetail, statusLog);

  function reportProgress(code: string, message: string, detail = ''): void {
    statusTitle.textContent = message;
    statusDetail.textContent = detail || code;
    const row = el('div', 'worksheet-status-row');
    row.append(el('code', '', code), el('span', '', `${message}${detail ? ` / ${detail}` : ''}`));
    statusLog.prepend(row);
    writeDebugLog({ level: 'info', area: 'pdf', code, userMessage: message, detail });
  }

  function refreshRangeOptions(): void {
    const selected = modules[Number(moduleSelect.value || '0')];
    rangeSelect.replaceChildren();
    for (const option of buildWorksheetRangeOptions(selected?.questions ?? [])) {
      rangeSelect.append(makeOption(option.value, option.label));
    }
  }
  moduleSelect.onchange = refreshRangeOptions;
  refreshRangeOptions();

  const actions = el('section', 'card action-card');
  const generate = button('PDFプリントを作る', 'btn primary');
  actions.append(generate, el('p', 'hint', '生成後、ブラウザまたはAndroidの保存先選択画面が開きます。'));

  generate.onclick = async () => {
    if (generate.disabled) return;
    const selected = modules[Number(moduleSelect.value || '0')];
    if (!selected) {
      toast('教材を選んでください。');
      return;
    }
    const filtered = filterWorksheetQuestionsByRange(selected.questions, rangeSelect.value || 'all');
    const limit = countSelect.value === 'all' ? filtered.length : Number(countSelect.value);
    const selectedQuestions = shuffle.checked ? [...filtered].sort(() => Math.random() - 0.5).slice(0, limit) : filtered.slice(0, limit);
    if (!selectedQuestions.length) {
      toast('この範囲には出力できる問題がありません。');
      return;
    }

    generate.disabled = true;
    generate.textContent = 'PDF作成中…';
    clear(statusLog);
    try {
      reportProgress('PDF-P010', 'PDFレイアウトを準備中', `${selectedQuestions.length}問`);
      const plan = createJapaneseToEnglishWorksheetPlan({
        module: selected.module,
        questions: selectedQuestions,
        title: titleInput.value.trim() || selected.module.title,
        includeAnswerSheet: includeAnswer.checked
      });
      reportProgress('PDF-F010', '日本語フォントを準備中', 'Noto Sans JPを使用します。');
      const { createJapaneseWorksheetPdf } = await import('../pdf/pdfWorksheet');
      reportProgress('PDF-R010', 'PDFページを描画中', `${plan.questions.length}問 / ${plan.title}`);
      const blob = await createJapaneseWorksheetPdf(plan, reportProgress);
      const filename = `${safeFileStem(plan.title)}.pdf`;
      reportProgress('PDF-V010', 'PDF検証完了', `${blob.size.toLocaleString()} bytes`);
      await savePdf(blob, filename, reportProgress);
      toast('PDFを作成しました。');
    } catch (error) {
      const code = errorCode(error);
      const message = baseErrorMessage(error);
      writeDebugLog({
        level: 'error',
        area: 'pdf',
        code,
        userMessage: 'PDF作成または保存に失敗しました。',
        detail: message,
        stack: error instanceof Error ? error.stack : undefined
      });
      reportIssue({ code, message, context: 'pdfWorksheet' });
      statusTitle.textContent = 'PDF作成に失敗しました';
      statusDetail.textContent = `${code}: ${message}`;
      toast(`PDF作成に失敗しました：${message}`);
    } finally {
      generate.disabled = false;
      generate.textContent = 'PDFプリントを作る';
    }
  };

  screen.append(header, intro, setup, actions, status);
  root.append(screen);
}
