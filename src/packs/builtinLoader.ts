import studyHomeRescuedPack from '../../data/builtin/studyhome_rescued.loopdeck.json';
import type { LoopDeckPack } from '../core/models';
import { validatePack } from './packValidator';
import { normalizeStudyHomePack } from './studyhomeNormalizer';

export function loadBuiltinPacks(): LoopDeckPack[] {
  const normalizedPack = normalizeStudyHomePack(studyHomeRescuedPack);
  const result = validatePack(normalizedPack);
  if (!result.ok || !result.pack) {
    console.error(result.issues);
    throw new Error('Built-in StudyHome rescued pack is invalid.');
  }
  return [result.pack];
}
