import type { FolderInfo, LoopDeckPack, ModuleInfo } from '../core/models';

export type HomeFolder = {
  kind: 'authored' | 'fallback';
  id: string;
  title: string;
  description: string;
  moduleIds: string[];
  tags: string[];
};

export type HomeModuleSearchMeta = {
  subtitle?: string;
  description?: string;
  tags?: string[];
};

const OTHER_HOME_FOLDER: FolderInfo = {
  id: 'other',
  title: 'その他',
  description: '追加で読み込んだ教材',
  tags: ['追加教材', 'LoopDeck']
};

function cleanId(id: unknown): string {
  return typeof id === 'string' ? id.trim() : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function unique(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function folderTags(folder: FolderInfo, modules: ModuleInfo[]): string[] {
  if (stringList(folder.tags).length) return stringList(folder.tags);
  return unique(modules.flatMap((module) => [module.subject, ...stringList(module.tags)])).slice(0, 8);
}

/**
 * Home follows the same weak-to-strong precedence used by pack resolution:
 * later packs replace metadata for an existing folder id while the folder keeps
 * its first position in the shelf order.
 */
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

  const folderById = new Map<string, FolderInfo>();
  const folderOrder: string[] = [];
  for (const pack of packs) {
    for (const folder of pack.folders ?? []) {
      const id = cleanId(folder.id);
      if (!id) continue;
      if (!folderById.has(id)) folderOrder.push(id);
      folderById.set(id, { ...folder, id, title: folder.title || id });
    }
  }

  const placed = new Set<string>();
  const folders: HomeFolder[] = [];
  for (const folderId of folderOrder) {
    const folder = folderById.get(folderId);
    if (!folder) continue;
    const moduleIds = unique(moduleIdsByFolder.get(folderId) ?? []).filter((id) => visibleIds.has(id) && !placed.has(id));
    if (!moduleIds.length) continue;

    for (const moduleId of moduleIds) placed.add(moduleId);
    const modules = moduleIds.map((moduleId) => modulesById.get(moduleId)).filter((module): module is ModuleInfo => Boolean(module));
    folders.push({
      kind: 'authored',
      id: folder.id,
      title: folder.title,
      description: folder.description ?? '追加で読み込んだ教材',
      moduleIds,
      tags: folderTags(folder, modules)
    });
  }

  const fallbackIds = visibleModules.filter((module) => !placed.has(module.id)).map((module) => module.id);
  if (fallbackIds.length) {
    const modules = fallbackIds.map((moduleId) => modulesById.get(moduleId)).filter((module): module is ModuleInfo => Boolean(module));
    folders.push({
      kind: 'fallback',
      id: OTHER_HOME_FOLDER.id,
      title: OTHER_HOME_FOLDER.title,
      description: OTHER_HOME_FOLDER.description ?? '',
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
    module.subtitle,
    module.description,
    ...stringList(module.tags),
    meta.subtitle,
    meta.description,
    ...stringList(meta.tags)
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  return text.includes(needle);
}
