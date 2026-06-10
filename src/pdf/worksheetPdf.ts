import japaneseFontUrl from '@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff?url';
import latinFontUrl from '@fontsource/noto-sans-jp/files/noto-sans-jp-latin-400-normal.woff?url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import type { WorksheetPage, WorksheetPlan, WorksheetRow } from './worksheetPlanner';

export interface WorksheetPdfFontBytes {
  japanese: Uint8Array;
  latin: Uint8Array;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 28;
const TABLE_TOP = 768;
const TABLE_BOTTOM = 42;
const ROW_HEIGHT = (TABLE_TOP - TABLE_BOTTOM) / 26;
const NO_COLUMN_WIDTH = 48;
const PROMPT_COLUMN_WIDTH = 330;
const ANSWER_COLUMN_WIDTH = A4_WIDTH - MARGIN_X * 2 - NO_COLUMN_WIDTH - PROMPT_COLUMN_WIDTH;
const TEXT_COLOR = rgb(0.08, 0.11, 0.18);
const LINE_COLOR = rgb(0.42, 0.47, 0.55);

type WorksheetFonts = { japanese: PDFFont; latin: PDFFont };

type TextRun = { text: string; font: PDFFont };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateFontBytes(bytes: Uint8Array): Uint8Array {
  if (!bytes.length) throw new Error('Japanese PDF font is empty.');
  return bytes;
}

async function fetchFont(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return validateFontBytes(new Uint8Array(await response.arrayBuffer()));
}

function xhrFont(url: string): Promise<Uint8Array> {
  if (typeof XMLHttpRequest === 'undefined') throw new Error('XMLHttpRequest is not available.');
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    request.onload = () => {
      const status = request.status;
      if (status && (status < 200 || status >= 300)) {
        reject(new Error(`HTTP ${status}`));
        return;
      }
      try {
        resolve(validateFontBytes(new Uint8Array(request.response as ArrayBuffer)));
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(new Error('XMLHttpRequest failed.'));
    request.send();
  });
}

export async function loadFontBytesFromUrl(url: string): Promise<Uint8Array> {
  let fetchError: unknown;
  try {
    return await fetchFont(url);
  } catch (error) {
    fetchError = error;
  }

  try {
    return await xhrFont(url);
  } catch (xhrError) {
    throw new Error(`Japanese PDF font could not be loaded. fetch failed: ${errorMessage(fetchError)}; xhr failed: ${errorMessage(xhrError)}`);
  }
}

export async function loadWorksheetPdfFontBytes(): Promise<WorksheetPdfFontBytes> {
  const [japanese, latin] = await Promise.all([loadFontBytesFromUrl(japaneseFontUrl), loadFontBytesFromUrl(latinFontUrl)]);
  return { japanese, latin };
}

function fontForCharacter(character: string, fonts: WorksheetFonts): PDFFont {
  return /^[\u0000-\u024f]$/.test(character) ? fonts.latin : fonts.japanese;
}

function textRuns(text: string, fonts: WorksheetFonts): TextRun[] {
  const runs: TextRun[] = [];
  for (const character of text) {
    const font = fontForCharacter(character, fonts);
    const last = runs[runs.length - 1];
    if (last?.font === font) last.text += character;
    else runs.push({ text: character, font });
  }
  return runs;
}

function textWidth(text: string, fonts: WorksheetFonts, size: number): number {
  return textRuns(text, fonts).reduce((width, run) => width + run.font.widthOfTextAtSize(run.text, size), 0);
}

function drawMixedText(page: PDFPage, text: string, fonts: WorksheetFonts, x: number, y: number, size: number): void {
  let cursor = x;
  for (const run of textRuns(text, fonts)) {
    page.drawText(run.text, { x: cursor, y, size, font: run.font, color: TEXT_COLOR });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  }
}

function wrapText(text: string, fonts: WorksheetFonts, size: number, maxWidth: number, maxLines = 2): string[] {
  const lines: string[] = [];
  let current = '';
  for (const character of text.trim()) {
    if (textWidth(current + character, fonts, size) <= maxWidth || !current) current += character;
    else {
      lines.push(current);
      current = character;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.join('').length < text.trim().length) {
    let last = lines[maxLines - 1] ?? '';
    while (last && textWidth(`${last}\u2026`, fonts, size) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}\u2026`;
  }
  return lines;
}

function fitLines(text: string, fonts: WorksheetFonts, maxWidth: number): { lines: string[]; size: number } {
  for (const size of [9, 8, 7]) {
    const lines = wrapText(text, fonts, size, maxWidth, 2);
    if (lines.join('').replace(/\u2026$/, '').length >= text.trim().length) return { lines, size };
  }
  return { lines: wrapText(text, fonts, 7, maxWidth, 2), size: 7 };
}

function drawCellText(page: PDFPage, text: string, fonts: WorksheetFonts, x: number, rowTop: number, width: number): void {
  const { lines, size } = fitLines(text, fonts, width - 10);
  const lineHeight = size + 1.5;
  const contentHeight = lines.length * lineHeight;
  const firstY = rowTop - (ROW_HEIGHT - contentHeight) / 2 - size;
  lines.forEach((line, index) => drawMixedText(page, line, fonts, x + 5, firstY - index * lineHeight, size));
}

function drawLine(page: PDFPage, start: { x: number; y: number }, end: { x: number; y: number }, thickness = 0.65): void {
  page.drawLine({ start, end, thickness, color: LINE_COLOR });
}

function drawTable(page: PDFPage, worksheetPage: WorksheetPage, fonts: WorksheetFonts): void {
  const left = MARGIN_X;
  const noRight = left + NO_COLUMN_WIDTH;
  const promptRight = noRight + PROMPT_COLUMN_WIDTH;
  const right = promptRight + ANSWER_COLUMN_WIDTH;
  const tableHeight = ROW_HEIGHT * 26;

  for (const x of [left, noRight, promptRight, right]) drawLine(page, { x, y: TABLE_TOP }, { x, y: TABLE_TOP - tableHeight });
  for (let row = 0; row <= 26; row += 1) {
    const y = TABLE_TOP - row * ROW_HEIGHT;
    drawLine(page, { x: left, y }, { x: right, y });
  }

  drawCellText(page, 'No.', fonts, left, TABLE_TOP, NO_COLUMN_WIDTH);
  drawCellText(page, '\u65e5\u672c\u8a9e\u306e\u610f\u5473 / \u554f\u984c', fonts, noRight, TABLE_TOP, PROMPT_COLUMN_WIDTH);
  drawCellText(page, '\u82f1\u8a9e', fonts, promptRight, TABLE_TOP, ANSWER_COLUMN_WIDTH);

  worksheetPage.rows.forEach((row, index) => {
    const rowTop = TABLE_TOP - (index + 1) * ROW_HEIGHT;
    drawCellText(page, String(row.number), fonts, left, rowTop, NO_COLUMN_WIDTH);
    drawCellText(page, row.prompt, fonts, noRight, rowTop, PROMPT_COLUMN_WIDTH);
    if (worksheetPage.kind === 'answers') drawCellText(page, row.answer, fonts, promptRight, rowTop, ANSWER_COLUMN_WIDTH);
  });
}

function drawHeader(page: PDFPage, plan: WorksheetPlan, worksheetPage: WorksheetPage, fonts: WorksheetFonts): void {
  const kind = worksheetPage.kind === 'questions' ? '\u554f\u984c' : '\u89e3\u7b54';
  const title = `${plan.moduleTitle}  [${kind}]`;
  const fitted = fitLines(title, fonts, A4_WIDTH - MARGIN_X * 2);
  drawMixedText(page, fitted.lines[0] ?? title, fonts, MARGIN_X, 807, 14);
  drawMixedText(page, `${plan.rangeLabel} / 25\u554f\u3054\u3068`, fonts, MARGIN_X, 784, 9);
  drawMixedText(page, `${worksheetPage.pageNumber} / ${plan.pages.length}`, fonts, A4_WIDTH - 78, 22, 8);
}

export async function generateWorksheetPdfBlob(plan: WorksheetPlan, providedFonts?: WorksheetPdfFontBytes): Promise<Blob> {
  if (!plan.pages.length) throw new Error('PDF\u306b\u51fa\u529b\u3067\u304d\u308b\u5165\u529b\u5f0f\u306e\u554f\u984c\u304c\u3042\u308a\u307e\u305b\u3093\u3002');
  const fontBytes = providedFonts ?? (await loadWorksheetPdfFontBytes());
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fonts: WorksheetFonts = {
    japanese: await document.embedFont(fontBytes.japanese, { subset: true }),
    latin: await document.embedFont(fontBytes.latin, { subset: true })
  };

  for (const worksheetPage of plan.pages) {
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeader(page, plan, worksheetPage, fonts);
    drawTable(page, worksheetPage, fonts);
  }

  const bytes = await document.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
