import { describe, expect, it } from 'vitest';
import builtinPackData from '../data/builtin/studyhome_rescued.loopdeck.json';
import { createSession } from '../src/core/sessionEngine';
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

  it('does not include reverse practice modules or questions', () => {
    expect(pack.modules.some((module) => REVERSE_MODULE_IDS.has(module.id))).toBe(false);
    expect(pack.questions.some((question) => REVERSE_MODULE_IDS.has(question.moduleId))).toBe(false);
  });

  it('keeps 古文単語 empty and hides it from normal study cards', () => {
    const kobunVocab = pack.modules.find((module) => module.id === 'kobun_vocab' || module.title === '古文単語');
    expect(kobunVocab?.questionIds.length).toBe(0);
    expect(getVisibleBuiltinModules(pack.modules).some((module) => module.id === kobunVocab?.id)).toBe(false);
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
