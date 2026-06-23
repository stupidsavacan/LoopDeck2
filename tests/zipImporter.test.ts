import { describe, expect, it } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { createLoopDeckZipBytes } from '../src/packs/zipExporter';
import { importLoopDeckJson, importLoopDeckZip } from '../src/packs/zipImporter';

const validPack: LoopDeckPack = {
  packVersion: 1,
  packId: 'valid-pack',
  title: 'Valid Pack',
  folders: [{ id: 'f', title: 'Folder' }],
  modules: [{ id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: ['q'] }],
  questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'A?', answer: 'A' }]
};

describe('zip/json importer safety', () => {
  it('rejects dangerous single-file import names', async () => {
    const result = await importLoopDeckJson(new File([JSON.stringify(validPack)], 'evil.html'));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === 'evil.html')).toBe(true);
  });

  it('accepts valid JSON data', async () => {
    const result = await importLoopDeckJson(new File([JSON.stringify(validPack)], 'valid.loopdeck.json'));
    expect(result.ok).toBe(true);
    expect(result.pack?.packId).toBe('valid-pack');
  });

  it('preserves module color metadata from JSON imports', async () => {
    const pack = {
      ...validPack,
      modules: [{ ...validPack.modules[0], color: '#15803D', accentColor: '#DCFCE7' }]
    };
    const result = await importLoopDeckJson(new File([JSON.stringify(pack)], 'colors.loopdeck.json'));

    expect(result.ok).toBe(true);
    expect(result.pack?.modules[0].color).toBe('#15803D');
    expect(result.pack?.modules[0].accentColor).toBe('#DCFCE7');
  });

  it('preserves module color metadata from ZIP imports', async () => {
    const pack = {
      ...validPack,
      modules: [{ ...validPack.modules[0], color: '#92400E', accentColor: '#FEF3C7' }]
    };
    const bytes = await createLoopDeckZipBytes(pack);
    const payload = Uint8Array.from(bytes).buffer as ArrayBuffer;
    const result = await importLoopDeckZip(new File([payload], 'colors.loopdeck.zip'));

    expect(result.ok).toBe(true);
    expect(result.pack?.modules[0].color).toBe('#92400E');
    expect(result.pack?.modules[0].accentColor).toBe('#FEF3C7');
  });
});
