import { describe, expect, it, vi } from 'vitest';
import type { LoopDeckPack, Question } from '../src/core/models';
import { createQuestionImageAssetResolver } from '../src/packs/packAssetResolver';
import { mergeLoopDeckPacks } from '../src/packs/packMerger';
import { getQuestionPackId, resolveActivePacks } from '../src/packs/packResolver';

function imageQuestion(prompt: string, imageAsset = 'images/map.png'): Question {
  return { id: 'q', moduleId: 'm', type: 'input', prompt, answer: 'A', imageAsset };
}

function pack(packId: string, question: Question): LoopDeckPack {
  return {
    packVersion: 1, packId, title: packId, folders: [{ id: 'f', title: 'Folder' }],
    modules: [{ id: 'm', folderId: 'f', title: 'Module', subject: 'demo', questionIds: [question.id] }], questions: [question]
  };
}

describe('pack image asset resolution', () => {
  it('tracks the pack that owns the active question after overrides', async () => {
    const view = resolveActivePacks([pack('old-pack', imageQuestion('old')), pack('new-pack', imageQuestion('new'))]);
    const getPackAsset = vi.fn(async (packId: string, path: string) => ({ assetId: `${packId}:${path}`, packId, path, mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }));
    const resolver = createQuestionImageAssetResolver(view, { getPackAsset });

    expect(getQuestionPackId(view, 'q')).toBe('new-pack');
    expect(await resolver(view.questionById.get('q')!)).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(getPackAsset).toHaveBeenCalledWith('new-pack', 'images/map.png');
  });

  it('keeps image paths when conflicting questions are renamed during merge', () => {
    const existing = pack('shared-pack', imageQuestion('old', 'images/old.png'));
    const incoming = pack('shared-pack', imageQuestion('new', 'images/new.png'));
    const merged = mergeLoopDeckPacks(existing, incoming).pack;

    expect(merged.questions.find((item) => item.id === 'q')?.imageAsset).toBe('images/old.png');
    expect(merged.questions.find((item) => item.id === 'q__merge_1')?.imageAsset).toBe('images/new.png');
  });

  it('resolves preserved and renamed incoming image questions after a same-pack merge', async () => {
    const existing = pack('shared-pack', imageQuestion('old', 'images/old.png'));
    const incoming = pack('shared-pack', imageQuestion('new', 'images/new.png'));
    const merged = mergeLoopDeckPacks(existing, incoming).pack;
    const view = resolveActivePacks([merged]);
    const assets = new Map([
      ['shared-pack:images/old.png', 'data:image/png;base64,b2xk'],
      ['shared-pack:images/new.png', 'data:image/png;base64,bmV3']
    ]);
    const resolver = createQuestionImageAssetResolver(view, {
      async getPackAsset(packId, path) {
        const dataUrl = assets.get(`${packId}:${path}`);
        return dataUrl ? { assetId: `${packId}:${path}`, packId, path, mimeType: 'image/png', dataUrl } : undefined;
      }
    });

    expect(await resolver(view.questionById.get('q')!)).toBe('data:image/png;base64,b2xk');
    expect(await resolver(view.questionById.get('q__merge_1')!)).toBe('data:image/png;base64,bmV3');
  });
});
