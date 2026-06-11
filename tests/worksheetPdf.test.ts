import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import type { ModuleInfo, Question } from '../src/core/models';
import { createJapaneseToEnglishWorksheetPlan } from '../src/pdf/worksheetPlanner';
import { generateWorksheetPdfBlob, loadFontBytesFromDataUrl, type WorksheetPdfFontBytes } from '../src/pdf/worksheetPdf';

const moduleInfo: ModuleInfo = {
  id: 'leap-test',
  folderId: 'english',
  title: 'LEAP 語彙テスト',
  subject: '英語',
  questionIds: []
};

function inputQuestion(index: number): Question {
  return {
    id: `q-${index}`,
    moduleId: moduleInfo.id,
    type: 'input',
    number: 200 + index,
    prompt: `日本語の意味 ${index}`,
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
    answer: '厳しい',
    acceptableAnswers: ['厳しい', '厳格な'],
    direction: 'normal'
  };
}

function messyImportedLeapQuestion(index: number): Question {
  return {
    id: `messy-leap-${index}`,
    moduleId: moduleInfo.id,
    type: 'input',
    number: index,
    prompt: 'modern の意味は？',
    answer: '現代の',
    acceptableAnswers: ['近代的な', '現代的な', '近代の'],
    direction: 'en_to_ja'
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
    expect(plan.rows[0]).toMatchObject({ prompt: '日本語の意味 1', answer: 'english-1' });
  });

  it('reverses clean LEAP-style English prompt and Japanese answer rows for Japanese-to-English output', () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, [leapQuestion(387)], true);
    expect(plan.rows[0]).toMatchObject({
      number: 387,
      prompt: '厳しい；厳格な',
      answer: 'strict'
    });
  });

  it('does not accept messy imported LEAP prompts that should be fixed in the data file', () => {
    const plan = createJapaneseToEnglishWorksheetPlan(moduleInfo, [messyImportedLeapQuestion(301)], true);
    expect(plan.rows).toEqual([]);
    expect(plan.skippedQuestionCount).toBe(1);
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
      prompt: '選択',
      choices: ['a', 'b'],
      answer: 'a'
    };
    const japaneseAnswer: Question = {
      id: 'history',
      moduleId: moduleInfo.id,
      type: 'input',
      prompt: '江戸幕府を開いた人',
      answer: '徳川家康'
    };
    const image: Question = { ...inputQuestion(2), id: 'image', imageAsset: 'images/map.png' };
    const reverse: Question = {
      id: 'reverse',
      moduleId: moduleInfo.id,
      type: 'input',
      number: 203,
      prompt: '日本語の意味 3',
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

  it('decodes embedded base64 font data URLs without fetch', () => {
    expect(loadFontBytesFromDataUrl('data:font/woff;base64,AQID')).toEqual(new Uint8Array([1, 2, 3]));
  });
});
