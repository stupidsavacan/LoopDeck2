import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { ModuleInfo, Question } from '../src/core/models';
import { createJapaneseToEnglishWorksheetPlan } from '../src/pdf/worksheetPlanner';
import { generateWorksheetPdfBlob, loadFontBytesFromUrl, type WorksheetPdfFontBytes } from '../src/pdf/worksheetPdf';

const moduleInfo: ModuleInfo = {
  id: 'leap-test',
  folderId: 'english',
  title: 'LEAP \u8a9e\u5f59\u30c6\u30b9\u30c8',
  subject: '\u82f1\u8a9e',
  questionIds: []
};

function inputQuestion(index: number): Question {
  return {
    id: `q-${index}`,
    moduleId: moduleInfo.id,
    type: 'input',
    number: 200 + index,
    prompt: `\u65e5\u672c\u8a9e\u306e\u610f\u5473 ${index}`,
    answer: `english-${index}`
  };
}

function leapQuestion(index: number): Question {
  return {
    id: `leap-${index}`,
    moduleId: moduleInfo.id,
    type: 'input',
    number: index,
    prompt: 'strict',
    answer: '\u53b3\u3057\u3044',
    acceptableAnswers: ['\u53b3\u3057\u3044', '\u53b3\u683c\u306a'],
    direction: 'normal'
  };
}

function questions(count: number): Question[] {
  return Array.from({ length: count }, (_, index) => inputQuestion(index + 1));
}

async function fonts(): Promise<WorksheetPdfFontBytes> {
  const japanese = await readFile(new URL('../node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff', import.meta.url));
  const latin = await readFile(new URL('../node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-latin-400-normal.woff', import.meta.url));
  return { japanese, latin };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fixed Japanese-to-English worksheet planner', () => {
  it('splits 100 questions into four 25-row question pages', () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, questions(100), false);
    expect(plan.questionPages).toHaveLength(4);
    expect(plan.questionPages.every((page) => page.rows.length === 25)).toBe(true);
  });

  it('adds matching answer pages after all question pages when requested', () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, questions(100), true);
    expect(plan.answerPages).toHaveLength(4);
    expect(plan.pages.map((page) => page.kind)).toEqual(['questions', 'questions', 'questions', 'questions', 'answers', 'answers', 'answers', 'answers']);
  });

  it('omits answer pages when they are not requested', () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, questions(26), false);
    expect(plan.answerPages).toEqual([]);
    expect(plan.pages).toHaveLength(2);
  });

  it('uses the Japanese prompt as the visible question and English answer as the answer key', () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, [inputQuestion(1)], true);
    expect(plan.rows[0]).toMatchObject({ prompt: '\u65e5\u672c\u8a9e\u306e\u610f\u5473 1', answer: 'english-1' });
  });

  it('reverses LEAP-style English prompt and Japanese answer rows for Japanese-to-English output', () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, [leapQuestion(387)], true);
    expect(plan.rows[0]).toMatchObject({
      number: 387,
      prompt: '\u53b3\u3057\u3044\uff1b\u53b3\u683c\u306a',
      answer: 'strict'
    });
  });

  it('preserves question numbers', () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, questions(3), false);
    expect(plan.rows.map((row) => row.number)).toEqual([201, 202, 203]);
  });

  it('skips non-vocabulary, reverse-direction, image, and unsupported questions', () => {
    const choice: Question = {
      id: 'choice',
      moduleId: moduleInfo.id,
      type: 'choice',
      prompt: '\u9078\u629e',
      choices: ['a', 'b'],
      answer: 'a'
    };
    const japaneseAnswer: Question = {
      id: 'history',
      moduleId: moduleInfo.id,
      type: 'input',
      prompt: '\u6c5f\u6238\u5e55\u5e9c\u3092\u958b\u3044\u305f\u4eba',
      answer: '\u5fb3\u5ddd\u5bb6\u5eb7'
    };
    const image: Question = { ...inputQuestion(2), id: 'image', imageAsset: 'images/map.png' };
    const reverse: Question = {
      id: 'reverse',
      moduleId: moduleInfo.id,
      type: 'input',
      number: 203,
      prompt: '\u65e5\u672c\u8a9e\u306e\u610f\u5473 3',
      answer: 'english-3',
      direction: 'en_to_ja'
    };
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, [inputQuestion(1), choice, japaneseAnswer, image, reverse], false);

    expect(plan.rows).toHaveLength(1);
    expect(plan.skippedQuestionCount).toBe(4);
  });
});

describe('fixed worksheet PDF generator', () => {
  it('creates a non-empty application/pdf Blob with embedded Japanese font', async () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, [inputQuestion(1)], true);
    const blob = await generateWorksheetPdfBlob(plan, await fonts());
    const document = await PDFDocument.load(await blob.arrayBuffer());

    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
    expect(document.getPageCount()).toBe(2);
  });

  it('falls back to XMLHttpRequest font loading when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    class FakeXMLHttpRequest {
      responseType = '';
      status = 0;
      response = new Uint8Array([1, 2, 3]).buffer;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      open(): void {}
      send(): void {
        this.onload?.();
      }
    }

    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);

    await expect(loadFontBytesFromUrl('app://local-font.woff')).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });
});
