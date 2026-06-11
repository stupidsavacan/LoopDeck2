import type { LoopDeckPack } from '../core/models';
import { mergeLoopDeckPacks, mergeLoopDeckPacksIntoExisting, type MergePackReport } from '../packs/packMerger';
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

function sharedModuleIds(left: LoopDeckPack, right: LoopDeckPack): string[] {
  const leftIds = new Set(left.modules.map((module) => module.id));
  return unique(right.modules.map((module) => module.id).filter((moduleId) => leftIds.has(moduleId)));
}

function findModuleMergeTarget(pack: LoopDeckPack, activePacks: LoopDeckPack[]): LoopDeckPack | undefined {
  const incomingModuleIds = new Set(pack.modules.map((module) => module.id));
  return activePacks.find((activePack) => activePack.modules.some((module) => incomingModuleIds.has(module.id)));
}

export async function renderImportScreen(
  root: HTMLElement,
  packView: ResolvedPackView,
  navigateHome: () => void,
  onImported: () => Promise<void>
): Promise<void> {
  clear(root);
  const importedPacks = await db.getImportedPacks();
  const activePacks = getActivePacks(packView);
  const importedIds = new Set(importedPacks.map((pack) => pack.packId));
  const activePackIds = new Set(activePacks.map((pack) => pack.packId));
  const activeModuleIds = new Set(getActiveModules(packView).map((module) => module.id));
  const activeQuestionIds = new Set(getActiveQuestions(packView).map((question) => question.id));

  const screen = el('main', 'screen import-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  header.append(back);

  const card = el('section', 'hero-card');
  card.append(
    el('p', 'eyebrow', 'Data / APK export'),
    el('h1', '', '教材入出力'),
    el('p', '', '教材パック、学習履歴、ブックマークの入出力を行います。APK の署名付き書き出しは GitHub Actions 側で安全に作成します。')
  );

  const input = el('input', 'file-input') as HTMLInputElement;
  input.type = 'file';
  input.accept = '.json,.zip,.loopdeck.zip,application/json,application/zip';

  const preview = el('section', 'card preview-card');
  preview.append(el('h2', '', '読み込み結果'), el('p', 'empty', 'まだファイルが選ばれていません。'));

  const packageList = el('section', 'card');
  packageList.append(el('h2', '', '現在の教材パック / 書き出し'));
  const list = el('div', 'weak-list');
  for (const pack of activePacks) {
    const row = el('div', 'weak-row pack-row');
    const meta = el('div', 'pack-meta');
    meta.append(el('span', '', pack.title), el('small', '', `${pack.questions.length}問${importedIds.has(pack.packId) ? ' / imported' : ' / built-in'}`));

    const actions = el('div', 'pack-actions');
    const json = button('JSON', 'btn');
    json.onclick = () => void exportPackJson(pack);
    const zip = button('ZIP', 'btn primary');
    zip.onclick = () => void exportPackZip(pack);
    actions.append(json, zip);
    if (importedIds.has(pack.packId)) {
      const remove = button('削除', 'btn ghost danger');
      remove.onclick = async () => {
        if (!window.confirm(`${pack.title} を削除します。学習履歴は残ります。`)) return;
        await db.deleteImportedPack(pack.packId);
        toast('インポート済みパックを削除しました。');
        await onImported();
      };
      actions.append(remove);
    }

    row.append(meta, actions);
    list.append(row);
  }
  packageList.append(list);

  const dataCard = el('section', 'card data-card');
  dataCard.append(el('h2', '', '学習データ管理'));
  const dataActions = el('div', 'data-actions');
  const backup = button('履歴バックアップを書き出し', 'btn primary');
  backup.onclick = () => void exportBackup();
  const clearHistory = button('回答履歴を全削除', 'btn ghost danger');
  clearHistory.onclick = async () => {
    if (!window.confirm('回答履歴をすべて削除します。ブックマークと教材パックは残ります。')) return;
    await db.clearAttempts();
    toast('回答履歴を削除しました。');
  };
  const clearWrong = button('ミス履歴だけ削除', 'btn ghost danger');
  clearWrong.onclick = async () => {
    if (!window.confirm('不正解・答え表示の履歴だけ削除します。')) return;
    await db.clearWrongAttempts();
    toast('ミス履歴を削除しました。');
  };
  const clearBookmarks = button('ブックマーク全削除', 'btn ghost danger');
  clearBookmarks.onclick = async () => {
    if (!window.confirm('ブックマークをすべて削除します。')) return;
    await db.clearBookmarks();
    toast('ブックマークを削除しました。');
  };
  dataActions.append(backup, clearHistory, clearWrong, clearBookmarks);
  dataCard.append(dataActions, el('p', 'hint', 'JSONバックアップを読み込むと、回答履歴・ブックマーク・インポート済み教材を復元します。'));

  const apkCard = el('section', 'card');
  apkCard.append(
    el('h2', '', 'APK書き出し'),
    el('p', 'hint', '署名付き APK は、GitHub Secrets に登録した LoopDeck 用 keystore から GitHub Actions で作成します。通常の学習データとは分けて安全に扱います。'),
    infoList([
      'debug APK: Build Android Debug APK workflow の LoopDeck-debug-apk artifact',
      'signed release APK: Build Android Signed Release APK workflow の LoopDeck-signed-release-apk artifact',
      '署名の詳しい手順は android/README_SIGNING.md にまとめています。'
    ])
  );

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = file.name.endsWith('.zip') || file.name.endsWith('.loopdeck.zip')
        ? await importLoopDeckZip(file)
        : await (async () => {
            const text = await file.text();
            let parsed: unknown;
            try {
              parsed = JSON.parse(text);
            } catch {
              parsed = undefined;
            }
            if (isBackupPayload(parsed)) {
              await db.importUserData(parsed);
              toast('バックアップを復元しました。');
              await onImported();
              return undefined;
            }
            return importLoopDeckJson(new File([text], file.name, { type: file.type || 'application/json' }));
          })();
      if (!result) return;

      clear(preview);
      preview.append(el('h2', '', '読み込み結果'));
      const issueList = el('div', 'issue-list');
      for (const issue of result.issues) {
        const item = el('div', `issue ${issue.level}`);
        item.textContent = `${issue.level.toUpperCase()}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`;
        issueList.append(item);
      }
      if (!result.issues.length) issueList.append(el('p', 'empty', '問題は見つかりませんでした。'));
      preview.append(issueList);

      if (result.ok && result.pack) {
        const pack = result.pack;
        const existingImportedPack = importedPacks.find((importedPack) => importedPack.packId === pack.packId);
        const moduleMergeTarget = existingImportedPack ? undefined : findModuleMergeTarget(pack, activePacks);
        const duplicateImportedPackId = Boolean(existingImportedPack);
        const duplicateActivePackId = activePackIds.has(pack.packId);
        const duplicateModuleIds = unique(pack.modules.map((module) => module.id).filter((moduleId) => activeModuleIds.has(moduleId)));
        const duplicateQuestionIds = unique(pack.questions.map((question) => question.id).filter((questionId) => activeQuestionIds.has(questionId)));
        const summary = el('p', 'import-summary', `${pack.title} / ${pack.modules.length}教材 / ${pack.questions.length}問`);
        preview.append(summary);

        if (existingImportedPack) {
          const previewMerge = mergeLoopDeckPacks(existingImportedPack, pack);
          preview.append(el('p', 'issue warning', '同じIDのパックがすでにあります。上書き更新またはマージ更新を選べます。'));
          appendMergeReport(preview, previewMerge.report);
        } else {
          if (duplicateActivePackId) {
            preview.append(el('p', 'issue warning', '同じIDのパックがあります。取り込み後は新しく取り込んだ教材が優先されます。'));
          }
          if (duplicateModuleIds.length) {
            preview.append(el('p', 'issue warning', `同じIDの教材があります: ${summarizeIds(duplicateModuleIds)}。通常取り込みでは上書き扱いになるため、必要なら教材マージ更新を選んでください。`));
          }
          if (moduleMergeTarget) {
            const previewMerge = mergeLoopDeckPacksIntoExisting(moduleMergeTarget, pack);
            const sharedIds = sharedModuleIds(moduleMergeTarget, pack);
            preview.append(el('p', 'issue warning', `教材マージ更新できます。対象: ${moduleMergeTarget.title} / 教材ID: ${summarizeIds(sharedIds)}`));
            appendMergeReport(preview, previewMerge.report);
          }
          if (duplicateQuestionIds.length) {
            preview.append(el('p', 'issue warning', `同じIDの問題があります。マージ時は同一内容ならスキップ、内容違いならID変更して追加します: ${summarizeIds(duplicateQuestionIds)}`));
          }
        }

        const install = button(duplicateImportedPackId ? '上書き更新する' : duplicateModuleIds.length ? '別パックとして取り込む（上書き注意）' : 'この教材を取り込む', duplicateModuleIds.length ? 'btn ghost danger' : 'btn primary');
        install.onclick = async () => {
          await db.saveImportedPack(pack);
          toast(duplicateImportedPackId ? '教材を上書き更新しました。' : '教材を取り込みました。');
          await onImported();
        };
        preview.append(install);

        if (existingImportedPack) {
          const mergeInstall = button('マージ更新する', 'btn');
          mergeInstall.onclick = async () => {
            const currentExistingPack = (await db.getImportedPacks()).find((importedPack) => importedPack.packId === pack.packId);
            if (!currentExistingPack) {
              await db.saveImportedPack(pack);
              toast('同じIDのインポート済み教材が見つからなかったため、新規取り込みしました。');
              await onImported();
              return;
            }

            const { pack: mergedPack, report } = mergeLoopDeckPacks(currentExistingPack, pack);
            await db.saveImportedPack(mergedPack);
            toast(`教材をマージ更新しました。追加${report.addedQuestions + report.renamedQuestions}問 / ID変更${report.renamedQuestions}問。`);
            await onImported();
          };
          preview.append(mergeInstall);
        }

        if (moduleMergeTarget) {
          const moduleMergeInstall = button('教材マージ更新する', 'btn primary');
          moduleMergeInstall.onclick = async () => {
            const currentImportedPacks = await db.getImportedPacks();
            const currentTarget = currentImportedPacks.find((importedPack) => importedPack.packId === moduleMergeTarget.packId) ?? moduleMergeTarget;
            const { pack: mergedPack, report } = mergeLoopDeckPacksIntoExisting(currentTarget, pack);
            await db.saveImportedPack(mergedPack);
            toast(`教材をマージ更新しました。追加${report.addedQuestions + report.renamedQuestions}問 / ID変更${report.renamedQuestions}問。`);
            await onImported();
          };
          preview.append(moduleMergeInstall);
        }
      }
    } catch (error) {
      clear(preview);
      preview.append(
        el('h2', '', '読み込み結果'),
        el('p', 'issue error', `読み込みに失敗しました：${error instanceof Error ? error.message : String(error)}`)
      );
    }
  };

  const note = el('details', 'card safe-note');
  note.append(
    el('summary', '', '対応ファイルと安全制限'),
    infoList([
      'JSON単体、または manifest.json / modules.json / questions.json を含む .loopdeck.zip に対応。',
      'LoopDeckバックアップJSONは回答履歴・ブックマーク・インポート済み教材を復元できます。',
      'HTML / JavaScript / CSS は教材として実行しません。',
      '.html / .js / .mjs / .cjs / .css / .apk / .dex / .jar / .so / .exe / .bat / .cmd / .sh / .ps1 は拒否します。',
      '../、..\\、絶対パス、空パス、null byte を含む危険なパスは拒否します。'
    ])
  );

  screen.append(header, card, input, preview, packageList, dataCard, apkCard, note);
  root.append(screen);
}
