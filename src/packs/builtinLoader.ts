import builtinPack from '../../data/builtin/builtin.json';
import type { LoopDeckPack } from '../core/models';
import { validatePack } from './packValidator';

export function loadBuiltinPacks(): LoopDeckPack[] {
  const result = validatePack(builtinPack);
  if (!result.ok || !result.pack) {
    console.error(result.issues);
    throw new Error('Built-in LoopDeck pack is invalid.');
  }
  return [result.pack];
}
