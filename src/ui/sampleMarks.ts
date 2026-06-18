import type { Question, QuestionSampleMark, QuestionSamplePattern } from '../core/models';
import { el } from './dom';

const DEFAULT_PATTERN_COLOR = '#111827';

function legacySampleColors(question: Question): QuestionSampleMark[] {
  return (question.sampleColors ?? []).map((sample) => ({
    label: sample.label,
    color: sample.color,
    pattern: 'solid',
    description: sample.description
  }));
}

export function getQuestionSampleMarks(question: Question): QuestionSampleMark[] {
  return question.sampleMarks?.length ? question.sampleMarks : legacySampleColors(question);
}

function sampleBackground(color: string, pattern: QuestionSamplePattern = 'solid', patternColor = DEFAULT_PATTERN_COLOR): string {
  switch (pattern) {
    case 'vertical_stripes':
      return `repeating-linear-gradient(90deg, ${patternColor} 0 2px, ${color} 2px 8px)`;
    case 'horizontal_stripes':
      return `repeating-linear-gradient(0deg, ${patternColor} 0 2px, ${color} 2px 8px)`;
    case 'diagonal_stripes':
      return `repeating-linear-gradient(45deg, ${patternColor} 0 2px, ${color} 2px 8px)`;
    case 'cross_hatch':
      return `repeating-linear-gradient(45deg, transparent 0 6px, ${patternColor} 6px 8px), repeating-linear-gradient(-45deg, transparent 0 6px, ${patternColor} 6px 8px), ${color}`;
    case 'dots':
      return `radial-gradient(${patternColor} 20%, transparent 21%), ${color}`;
    case 'grid':
      return `repeating-linear-gradient(90deg, ${patternColor} 0 1px, transparent 1px 8px), repeating-linear-gradient(0deg, ${patternColor} 0 1px, transparent 1px 8px), ${color}`;
    case 'solid':
    default:
      return color;
  }
}

export function renderSampleMarks(question: Question): HTMLElement | undefined {
  const marks = getQuestionSampleMarks(question);
  if (!marks.length) return undefined;

  const list = el('div', 'sample-mark-list');
  for (const mark of marks) {
    const item = el('div', 'sample-mark-item');
    const swatch = el('span', 'sample-mark-swatch');
    swatch.style.background = sampleBackground(mark.color, mark.pattern, mark.patternColor);
    if (mark.pattern === 'dots') swatch.style.backgroundSize = '10px 10px';
    swatch.setAttribute('aria-hidden', 'true');

    const text = el('div', 'sample-mark-text');
    text.append(el('strong', 'sample-mark-label', mark.label));
    if (mark.description) text.append(el('span', 'sample-mark-description', mark.description));
    item.append(swatch, text);
    list.append(item);
  }

  return list;
}
