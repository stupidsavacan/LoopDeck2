import { describe, expect, it } from 'vitest';
import packAuthoringPrompt from '../src/packs/packAuthoringPrompt.txt?raw';

describe('pack authoring prompt', () => {
  it('ships a non-empty current authoring contract', () => {
    expect(packAuthoringPrompt.length).toBeGreaterThan(4000);
    expect(packAuthoringPrompt).toContain('multi_select');
    expect(packAuthoringPrompt).toContain('answerJudging');
    expect(packAuthoringPrompt).toContain('supportedStudyModes');
    expect(packAuthoringPrompt).toContain('choiceCandidates');
    expect(packAuthoringPrompt).toContain('manifest.json');
  });
});
