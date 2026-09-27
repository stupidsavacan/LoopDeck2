import type { ModuleInfo } from '../core/models';

type ModuleCardMeta = {
  accent: string;
  accentColor?: string;
  subtitle: string;
  description: string;
  tags: string[];
};

const DEFAULT_MODULE_ACCENT = '#2563eb';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const SUBJECT_COLOR_FALLBACKS: Array<{ keywords: string[]; accent: string; accentColor: string }> = [
  { keywords: ['geography', 'geo', '地理'], accent: '#15803D', accentColor: '#DCFCE7' },
  { keywords: ['history', 'historical', '歴史'], accent: '#92400E', accentColor: '#FEF3C7' },
  { keywords: ['biology', 'bio', '生物'], accent: '#16A34A', accentColor: '#DCFCE7' },
  { keywords: ['chemistry', 'chemical', '化学'], accent: '#EA580C', accentColor: '#FFEDD5' },
  { keywords: ['english', 'leap', '英語', '英単語'], accent: '#2563EB', accentColor: '#DBEAFE' },
  { keywords: ['kobun', 'japanese', '古文', '国語'], accent: '#9333EA', accentColor: '#F3E8FF' },
  { keywords: ['math', '数学'], accent: '#0891B2', accentColor: '#CFFAFE' }
];

function validHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  return HEX_COLOR.test(color) ? color : undefined;
}

function inferModuleColors(module: ModuleInfo): { accent: string; accentColor?: string } {
  const haystack = [
    module.id,
    module.title,
    module.subject,
    ...(module.tags ?? [])
  ].join(' ').toLocaleLowerCase();

  const fallback = SUBJECT_COLOR_FALLBACKS.find((entry) => entry.keywords.some((keyword) => haystack.includes(keyword.toLocaleLowerCase())));
  return fallback ? { accent: fallback.accent, accentColor: fallback.accentColor } : { accent: DEFAULT_MODULE_ACCENT };
}

function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable in some embedded contexts.
  }
}

export function moduleMeta(module: ModuleInfo): ModuleCardMeta {
  const inferred = inferModuleColors(module);
  return {
    accent: validHexColor(module.color) ?? validHexColor(module.accent) ?? inferred.accent,
    accentColor: validHexColor(module.accentColor) ?? inferred.accentColor,
    subtitle: module.subtitle?.trim() || module.subject,
    description: module.description ?? 'シャッフルで学習します。',
    tags: module.tags?.slice(0, 4) ?? [module.subject]
  };
}


