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
    expect(packAuthoringPrompt).toContain('multi_select');
    expect(packAuthoringPrompt).toContain('answerJudging');
    expect(packAuthoringPrompt).toContain('requiredParts');
    expect(packAuthoringPrompt).toContain('supportedStudyModes');
    expect(packAuthoringPrompt).toContain('choiceCandidates');
    expect(packAuthoringPrompt).toContain('manifest.json');
  });

  it('downloads a non-empty UTF-8 text prompt from the import screen action', async () => {
    const createObjectURL = vi.fn(() => 'blob:loopdeck-authoring-prompt');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    let downloadedFilename = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click(this: HTMLAnchorElement) {
      downloadedFilename = this.download;
    });

    const root = document.createElement('div');
    await renderImportScreen(root, resolveActivePacks([]), () => {}, async () => {});

    const download = [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === 'AI用Pack作成プロンプトを保存');
    expect(download).toBeDefined();

    download!.click();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.size).toBeGreaterThan(4000);
    expect(blob.type).toBe('text/plain;charset=utf-8');
    expect(downloadedFilename).toBe('loopdeck-pack-authoring-prompt.txt');
  });
});
