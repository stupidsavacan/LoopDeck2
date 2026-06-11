// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { resolveActivePacks } from '../src/packs/packResolver';
import { renderPdfWorksheetScreen } from '../src/screens/pdfWorksheetScreen';

function pack(packId: string, title: string, questionId: string): LoopDeckPack {
  return {
    packVersion: 1,
    packId,
    title,
    folders: [{ id: 'f', title: 'Folder' }],
    modules: [{ id: 'shared-module', folderId: 'f', title, subject: 'English', questionIds: [questionId] }],
    questions: [{ id: questionId, moduleId: 'shared-module', type: 'input', number: 1, prompt: '\u65e5\u672c\u8a9e\u306e\u610f\u5473', answer: 'english' }]
  };
}

describe('PDF worksheet module selection', () => {
  it('lists only the active module when different packs override the same module id', async () => {
    const oldPack = pack('old-pack', 'Old module', 'old-question');
    const activePack = pack('active-pack', 'Active module', 'active-question');
    const root = document.createElement('div');

    await renderPdfWorksheetScreen(root, resolveActivePacks([oldPack, activePack]), () => {});

    const moduleSelect = root.querySelector<HTMLSelectElement>('.settings-grid select');
    const labels = [...(moduleSelect?.options ?? [])].map((option) => option.textContent);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toContain('Active module');
  });
});
