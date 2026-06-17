// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Question } from '../src/core/models';
import { renderSampleMarks } from '../src/ui/sampleMarks';

const baseQuestion: Question = {
  id: 'map-1',
  moduleId: 'geo',
  type: 'input',
  prompt: '地図でサンプル表示と同じ色の地域名を答えよ。',
  answer: '北海道'
};

describe('sample mark rendering', () => {
  it('renders one sample mark chip with label and description', () => {
    const node = renderSampleMarks({
      ...baseQuestion,
      sampleMarks: [{ label: '地図で塗られている色', color: '#F97316', pattern: 'solid', description: 'この色の地域を答える' }]
    });

    expect(node?.querySelectorAll('.sample-mark-item')).toHaveLength(1);
    expect(node?.textContent).toContain('地図で塗られている色');
    expect(node?.textContent).toContain('この色の地域を答える');
    expect((node?.querySelector('.sample-mark-swatch') as HTMLElement | null)?.style.backgroundColor).toBe('rgb(249, 115, 22)');
  });

  it('renders multiple sample marks', () => {
    const node = renderSampleMarks({
      ...baseQuestion,
      sampleMarks: [
        { label: '縦線', color: '#FFFFFF', pattern: 'vertical_stripes', patternColor: '#111827' },
        { label: '水玉', color: '#FEF3C7', pattern: 'dots', patternColor: '#92400E' }
      ]
    });

    expect(node?.querySelectorAll('.sample-mark-item')).toHaveLength(2);
    expect(node?.textContent).toContain('縦線');
    expect(node?.textContent).toContain('水玉');
  });

  it('renders vertical stripe and dot styles', () => {
    const node = renderSampleMarks({
      ...baseQuestion,
      sampleMarks: [
        { label: '縦線', color: '#FFFFFF', pattern: 'vertical_stripes', patternColor: '#111827' },
        { label: '水玉', color: '#FEF3C7', pattern: 'dots', patternColor: '#92400E' }
      ]
    });
    const swatches = [...(node?.querySelectorAll<HTMLElement>('.sample-mark-swatch') ?? [])];

    expect(swatches[0].dataset.pattern).toBe('vertical_stripes');
    expect(swatches[0].style.backgroundImage).toContain('repeating-linear-gradient');
    expect(swatches[1].dataset.pattern).toBe('dots');
    expect(swatches[1].style.backgroundImage).toContain('radial-gradient');
  });

  it('renders legacy sampleColors as solid sample marks', () => {
    const node = renderSampleMarks({
      ...baseQuestion,
      sampleColors: [{ label: '旧形式の色', color: '#2563EB', description: '後方互換' }]
    });

    expect(node?.querySelectorAll('.sample-mark-item')).toHaveLength(1);
    expect(node?.textContent).toContain('旧形式の色');
    expect(node?.textContent).toContain('後方互換');
    expect((node?.querySelector('.sample-mark-swatch') as HTMLElement | null)?.dataset.pattern).toBe('solid');
  });
});
