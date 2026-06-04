import builtinQuestionPack from '../../data/builtin/loopdeck_builtin.loopdeck.json';
import type { LoopDeckPack } from '../core/models';
import { validatePack } from './packValidator';
import { normalizeBuiltinPack } from './builtinNormalizer';

export function loadBuiltinPacks(): LoopDeckPack[] {
  const normalizedPack = normalizeBuiltinPack(builtinQuestionPack);
  const result = validatePack(normalizedPack);
  if (!result.ok || !result.pack) {
    console.error(result.issues);
    throw new Error('Built-in LoopDeck pack is invalid.');
  }
  return [result.pack];
}
