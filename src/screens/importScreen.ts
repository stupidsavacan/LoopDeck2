import type { LoopDeckPack } from '../core/models';
import { createLoopDeckZipBlob, makePackFileStem, stringifyLoopDeckJson } from '../packs/zipExporter';
import { importLoopDeckJson, importLoopDeckZip } from '../packs/zipImporter';
import { db } from '../storage/db';
import { button, clear, el, toast } from '../ui/dom';

function downloadBlob(blob: Blob, filename: string): void {
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

function exportPackJson(pack: LoopDeckPack): void {
  const blob = new Blob([stringifyLoopDeckJson(pack)], { type: 'application/json' });
  downloadBlob(blob, `${makePackFileStem(pack)}.loopdeck.json`);
  toast('JSON\u3092\u66f8\u304d\u51fa\u3057\u307e\u3057\u305f\u3002');
}

async function exportPackZip(pack: LoopDeckPack): Promise<void> {
  try {
    const blob = await createLoopDeckZipBlob(pack);
    downloadBlob(blob, `${makePackFileStem(pack)}.loopdeck.zip`);
    toast('ZIP\u3092\u66f8\u304d\u51fa\u3057\u307e\u3057\u305f\u3002');
  } catch (error) {
    toast(`\u66f8\u304d\u51fa\u3057\u306b\u5931\u6557\u3057\u307e\u3057\u305f\uff1a${error instanceof Error ? error.message : String(error)}`);
  }
}

export function renderImportScreen(root: HTMLElement, packs: LoopDeckPack[], navigateHome: () => void, onImported: () => Promise<void>): void {
  clear(root);
  const screen = el('main', 'screen import-screen');
  const header = el('header', 'topbar');
  const back = button('\u2190 \u30db\u30fc\u30e0', 'btn ghost');
  back.onclick = navigateHome;
  header.append(back);

  const card = el('section', 'hero-card');
  card.innerHTML = `
    <p class="eyebrow">Local Pack Import / Export</p>
    <h1>\u6559\u6750\u5165\u51fa\u529b</h1>
    <p>JSON \u307e\u305f\u306f .loopdeck.zip \u3092\u53d6\u308a\u8fbc\u307f\u3001\u73fe\u5728\u306e\u6559\u6750\u30d1\u30c3\u30af\u3092\u66f8\u304d\u51fa\u305b\u307e\u3059\u3002HTML / JS / CSS \u306f\u5b9f\u884c\u3057\u307e\u305b\u3093\u3002</p>
  `;

  const input = el('input', 'file-input') as HTMLInputElement;
  input.type = 'file';
  input.accept = '.json,.zip,.loopdeck.zip,application/json,application/zip';

  const preview = el('section', 'card preview-card');
  preview.innerHTML = '<h2>\u8aad\u307f\u8fbc\u307f\u7d50\u679c</h2><p class="empty">\u307e\u3060\u30d5\u30a1\u30a4\u30eb\u304c\u9078\u3070\u308c\u3066\u3044\u307e\u305b\u3093\u3002</p>';

  const packageList = el('section', 'card');
  packageList.innerHTML = '<h2>\u73fe\u5728\u306e\u6559\u6750\u30d1\u30c3\u30af / \u66f8\u304d\u51fa\u3057</h2>';
  const list = el('div', 'weak-list');
  for (const pack of packs) {
    const row = el('div', 'weak-row pack-row');
    const meta = el('div', 'pack-meta');
    meta.append(el('span', '', pack.title), el('small', '', `${pack.questions.length}\u554f`));

    const actions = el('div', 'pack-actions');
    const json = button('JSON', 'btn');
    json.onclick = () => exportPackJson(pack);
    const zip = button('ZIP', 'btn primary');
    zip.onclick = () => void exportPackZip(pack);
    actions.append(json, zip);

    row.append(meta, actions);
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
      preview.innerHTML = '<h2>\u8aad\u307f\u8fbc\u307f\u7d50\u679c</h2>';
      const issueList = el('div', 'issue-list');
      for (const issue of result.issues) {
        const item = el('div', `issue ${issue.level}`);
        item.textContent = `${issue.level.toUpperCase()}: ${issue.message}${issue.path ? ` (${issue.path})` : ''}`;
        issueList.append(item);
      }
      if (!result.issues.length) issueList.append(el('p', 'empty', '\u554f\u984c\u306f\u898b\u3064\u304b\u308a\u307e\u305b\u3093\u3067\u3057\u305f\u3002'));
      preview.append(issueList);

      if (result.ok && result.pack) {
        const summary = el('p', 'import-summary', `${result.pack.title} / ${result.pack.modules.length}\u6559\u6750 / ${result.pack.questions.length}\u554f`);
        const install = button('\u3053\u306e\u6559\u6750\u3092\u53d6\u308a\u8fbc\u3080', 'btn primary');
        install.onclick = async () => {
          await db.saveImportedPack(result.pack!);
          toast('\u6559\u6750\u3092\u53d6\u308a\u8fbc\u307f\u307e\u3057\u305f\u3002');
          await onImported();
        };
        preview.append(summary, install);
      }
    } catch (error) {
      preview.innerHTML = `<h2>\u8aad\u307f\u8fbc\u307f\u7d50\u679c</h2><p class="issue error">\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f\uff1a${error instanceof Error ? error.message : String(error)}</p>`;
    }
  };

  const note = el('details', 'card safe-note');
  note.innerHTML = `
    <summary>\u5bfe\u5fdc\u30d5\u30a1\u30a4\u30eb\u3068\u5b89\u5168\u5236\u9650</summary>
    <ul>
      <li>JSON\u5358\u4f53\u3001\u307e\u305f\u306f manifest.json / modules.json / questions.json \u3092\u542b\u3080 .loopdeck.zip \u306b\u5bfe\u5fdc\u3002</li>
      <li>\u66f8\u304d\u51fa\u3057\u305f ZIP \u306f\u3001\u305d\u306e\u307e\u307e LoopDeck \u306b\u518d\u53d6\u308a\u8fbc\u307f\u3067\u304d\u307e\u3059\u3002</li>
      <li>HTML / JavaScript / CSS \u306f\u6559\u6750\u3068\u3057\u3066\u5b9f\u884c\u3057\u307e\u305b\u3093\u3002</li>
      <li>.apk / .dex / .jar / .so / .exe / .bat / .sh \u306f\u62d2\u5426\u3057\u307e\u3059\u3002</li>
      <li>../ \u3092\u542b\u3080\u5371\u967a\u306a\u30d1\u30b9\u306f\u62d2\u5426\u3057\u307e\u3059\u3002</li>
    </ul>
  `;

  screen.append(header, card, input, preview, packageList, note);
  root.append(screen);
}
