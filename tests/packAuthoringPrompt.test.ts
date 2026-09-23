// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packAuthoringPrompt from '../src/packs/packAuthoringPrompt.txt?raw';
import { resolveActivePacks } from '../src/packs/packResolver';
import { renderImportScreen } from '../src/screens/importScreen';

describe('pack authoring prompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ships a non-empty current authoring contract', () => {
    expect(packAuthoringPrompt.length).toBeGreaterThan(4000);
    expect(packAuthoringPrompt).toContain('Authoring contract revision: 2026-09-24');
    expect(packAuthoringPrompt).toContain('Target LoopDeck packVersion: 1');
    expect(packAuthoringPrompt).toContain('multi_select');
    expect(packAuthoringPrompt).toContain('answerJudging');
    expect(packAuthoringPrompt).toContain('requiredParts');
    expect(packAuthoringPrompt).toContain('supportedStudyModes');
    expect(packAuthoringPrompt).toContain('choiceCandidates');
    expect(packAuthoringPrompt).toContain('manifest.json');
  });

  it('downloads a non-empty UTF-8 text prompt from the import screen action', async () => {
    const root = document.createElement('div');
    await renderImportScreen(root, resolveActivePacks([]), () => {}, async () => {});

    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:loopdeck-authoring-prompt');
    const revokeObjectURL = vi.fn<(url: string) => void>();

    try {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

      let downloadedFilename = '';
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
        downloadedFilename = this.download;
      });
      vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler) => {
        if (typeof handler === 'function') handler();
        return 1;
      }) as typeof window.setTimeout);

      const download = [...root.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === 'AI用Pack作成プロンプトを保存');
      expect(download).toBeDefined();

      download!.click();

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob.size).toBeGreaterThan(4000);
      expect(blob.type).toBe('text/plain;charset=utf-8');
      expect(downloadedFilename).toBe('loopdeck-pack-authoring-prompt.txt');
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:loopdeck-authoring-prompt');
    } finally {
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
      else delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
      if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
      else delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });
});
