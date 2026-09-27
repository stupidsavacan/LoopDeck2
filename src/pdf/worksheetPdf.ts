import japaneseFontDataUrl from '@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff?base64';
import latinFontDataUrl from '@fontsource/noto-sans-jp/files/noto-sans-jp-latin-400-normal.woff?base64';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';
import type { WorksheetPage, WorksheetPlan } from './worksheetPlanner';

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
type FittedText = { lines: string[]; size: number; lineHeight: number };

function validateFontBytes(bytes: Uint8Array): Uint8Array {
  if (!bytes.length) throw new Error('Japanese PDF font is empty.');
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function loadFontBytesFromDataUrl(dataUrl: string): Uint8Array {
  const marker = ';base64,';
  const markerIndex = dataUrl.indexOf(marker);
  if (!dataUrl.startsWith('data:') || markerIndex < 0) throw new Error('Embedded Japanese PDF font is not a base64 data URL.');
  return validateFontBytes(base64ToBytes(dataUrl.slice(markerIndex + marker.length)));
}

export async function loadWorksheetPdfFontBytes(): Promise<WorksheetPdfFontBytes> {
  return {
    japanese: loadFontBytesFromDataUrl(japaneseFontDataUrl),
    latin: loadFontBytesFromDataUrl(latinFontDataUrl)
  };
}

function fontForCharacter(character: string, fonts: WorksheetFonts): PDFFont {
  const codePoint = character.codePointAt(0) ?? 0;
  return codePoint <= 0x024f ? fonts.latin : fonts.japanese;
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

const characterWidthCache = new WeakMap<PDFFont, Map<string, number>>();

function characterWidth(character: string, font: PDFFont, size: number): number {
  let cache = characterWidthCache.get(font);
  if (!cache) {
    cache = new Map<string, number>();
    characterWidthCache.set(font, cache);
  }
  const key = `${size}:${character}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const width = font.widthOfTextAtSize(character, size);
  cache.set(key, width);
  return width;
}

function textWidth(text: string, fonts: WorksheetFonts, size: number): number {
  let width = 0;
  for (const character of text) width += characterWidth(character, fontForCharacter(character, fonts), size);
  return width;
}

function drawMixedText(page: PDFPage, text: string, fonts: WorksheetFonts, x: number, y: number, size: number): void {
  let cursor = x;
  for (const run of textRuns(text, fonts)) {
    page.drawText(run.text, { x: cursor, y, size, font: run.font, color: TEXT_COLOR });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  }
}

function wrapText(text: string, fonts: WorksheetFonts, size: number, maxWidth: number): string[] {
  const trimmed = text.trim();
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  for (const character of trimmed) {
    const width = characterWidth(character, fontForCharacter(character, fonts), size);
    if (currentWidth + width <= maxWidth || !current) {
      current += character;
      currentWidth += width;
    } else {
      lines.push(current);
      current = character;
      currentWidth = width;

    }
  }
  if (current) lines.push(current);
  return lines;
}

function fitCellText(text: string, fonts: WorksheetFonts, maxWidth: number): FittedText | undefined {
  for (const size of [9, 8, 7, 6, 5]) {
    const lineHeight = size + 1.25;
    const lines = wrapText(text, fonts, size, maxWidth);
    if (lines.length * lineHeight <= ROW_HEIGHT - 4) return { lines, size, lineHeight };
  }
  return undefined;
}

function fitHeaderTitle(text: string, fonts: WorksheetFonts, maxWidth: number): FittedText | undefined {
  for (const size of [14, 13, 12, 11, 10, 9, 8, 7]) {
    const lineHeight = size + 2;
    const lines = wrapText(text, fonts, size, maxWidth);
    if (lines.length <= 2) return { lines, size, lineHeight };
  }
  return undefined;
}

function drawCellText(
  page: PDFPage,
  text: string,
  fonts: WorksheetFonts,
  x: number,
  rowTop: number,
  width: number,
  context: string
): void {
  const fitted = fitCellText(text, fonts, width - 10);
  if (!fitted) {
    throw new Error(`[PDF-L001] ${context}がPDFセル内に収まりません。内容は省略せず、出力を中止しました。`);
  }
  const contentHeight = fitted.lines.length * fitted.lineHeight;
  const firstY = rowTop - (ROW_HEIGHT - contentHeight) / 2 - fitted.size;
  fitted.lines.forEach((line, index) => drawMixedText(page, line, fonts, x + 5, firstY - index * fitted.lineHeight, fitted.size));
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

  drawCellText(page, 'No.', fonts, left, TABLE_TOP, NO_COLUMN_WIDTH, '表見出し No.');
  drawCellText(page, '日本語の意味 / 問題', fonts, noRight, TABLE_TOP, PROMPT_COLUMN_WIDTH, '表見出し 問題');
  drawCellText(page, '英語', fonts, promptRight, TABLE_TOP, ANSWER_COLUMN_WIDTH, '表見出し 解答');

  worksheetPage.rows.forEach((row, index) => {
    const rowTop = TABLE_TOP - (index + 1) * ROW_HEIGHT;
    drawCellText(page, String(row.number), fonts, left, rowTop, NO_COLUMN_WIDTH, `No.${row.number} の番号`);
    drawCellText(page, row.prompt, fonts, noRight, rowTop, PROMPT_COLUMN_WIDTH, `No.${row.number} の問題文`);
    if (worksheetPage.kind === 'answers') drawCellText(page, row.answer, fonts, promptRight, rowTop, ANSWER_COLUMN_WIDTH, `No.${row.number} の解答`);
  });
}

function drawHeader(page: PDFPage, plan: WorksheetPlan, worksheetPage: WorksheetPage, fonts: WorksheetFonts): void {
  const kind = worksheetPage.kind === 'questions' ? '問題' : '解答';
  const title = `${plan.pdfModuleTitle}  [${kind}]`;
  const fitted = fitHeaderTitle(title, fonts, A4_WIDTH - MARGIN_X * 2);
  if (!fitted) throw new Error('[PDF-L002] PDF見出しがヘッダー領域に収まりません。教材名を短くして再試行してください。');

  const firstY = 815;
  fitted.lines.forEach((line, index) => drawMixedText(page, line, fonts, MARGIN_X, firstY - index * fitted.lineHeight, fitted.size));
  const rangeY = firstY - fitted.lines.length * fitted.lineHeight - 1;
  drawMixedText(page, `${plan.rangeLabel} / 25問ごと`, fonts, MARGIN_X, rangeY, 9);
  drawMixedText(page, `${worksheetPage.pageNumber} / ${plan.pages.length}`, fonts, A4_WIDTH - 78, 22, 8);
}

export async function generateWorksheetPdfBlob(plan: WorksheetPlan, providedFonts?: WorksheetPdfFontBytes): Promise<Blob> {
  if (!plan.pages.length) throw new Error('PDFに出力できる入力式の問題がありません。');
  const fontBytes = providedFonts ?? (await loadWorksheetPdfFontBytes());
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fonts: WorksheetFonts = {
    // @pdf-lib/fontkit has long-standing CJK subsetting bugs that can drop Japanese glyphs.
    // Keep the Japanese font fully embedded; the smaller Latin font can still be subset safely.
    japanese: await document.embedFont(fontBytes.japanese, { subset: false }),
    latin: await document.embedFont(fontBytes.latin, { subset: true })
  };

  for (const worksheetPage of plan.pages) {
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    drawHeader(page, plan, worksheetPage, fonts);
    drawTable(page, worksheetPage, fonts);
  }

  const bytes = await document.save();
  return new Blob([Uint8Array.from(bytes).buffer], { type: 'application/pdf' });
}
