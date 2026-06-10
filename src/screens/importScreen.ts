import type { LoopDeckPack } from '../core/models';
import { mergeLoopDeckPacks, type MergePackReport } from '../packs/packMerger';
import { getActiveModules, getActivePacks, getActiveQuestions, type ResolvedPackView } from '../packs/packResolver';
import { createLoopDeckZipBlob, makePackFileStem, stringifyLoopDeckJson } from '../packs/zipExporter';
import { importLoopDeckJson, importLoopDeckZip } from '../packs/zipImporter';
import { db, type LoopDeckBackup } from '../storage/db';
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read export file.'));
    reader.readAsDataURL(blob);
  });
}

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (window.LoopDeckAndroid?.saveFile) {
    window.LoopDeckAndroid.saveFile(filename, blob.type || 'application/octet-stream', await blobToBase64(blob));
    toast('保存先を選んでください。');
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

function isBackupPayload(value: unknown): value is LoopDeckBackup {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.loopDeckBackupVersion === 1 && Array.isArray(record.attempts) && Array.isArray(record.bookmarks) && Array.isArray(record.importedPacks);
}

async function exportPackJson(pack: LoopDeckPack): Promise<void> {
  try {
    const blob = new Blob([stringifyLoopDeckJson(pack)], { type: 'application/json' });
    await downloadBlob(blob, `${makePackFileStem(pack)}.loopdeck.json`);
    toast('JSONを書き出しました。');
  } catch (error) {
    toast(`書き出しに失敗しました：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function exportPackZip(pack: LoopDeckPack): Promise<void> {
  try {
    const blob = await createLoopDeckZipBlob(pack);
    await downloadBlob(blob, `${makePackFileStem(pack)}.loopdeck.zip`);
    toast('ZIPを書き出しました。');
  } catch (error) {
    toast(`書き出しに失敗しました：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function exportBackup(): Promise<void> {
  const backup = await db.exportUserData();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  await downloadBlob(blob, `loopdeck-backup-${backup.exportedAt.slice(0, 10)}.json`);
  toast('バックアップを書き出しました。');
}

function infoList(items: string[]): HTMLUListElement {
  const list = document.createElement('ul');
  list.className = 'info-list';
  for (const text of items) list.append(el('li', '', text));
  return list;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

function summarizeIds(ids: string[]): string {
  const shown = ids.slice(0, 5).join(', ');
  return ids.length > 5 ? `${shown} ほか${ids.length - 5}件` : shown;
}

function mergeReportItems(report: MergePackReport): string[] {
  return [
    `追加フォルダ: ${report.addedFolders}`,
    `更新フォルダ: ${report.updatedFolders}`,
    `追加教材: ${report.addedModules}`,
    `マージ教材: ${report.mergedModules}`,
    `追加問題: ${report.addedQuestions}`,
    `競合でID変更した問題: ${report.renamedQuestions}`,
    `同一のためスキップした問題: ${report.skippedIdenticalQuestions}`
  ];
}

function appendMergeReport(container: HTMLElement, report: MergePackReport): void {
  const reportBox = el('div', 'merge-report');
  reportBox.append(el('h3', '', 'マージ更新の内容'), infoList(mergeReportItems(report)));
  container.append(reportBox);
}

export async function renderImportScreen(
  root: HTMLElement,
  packView: ResolvedPackView,
  reloadPacks: () => Promise<ResolvedPackView>,
  navigateHome: () => void
): Promise<void> {
  clear(root);
  const screen = el('main', 'screen import-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  header.append(back);

  const intro = el('section', 'hero-card');
  intro.append(
    el('p', 'eyebrow', 'Import / Export'),
    el('h1', '', '教材・学習データ管理'),
    el('p', '', 'LoopDeck用JSON/ZIP教材を追加したり、学習データをバックアップできます。')
  );

  const importCard = el('section', 'card');
  importCard.append(el('h2', '', '教材を追加'));
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,.loopdeck.json,.zip,.loopdeck.zip,application/json,application/zip';
  fileInput.className = 'file-input';
  const importSummary = el('div', 'import-summary');

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    importSummary.textContent = '読み込み中...';
    try {
      const result = file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.loopdeck.zip')
        ? await importLoopDeckZip(file)
        : await importLoopDeckJson(file);
      if (!result.ok || !result.pack) {
        importSummary.textContent = '読み込みに失敗しました。';
        renderIssues(importSummary, result.issues);
        return;
      }
      const existingPack = getActivePacks(packView).find((pack) => pack.packId === result.pack?.packId);
      const existingModuleIds = new Set(getActiveModules(packView).map((module) => module.id));
      const incomingModuleIds = result.pack.modules.map((module) => module.id);
      const collisions = incomingModuleIds.filter((id) => existingModuleIds.has(id));

      importSummary.replaceChildren();
      importSummary.append(el('p', '', `読み込み成功: ${result.pack.title}`));
      if (result.assets?.length) importSummary.append(el('p', '', `画像アセット: ${result.assets.length}件`));
      renderIssues(importSummary, result.issues);

      const actions = el('div', 'update-actions');
      const importButton = button(existingPack ? '上書き更新する' : 'この教材を追加', 'btn primary');
      importButton.onclick = async () => {
        if (!result.pack) return;
        await db.saveImportedPack(result.pack);
        packView = await reloadPacks();
        toast(existingPack ? '教材を上書き更新しました。' : '教材を追加しました。');
        navigateHome();
      };
      actions.append(importButton);

      if (existingPack) {
        const mergeButton = button('マージ更新する', 'btn ghost');
        mergeButton.onclick = async () => {
          if (!result.pack) return;
          const merged = mergeLoopDeckPacks(existingPack, result.pack);
          await db.saveImportedPack(merged.pack);
          packView = await reloadPacks();
          toast('教材をマージ更新しました。');
          appendMergeReport(importSummary, merged.report);
        };
        actions.append(mergeButton);
      }

      importSummary.append(actions);

      if (collisions.length && !existingPack) {
        importSummary.append(el('p', 'issue warning', `同じ教材IDがあります: ${summarizeIds(unique(collisions))}。後から読み込んだ教材が表示上優先されます。`));
      }
    } catch (error) {
      importSummary.textContent = `読み込みに失敗しました：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      fileInput.value = '';
    }
  };

  importCard.append(fileInput, importSummary);

  const exportCard = el('section', 'card');
  exportCard.append(el('h2', '', '書き出し'));
  const packRows = el('div', 'weak-list');
  for (const pack of getActivePacks(packView)) {
    const row = el('div', 'weak-row pack-row');
    const meta = el('div', 'pack-meta');
    meta.append(el('strong', '', pack.title), el('small', '', `${pack.modules.length}教材 / ${pack.questions.length}問`));
    const actions = el('div', 'pack-actions');
    const json = button('JSON', 'btn ghost');
    json.onclick = () => void exportPackJson(pack);
    const zip = button('ZIP', 'btn ghost');
    zip.onclick = () => void exportPackZip(pack);
    actions.append(json, zip);
    row.append(meta, actions);
    packRows.append(row);
  }
  const backup = button('学習データをバックアップ', 'btn primary');
  backup.onclick = () => void exportBackup();
  exportCard.append(packRows, backup);

  const dataCard = el('section', 'card');
  dataCard.append(el('h2', '', '学習データ読み込み'));
  const backupInput = document.createElement('input');
  backupInput.type = 'file';
  backupInput.accept = '.json,application/json';
  backupInput.className = 'file-input';
  const backupSummary = el('div', 'import-summary');
  backupInput.onchange = async () => {
    const file = backupInput.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as unknown;
      if (!isBackupPayload(data)) throw new Error('LoopDeckバックアップではありません。');
      await db.importUserData(data);
      await reloadPacks();
      toast('学習データを読み込みました。');
      navigateHome();
    } catch (error) {
      backupSummary.textContent = `読み込みに失敗しました：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      backupInput.value = '';
    }
  };
  dataCard.append(backupInput, backupSummary);

  screen.append(header, intro, importCard, exportCard, dataCard);
  root.append(screen);
}

function renderIssues(container: HTMLElement, issues: { level: 'error' | 'warning'; message: string; path?: string }[]): void {
  const list = el('div', 'issue-list');
  for (const issue of issues) {
    list.append(el('div', `issue ${issue.level}`, `${issue.level === 'error' ? 'エラー' : '警告'}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`));
  }
  container.append(list);
}
