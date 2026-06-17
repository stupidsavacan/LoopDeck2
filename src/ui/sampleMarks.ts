import type { Question, QuestionSampleMark, QuestionSamplePattern } from '../core/models';
import { el } from './dom';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SAMPLE_PATTERNS = new Set<QuestionSamplePattern>([
  'solid',
  'vertical_stripes',
  'horizontal_stripes',
  'diagonal_stripes',
  'cross_hatch',
  'dots',
  'grid'
]);

function safeColor(value: string | undefined, fallback: string): string {
  return value && HEX_COLOR.test(value) ? value : fallback;
}

function safePattern(value: QuestionSamplePattern | undefined): QuestionSamplePattern {
  return value && SAMPLE_PATTERNS.has(value) ? value : 'solid';
}

export function normalizeSampleMarks(question: Question): QuestionSampleMark[] {
  if (Array.isArray(question.sampleMarks) && question.sampleMarks.length) return question.sampleMarks;
  if (!Array.isArray(question.sampleColors)) return [];

  return question.sampleColors.map((sample) => ({
    label: sample.label,
    color: sample.color,
    pattern: 'solid',
    description: sample.description
  }));
}

function stripe(direction: string, color: string, patternColor: string): string {
  return `repeating-linear-gradient(${direction}, ${patternColor} 0px, ${patternColor} 2px, ${color} 2px, ${color} 8px)`;
}

function applySampleMarkStyle(swatch: HTMLElement, mark: QuestionSampleMark): void {
  const color = safeColor(mark.color, '#ffffff');
  const patternColor = safeColor(mark.patternColor, '#111827');
  const pattern = safePattern(mark.pattern);

  swatch.dataset.pattern = pattern;
  swatch.style.backgroundColor = color;

  if (pattern === 'solid') return;
  if (pattern === 'vertical_stripes') swatch.style.backgroundImage = stripe('90deg', color, patternColor);
  if (pattern === 'horizontal_stripes') swatch.style.backgroundImage = stripe('0deg', color, patternColor);
  if (pattern === 'diagonal_stripes') swatch.style.backgroundImage = stripe('45deg', color, patternColor);
  if (pattern === 'cross_hatch') {
    swatch.style.backgroundImage = [
      `repeating-linear-gradient(45deg, ${patternColor} 0px, ${patternColor} 2px, transparent 2px, transparent 8px)`,
      stripe('135deg', color, patternColor)
    ].join(', ');
  }
  if (pattern === 'dots') {
    swatch.style.backgroundImage = `radial-gradient(circle, ${patternColor} 0px, ${patternColor} 2px, transparent 2px, transparent 5px)`;
    swatch.style.backgroundSize = '10px 10px';
  }
  if (pattern === 'grid') {
    swatch.style.backgroundImage = [
      `repeating-linear-gradient(90deg, ${patternColor} 0px, ${patternColor} 1px, transparent 1px, transparent 8px)`,
      `repeating-linear-gradient(0deg, ${patternColor} 0px, ${patternColor} 1px, ${color} 1px, ${color} 8px)`
    ].join(', ');
  }
}

export function renderSampleMarks(question: Question): HTMLElement | undefined {
  const marks = normalizeSampleMarks(question).filter((mark) => mark.label.trim() && mark.color.trim());
  if (!marks.length) return undefined;

  const list = el('div', 'sample-mark-list');
  list.setAttribute('aria-label', 'サンプル表示');

  for (const mark of marks) {
    const item = el('div', 'sample-mark-item');
    const swatch = el('span', 'sample-mark-swatch');
    applySampleMarkStyle(swatch, mark);

    const text = el('span', 'sample-mark-text');
    text.append(el('span', 'sample-mark-label', mark.label));
    if (mark.description) text.append(el('span', 'sample-mark-description', mark.description));

    item.append(swatch, text);
    list.append(item);
  }

  return list;
}
