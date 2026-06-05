import { describe, expect, it } from 'vitest';
import type { LoopDeckPack, ModuleInfo } from '../src/core/models';
import { buildHomeFolders, homeModuleMatches } from '../src/screens/homeFolders';

function module(overrides: Partial<ModuleInfo> & Pick<ModuleInfo, 'id' | 'title'>): ModuleInfo {
  return {
    id: overrides.id,
    folderId: overrides.folderId ?? '',
    title: overrides.title,
    subject: overrides.subject ?? 'テスト',
    description: overrides.description,
    tags: overrides.tags,
    questionIds: overrides.questionIds ?? [`${overrides.id}-q1`]
  };
}

function pack(overrides: Partial<LoopDeckPack>): LoopDeckPack {
  return {
    packVersion: 1,
    packId: overrides.packId ?? 'pack',
    title: overrides.title ?? 'Pack',
    description: overrides.description,
    folders: overrides.folders ?? [],
    modules: overrides.modules ?? [],
    questions: overrides.questions ?? []
  };
}

describe('Home folder grouping', () => {
  const history = module({ id: 'history', folderId: 'social', title: '歴史総合', subject: '社会' });
  const leapFinal = module({ id: 'leap_final', folderId: 'english', title: 'LEAP 201〜300', subject: '英語' });
  const finalChemistry = module({ id: 'term1_final_chemistry', folderId: 'term1_final', title: '化学 期末', subject: '理科', tags: ['化学', '期末'] });
  const term2Chemistry = module({ id: 'term2_midterm_chemistry', folderId: 'term2_midterm', title: '化学 2学期中間', subject: '理科', tags: ['化学', '2学期中間'] });
  const unknownFolder = module({ id: 'mystery_math', folderId: 'unknown_folder', title: '数学 追加', subject: '数学' });
  const emptyFolder = module({ id: 'empty_folder_module', folderId: '', title: '空フォルダ教材', subject: '追加' });
  const missingFolder = { id: 'missing_folder_module', title: 'フォルダ未設定教材', subject: '追加', questionIds: ['missing-q1'] } as ModuleInfo;

  const packs = [
    pack({
      packId: 'loopdeck-builtin-v1',
      folders: [{ id: 'social', title: '社会' }, { id: 'english', title: '英語' }],
      modules: [history, leapFinal]
    }),
    pack({
      packId: 'term1-final-extra-pack',
      folders: [{ id: 'term1_final', title: '別名の期末フォルダ' }],
      modules: [finalChemistry]
    }),
    pack({
      packId: 'term2-midterm-pack',
      folders: [{ id: 'term2_midterm', title: '2学期中間テスト' }],
      modules: [term2Chemistry]
    }),
    pack({
      packId: 'fallback-pack',
      modules: [unknownFolder, emptyFolder, missingFolder]
    })
  ];

  const visibleModules = packs.flatMap((item) => item.modules);
  const folders = buildHomeFolders(packs, visibleModules);

  it('keeps built-in Home folders first with their built-in titles', () => {
    expect(folders.map((folder) => folder.id).slice(0, 2)).toEqual(['term1_midterm', 'term1_final']);
    expect(folders[0].title).toBe('一学期中間テスト');
    expect(folders[1].title).toBe('一学期期末テスト');
  });

  it('keeps built-in modules in their expected Home folders', () => {
    expect(folders.find((folder) => folder.id === 'term1_midterm')?.moduleIds).toContain('history');
    expect(folders.find((folder) => folder.id === 'term1_final')?.moduleIds).toContain('leap_final');
  });

  it('places imported modules into existing Home folders by folderId', () => {
    const finalFolder = folders.find((folder) => folder.id === 'term1_final');

    expect(finalFolder?.moduleIds).toEqual(['leap_final', 'term1_final_chemistry']);
  });

  it('creates JSON-defined folders and places matching imported modules inside', () => {
    const term2Folder = folders.find((folder) => folder.id === 'term2_midterm');

    expect(term2Folder?.title).toBe('2学期中間テスト');
    expect(term2Folder?.moduleIds).toEqual(['term2_midterm_chemistry']);
  });

  it('falls back to その他 for unknown, empty, or missing folder ids', () => {
    const other = folders[folders.length - 1];

    expect(other?.id).toBe('other');
    expect(other?.title).toBe('その他');
    expect(other?.moduleIds).toEqual(['mystery_math', 'empty_folder_module', 'missing_folder_module']);
  });

  it('keeps fallback last', () => {
    expect(folders.map((folder) => folder.id)).toEqual(['term1_midterm', 'term1_final', 'term2_midterm', 'other']);
  });

  it('search still finds imported modules by their own metadata', () => {
    expect(homeModuleMatches(finalChemistry, '期末')).toBe(true);
    expect(homeModuleMatches(term2Chemistry, '2学期')).toBe(true);
    expect(homeModuleMatches(term2Chemistry, '存在しない語')).toBe(false);
  });
});
