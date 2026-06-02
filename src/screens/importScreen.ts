import type { LoopDeckPack } from '../core/models';
import { importLoopDeckJson, importLoopDeckZip } from '../packs/zipImporter';
import { db } from '../storage/db';
import { button, clear, el, toast } from '../ui/dom';

export function renderImportScreen(root: HTMLElement, packs: LoopDeckPack[], navigateHome: () => void, onImported: () => Promise<void>): void {
  clear(root);
  const screen = el('main', 'screen import-screen');
  const header = el('header', 'topbar');
  const back = button('← ホーム', 'btn ghost');
  back.onclick = navigateHome;
  header.append(back);

  const card = el('section', 'hero-card');
  card.innerHTML = `
    <p class="eyebrow">Local Pack Import</p>
    <h1>教材追加</h1>
    <p>JSON または .loopdeck.zip を選ぶと、ブラウザ内で検証してから取り込みます。HTML / JS / CSS は実行しません。</p>
  `;

  const input = el('input', 'file-input') as HTMLInputElement;
  input.type = 'file';
  input.accept = '.json,.zip,.loopdeck.zip,application/json,application/zip';

  const preview = el('section', 'card preview-card');
  preview.innerHTML = '<h2>読み込み結果</h2><p class="empty">まだファイルが選ばれていません。</p>';

  const packageList = el('section', 'card');
  packageList.innerHTML = `<h2>現在の教材パック</h2>`;
  const list = el('div', 'weak-list');
  for (const pack of packs) {
    const row = el('div', 'weak-row');
    row.innerHTML = `<span>${pack.title}</span><small>${pack.questions.length}問</small>`;
    list.append(row);
  }
  packageList.append(list);

  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const result = file.name.endsWith('.zip') || file.name.endsWith('.loopdeck.zip')
        ? await importLoopDeckZip(file)
        : await importLoopDeckJson(file);

      clear(preview);
      preview.innerHTML = '<h2>読み込み結果</h2>';
      const issueList = el('div', 'issue-list');
      for (const issue of result.issues) {
        const item = el('div', `issue ${issue.level}`);
        item.textContent = `${issue.level.toUpperCase()}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`;
        issueList.append(item);
      }
      if (!result.issues.length) issueList.append(el('p', 'empty', '問題は見つかりませんでした。'));
      preview.append(issueList);

      if (result.ok && result.pack) {
        const summary = el('p', 'import-summary', `${result.pack.title} / ${result.pack.modules.length}教材 / ${result.pack.questions.length}問`);
        const install = button('この教材を取り込む', 'btn primary');
        install.onclick = async () => {
          await db.saveImportedPack(result.pack!);
          toast('教材を取り込みました。');
          await onImported();
        };
        preview.append(summary, install);
      }
    } catch (error) {
      preview.innerHTML = `<h2>読み込み結果</h2><p class="issue error">読み込みに失敗しました：${error instanceof Error ? error.message : String(error)}</p>`;
    }
  };

  const note = el('details', 'card safe-note');
  note.innerHTML = `
    <summary>対応ファイルと安全制限</summary>
    <ul>
      <li>JSON単体、または manifest.json / modules.json / questions.json を含む .loopdeck.zip に対応。</li>
      <li>HTML / JavaScript / CSS は教材として実行しません。</li>
      <li>.apk / .dex / .jar / .so / .exe / .bat / .sh は拒否します。</li>
      <li>../ を含む危険なパスは拒否します。</li>
    </ul>
  `;

  screen.append(header, card, input, preview, packageList, note);
  root.append(screen);
}
