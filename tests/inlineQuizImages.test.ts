// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { ModuleInfo, Question } from '../src/core/models';
import { createSession } from '../src/core/sessionEngine';
import { renderInlineQuiz } from '../src/screens/inlineQuiz';

const moduleInfo: ModuleInfo = {
  id: 'image-module',
  folderId: 'image-folder',
  title: 'Image Module',
  subject: 'demo',
  questionIds: ['image-question']
};

const imageQuestion: Question = {
  id: 'image-question',
  moduleId: 'image-module',
  type: 'input',
  prompt: 'Read the image.',
  answer: 'Answer',
  imageAsset: 'images/map.png'
};

function session() {
  return createSession(moduleInfo, [imageQuestion], { shuffle: false, autoNext: false, questionLimit: 'all' });
}

async function settleImageResolution(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('renderInlineQuiz image assets', () => {
  it('renders a resolved safe data URL as img.question-image', async () => {
    const container = document.createElement('div');
    renderInlineQuiz(container, session(), { onSessionChange() {}, onComplete() {} }, {
      resolveImageAsset: async () => 'data:image/png;base64,iVBORw0KGgo='
    });

    await settleImageResolution();

    const image = container.querySelector<HTMLImageElement>('img.question-image');
    expect(image).not.toBeNull();
    expect(image?.src).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(container.querySelector('.image-fallback')).toBeNull();
  });

  it('shows the missing-image fallback when the resolver returns undefined', async () => {
    const container = document.createElement('div');
    renderInlineQuiz(container, session(), { onSessionChange() {}, onComplete() {} }, {
      resolveImageAsset: async () => undefined
    });

    await settleImageResolution();

    expect(container.querySelector('img.question-image')).toBeNull();
    expect(container.querySelector('.image-fallback')?.textContent).toContain('\u753b\u50cf\u30d5\u30a1\u30a4\u30eb\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093');
  });
});
