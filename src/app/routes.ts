export type AppRoute =
  | { name: 'today' }
  | { name: 'library' }
  | { name: 'module'; moduleId: string }
  | { name: 'moduleCustom'; moduleId: string }
  | { name: 'progress'; view: 'overview' | 'attention' | 'history' }
  | { name: 'more' }
  | { name: 'focus' }
  | { name: 'packs'; mode: 'manage' | 'import' }
  | { name: 'pdfWorksheet' }
  | { name: 'debugLog' }
  | { name: 'study'; sessionId: string; phase: 'player' | 'checkpoint' | 'complete' };

export function routeHash(route: AppRoute): string {
  switch (route.name) {
    case 'today': return '#today';
    case 'library': return '#library';
    case 'module': return `#module/${encodeURIComponent(route.moduleId)}`;
    case 'moduleCustom': return `#module/${encodeURIComponent(route.moduleId)}/custom`;
    case 'progress': return route.view === 'overview' ? '#progress' : `#progress/${route.view}`;
    case 'more': return '#more';
    case 'focus': return '#focus';
    case 'packs': return route.mode === 'import' ? '#packs/import' : '#packs';
    case 'pdfWorksheet': return '#pdf-worksheet';
    case 'debugLog': return '#debug-log';
    case 'study': return `#study/${encodeURIComponent(route.sessionId)}${route.phase === 'player' ? '' : `/${route.phase}`}`;
  }
}

function decode(value: string): string | undefined {
  try { return decodeURIComponent(value); } catch { return undefined; }
}

export interface ParsedRoute { route: AppRoute; canonical: boolean; }

export function parseRoute(hash: string): ParsedRoute {
  const value = hash.replace(/^#\/?/, '');
  if (!value || value === 'home') return { route: { name: 'today' }, canonical: value === 'today' };
  if (value === 'today') return { route: { name: 'today' }, canonical: true };
  if (value === 'library') return { route: { name: 'library' }, canonical: true };
  if (value === 'review') return { route: { name: 'progress', view: 'attention' }, canonical: false };
  if (value === 'graphs') return { route: { name: 'progress', view: 'overview' }, canonical: false };
  if (value === 'import') return { route: { name: 'packs', mode: 'manage' }, canonical: false };
  if (value === 'progress') return { route: { name: 'progress', view: 'overview' }, canonical: true };
  if (value === 'progress/attention') return { route: { name: 'progress', view: 'attention' }, canonical: true };
  if (value === 'progress/history') return { route: { name: 'progress', view: 'history' }, canonical: true };
  if (value === 'more') return { route: { name: 'more' }, canonical: true };
  if (value === 'focus') return { route: { name: 'focus' }, canonical: true };
  if (value === 'packs') return { route: { name: 'packs', mode: 'manage' }, canonical: true };
  if (value === 'packs/import') return { route: { name: 'packs', mode: 'import' }, canonical: true };
  if (value === 'pdf-worksheet') return { route: { name: 'pdfWorksheet' }, canonical: true };
  if (value === 'debug-log') return { route: { name: 'debugLog' }, canonical: true };

  const parts = value.split('/');
  if (parts[0] === 'module' && parts[1]) {
    const moduleId = decode(parts[1]);
    if (moduleId && parts.length === 2) return { route: { name: 'module', moduleId }, canonical: true };
    if (moduleId && parts[2] === 'custom' && parts.length === 3) return { route: { name: 'moduleCustom', moduleId }, canonical: true };
  }
  if (parts[0] === 'study' && parts[1]) {
    const sessionId = decode(parts[1]);
    if (sessionId && parts.length === 2) return { route: { name: 'study', sessionId, phase: 'player' }, canonical: true };
    if (sessionId && (parts[2] === 'checkpoint' || parts[2] === 'complete') && parts.length === 3) {
      return { route: { name: 'study', sessionId, phase: parts[2] }, canonical: true };
    }
  }
  return { route: { name: 'today' }, canonical: false };
}

export function mainSection(route: AppRoute): 'today' | 'library' | 'progress' | 'more' | undefined {
  if (route.name === 'today') return 'today';
  if (route.name === 'library' || route.name === 'module' || route.name === 'moduleCustom') return 'library';
  if (route.name === 'progress') return 'progress';
  if (route.name === 'more' || route.name === 'focus' || route.name === 'packs' || route.name === 'pdfWorksheet' || route.name === 'debugLog') return 'more';
  return undefined;
}
