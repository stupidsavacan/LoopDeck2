import type { LoopDeckPack, ModuleInfo } from '../core/models';

export type HomeFolder = {
  id: string;
  title: string;
  description: string;
  moduleIds: string[];
  tags: string[];
};

type HomeFolderSeed = {
  id: string;
  title: string;
  description: string;
  moduleIds?: string[];
  tags?: string[];
};

export type HomeModuleSearchMeta = {
  subtitle?: string;
  description?: string;
  tags?: string[];
};

export const BUILTIN_HOME_FOLDERS: HomeFolderSeed[] = [
  {
    id: 'term1_midterm',
    title: '一学期中間テスト',
    description: '中間テスト用にまとめた教材',
    moduleIds: ['history', 'geography', 'chemistry', 'biology', 'leap', 'english_comm', 'kobun_conjugation', 'english'],
    tags: ['歴史', '地理', '化学', '生物', '英単語 001〜200', '英コミュ', '動詞の活用', '英文暗記']
  },
  {
    id: 'term1_final',
    title: '一学期期末テスト',
    description: '期末テスト用に追加していく教材',
    moduleIds: ['leap_final'],
    tags: ['英単語 201〜300']
  }
];

const OTHER_HOME_FOLDER: HomeFolderSeed = {
  id: 'other',
  title: 'その他',
  description: '追加で読み込んだ教材',
  tags: ['追加教材', 'LoopDeck']
};

function cleanId(id: unknown): string {
  return typeof id === 'string' ? id.trim() : '';
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function folderTags(seed: HomeFolderSeed, modules: ModuleInfo[]): string[] {
  if (seed.tags?.length) return seed.tags;
  return unique(modules.flatMap((module) => [module.subject, ...(module.tags ?? [])])).slice(0, 8);
}

function appendUnique(target: string[], ids: string[], visibleIds: Set<string>, placed: Set<string>): void {
  for (const id of ids) {
    if (!visibleIds.has(id) || placed.has(id) || target.includes(id)) continue;
    target.push(id);
  }
}

export function buildHomeFolders(packs: LoopDeckPack[], visibleModules: ModuleInfo[]): HomeFolder[] {
  const visibleIds = new Set(visibleModules.map((module) => module.id));
  const modulesById = new Map(visibleModules.map((module) => [module.id, module]));
  const moduleIdsByFolder = new Map<string, string[]>();

  for (const module of visibleModules) {
    const folderId = cleanId(module.folderId);
    if (!folderId) continue;
    const ids = moduleIdsByFolder.get(folderId) ?? [];
    ids.push(module.id);
    moduleIdsByFolder.set(folderId, ids);
  }

  const folderSeeds = new Map<string, HomeFolderSeed>();
  const folderOrder: string[] = [];
  const addFolder = (seed: HomeFolderSeed): void => {
    const id = cleanId(seed.id);
    if (!id || folderSeeds.has(id)) return;
    folderSeeds.set(id, { ...seed, id });
    folderOrder.push(id);
  };

  for (const folder of BUILTIN_HOME_FOLDERS) addFolder(folder);
  for (const pack of packs) {
    for (const folder of pack.folders ?? []) {
      addFolder({
        id: folder.id,
        title: folder.title || folder.id,
        description: '追加で読み込んだ教材'
      });
    }
  }

  const placed = new Set<string>();
  const folders: HomeFolder[] = [];
  for (const folderId of folderOrder) {
    const seed = folderSeeds.get(folderId);
    if (!seed) continue;

    const moduleIds: string[] = [];
    appendUnique(moduleIds, seed.moduleIds ?? [], visibleIds, placed);
    appendUnique(moduleIds, moduleIdsByFolder.get(folderId) ?? [], visibleIds, placed);
    if (!moduleIds.length) continue;

    for (const moduleId of moduleIds) placed.add(moduleId);
    const modules = moduleIds.map((moduleId) => modulesById.get(moduleId)).filter((module): module is ModuleInfo => Boolean(module));
    folders.push({
      id: seed.id,
      title: seed.title,
      description: seed.description,
      moduleIds,
      tags: folderTags(seed, modules)
    });
  }

  const fallbackIds = visibleModules.filter((module) => !placed.has(module.id)).map((module) => module.id);
  if (fallbackIds.length) {
    const modules = fallbackIds.map((moduleId) => modulesById.get(moduleId)).filter((module): module is ModuleInfo => Boolean(module));
    folders.push({
      id: OTHER_HOME_FOLDER.id,
      title: OTHER_HOME_FOLDER.title,
      description: OTHER_HOME_FOLDER.description,
      moduleIds: fallbackIds,
      tags: folderTags(OTHER_HOME_FOLDER, modules)
    });
  }

  return folders;
}

export function homeModuleMatches(module: ModuleInfo, query: string, meta: HomeModuleSearchMeta = {}): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const text = [
    module.title,
    module.subject,
    module.description,
    ...(module.tags ?? []),
    meta.subtitle,
    meta.description,
    ...(meta.tags ?? [])
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  return text.includes(needle);
}
