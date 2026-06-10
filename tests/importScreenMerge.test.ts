// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { resolveActivePacks } from '../src/packs/packResolver';
import { renderImportScreen } from '../src/screens/importScreen';
import { db } from '../src/storage/db';

function pack(packId: string, prompt: string): LoopDeckPack {
  return {
    packVersion: 1,
    packId,
    title: 'Same ID Pack',
    folders: [{ id: 'f', title: 'Folder' }],
    modules: [{ id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: ['q'] }],
    questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt, answer: 'Answer', imageAsset: 'images/map.png' }]
  };
}

describe('same-packId import UI', () => {
  it('continues to offer overwrite update and merge update', async () => {
    const packId = 'merge-ui-image-pack';
    const existing = pack(packId, 'Existing question');
    const incoming = pack(packId, 'Incoming question');
    await db.deleteImportedPack(packId);
    await db.saveImportedPack(existing);

    const root = document.createElement('div');
    await renderImportScreen(root, resolveActivePacks([existing]), () => {}, async () => {});

    const input = root.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([JSON.stringify(incoming)], 'same-id.loopdeck.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(incoming) });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await input.onchange?.(new Event('change'));

    const labels = [...root.querySelectorAll('button')].map((item) => item.textContent);
    expect(labels).toContain('\u4e0a\u66f8\u304d\u66f4\u65b0\u3059\u308b');
    expect(labels).toContain('\u30de\u30fc\u30b8\u66f4\u65b0\u3059\u308b');

    await db.deleteImportedPack(packId);
  });
});
