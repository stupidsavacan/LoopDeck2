// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { resolveActivePacks } from '../src/packs/packResolver';
import { renderImportScreen } from '../src/screens/importScreen';
import { readImportFile } from '../src/services/importFileService';
import { db } from '../src/storage/db';

vi.mock('../src/services/importFileService', () => ({ readImportFile: vi.fn() }));
const pack = (packId: string, moduleId = 'fresh-m'): LoopDeckPack => ({
  packVersion: 1,
  packId,
  title: packId,
  folders: [],
  modules: [{ id: moduleId, folderId: '', title: moduleId, subject: 'Test', questionIds: ['fresh-q'] }],
  questions: [{ id: 'fresh-q', moduleId, type: 'input', prompt: packId, answer: 'Answer' }]
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function preview(existing: LoopDeckPack[], incoming: LoopDeckPack) {
  const reads = vi.spyOn(db, 'getImportedPacks').mockResolvedValue(existing);
  const saves = vi.spyOn(db, 'saveImportedPackWithAssets').mockResolvedValue();
  vi.mocked(readImportFile).mockResolvedValue({ kind: 'pack', result: { ok: true, pack: incoming, issues: [] } });
  const root = document.createElement('div');
  const onImported = vi.fn(async () => {});
  await renderImportScreen(root, resolveActivePacks(existing), () => {}, onImported);
  const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [new File(['{}'], 'pack.json')] });
  await input.onchange?.call(input, new Event('change'));
  return { root, reads, saves, onImported };
}

async function click(root: HTMLElement, label: string) {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === label)!;
  await button.onclick?.call(button, new MouseEvent('click') as PointerEvent);
}

describe('import click-time content identity', () => {
  it('rejects a question collision installed by another tab after the preview was rendered', async () => {
    const { root, reads, saves, onImported } = await preview([], pack('incoming'));
    reads.mockResolvedValue([pack('concurrent', 'another-module')]);
    await click(root, 'この教材を取り込む');
    expect(saves).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('問題IDが別パックと衝突');
  });

  it('does not resurrect a deleted module merge target from a captured pack view', async () => {
    const { root, reads, saves } = await preview([pack('existing')], pack('incoming'));
    reads.mockResolvedValue([]);
    await click(root, '教材マージ更新する');
    expect(saves).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('マージ対象の教材が変更されました');
  });

  it('reports a rejected install and re-enables the action for retry', async () => {
    const { root, saves, onImported } = await preview([], pack('incoming'));
    saves.mockRejectedValue(new Error('transaction conflict'));
    await click(root, 'この教材を取り込む');
    expect(onImported).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('教材を保存できませんでした：transaction conflict');
    expect(
      [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'この教材を取り込む')?.disabled
    ).toBe(false);
  });
});
