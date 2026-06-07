import { describe, expect, it } from 'vitest';
import builtinPackData from '../data/builtin/loopdeck_builtin.loopdeck.json';
import { buildGeneratedChoices } from '../src/core/choiceGenerator';
import type { InputQuestion } from '../src/core/models';
import { buildRangeOptions, createSession } from '../src/core/sessionEngine';
import { validatePack } from '../src/packs/packValidator';
import { getVisibleBuiltinModules, normalizeBuiltinPack, REVERSE_MODULE_IDS } from '../src/packs/builtinNormalizer';

describe('built-in LoopDeck data', () => {
  const pack = normalizeBuiltinPack(builtinPackData);

  it('loads as the active valid built-in dataset', () => {
    const result = validatePack(pack);
    expect(result.ok).toBe(true);
    expect(pack.modules.length).toBe(10);
    expect(pack.questions.length).toBe(1112);
  });

  it('does not expose source-project wording in active pack metadata', () => {
    const visibleMetadata = {
      packId: pack.packId,
      title: pack.title,
      description: pack.description,
      folders: pack.folders,
      modules: pack.modules.map((module) => ({
        id: module.id,
        folderId: module.folderId,
        title: module.title,
        subject: module.subject,
        description: module.description,
        tags: module.tags
      }))
    };
    expect(JSON.stringify(visibleMetadata)).not.toMatch(/studyhome|rescued|rescue/i);
  });

  it('does not include reverse practice modules or questions', () => {
    expect(pack.modules.some((module) => REVERSE_MODULE_IDS.has(module.id))).toBe(false);
    expect(pack.questions.some((question) => REVERSE_MODULE_IDS.has(question.moduleId))).toBe(false);
  });

  it('keeps 古文単語 empty and hides it from normal study cards', () => {
    const kobunVocab = pack.modules.find((module) => module.id === 'kobun_vocab' || module.title === '古文単語');
    expect(kobunVocab?.questionIds.length).toBe(0);
    expect(getVisibleBuiltinModules(pack.modules).some((module) => module.id === kobunVocab?.id)).toBe(false);
  });

  it('preserves original LEAP titles, question IDs, numbers, and ranges', () => {
    const leapModule = pack.modules.find((module) => module.id === 'leap');
    const leapFinalModule = pack.modules.find((module) => module.id === 'leap_final');
    const leap = pack.questions.filter((question) => question.moduleId === 'leap');
    const leapFinal = pack.questions.filter((question) => question.moduleId === 'leap_final');

    expect(leapModule?.title).toBe('LEAP 001〜200');
    expect(leapFinalModule?.title).toBe('LEAP 201〜300');
    expect(leap.map((question) => question.id)).toEqual(Array.from({ length: 200 }, (_, index) => `leap-${index + 1}`));
    expect(leapFinal.map((question) => question.id)).toEqual(Array.from({ length: 100 }, (_, index) => `leap_final-${index + 201}`));
    expect(leap.map((question) => question.number)).toEqual(Array.from({ length: 200 }, (_, index) => index + 1));
    expect(leapFinal.map((question) => question.number)).toEqual(Array.from({ length: 100 }, (_, index) => index + 201));
    expect(buildRangeOptions(leapFinal).map((option) => option.value)).toEqual(['all', '201-225', '226-250', '251-275', '276-300']);
  });

  it('can generate four choices for the LEAP final input dataset', () => {
    const leapFinal = pack.questions.filter((question): question is InputQuestion => question.moduleId === 'leap_final' && question.type === 'input');
    const choices = buildGeneratedChoices(leapFinal[0], leapFinal, 4, () => 0.25);

    expect(leapFinal).toHaveLength(100);
    expect(choices).toHaveLength(4);
    expect(choices).toContain(leapFinal[0].answer);
  });

  it('can start required built-in modules', () => {
    for (const title of ['LEAP 001〜200', '化学', '歴史総合', '地理総合']) {
      const module = pack.modules.find((item) => item.title === title);
      expect(module, title).toBeTruthy();
      const questions = pack.questions.filter((question) => question.moduleId === module!.id);
      const session = createSession(module!, questions, { shuffle: false, autoNext: true, questionLimit: 'all' });
      expect(session.queue.length, title).toBeGreaterThan(0);
    }
  });
});
