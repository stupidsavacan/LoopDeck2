import type { ModuleInfo } from '../core/models';

export type ModulePresentationMeta = {
  icon: string;
  accent: string;
  accentColor?: string;
  subtitle: string;
  description: string;
  tags: string[];
  folderId: string;
};

const MODULE_PRESENTATION_META: Record<string, ModulePresentationMeta> = {
  history: {
    icon: '歴',
    accent: '#2563eb',
    subtitle: '歴史総合 一問一答',
    description: '帝国主義とアジアの民族運動など、歴史総合の重要語句を短く確認します。',
    tags: ['歴史', '社会', 'テスト'],
    folderId: 'term1_midterm'
  },
  geography: {
    icon: '地',
    accent: '#0f766e',
    subtitle: '地理総合 地形・地誌',
    description: '地形ノート、重要語句、図解系の確認に使う地理教材です。',
    tags: ['地理', '社会', '4択'],
    folderId: 'term1_midterm'
  },
  chemistry: {
    icon: '化',
    accent: '#ea580c',
    subtitle: '化学 一問一答',
    description: '化学の重要語句を短い確認でテンポよく進めます。',
    tags: ['化学', '理科', '入力'],
    folderId: 'term1_midterm'
  },
  biology: {
    icon: '生',
    accent: '#16a34a',
    subtitle: '生物 一問一答',
    description: '生物の重要語句を軽いカード学習として使います。',
    tags: ['生物', '理科', '復習'],
    folderId: 'term1_midterm'
  },
  leap: {
    icon: '単',
    accent: '#7c3aed',
    subtitle: '英単語テスト 001-200',
    description: 'LEAP 001〜200。英単語の確認をシャッフルで進めます。',
    tags: ['英単語', '001-200', '中間'],
    folderId: 'term1_midterm'
  },
  leap_final: {
    icon: '単',
    accent: '#6d28d9',
    subtitle: '英単語テスト 201-300',
    description: 'LEAP 201〜300。期末範囲の英単語を確認します。',
    tags: ['英単語', '201-300', '期末'],
    folderId: 'term1_final'
  },
  english_comm: {
    icon: '英',
    accent: '#2563eb',
    subtitle: '英語コミュニケーション',
    description: 'Switch系の単語、本文理解、翻訳問題をまとめた英コミュ教材。',
    tags: ['英コミュ', '本文', '翻訳'],
    folderId: 'term1_midterm'
  },
  kobun_conjugation: {
    icon: '活',
    accent: '#9333ea',
    subtitle: '古文文法 活用識別',
    description: '動詞の活用、識別ルール、古文本文の確認問題。',
    tags: ['古文', '動詞', '活用'],
    folderId: 'term1_midterm'
  },
  english: {
    icon: '英',
    accent: '#0891b2',
    subtitle: '英語表現 暗唱文テスト',
    description: '英文暗記、穴埋め、英作文系の確認教材。',
    tags: ['暗唱', '穴埋め', '英作文'],
    folderId: 'term1_midterm'
  }
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

export function moduleMeta(module: ModuleInfo): ModulePresentationMeta {
  const defaultMeta = MODULE_PRESENTATION_META[module.id];
  const inferred = inferModuleColors(module);
  const accent = validHexColor(module.color) ?? validHexColor(module.accent) ?? validHexColor(defaultMeta?.accent) ?? inferred.accent;
  const accentColor = validHexColor(module.accentColor) ?? inferred.accentColor;

  if (defaultMeta) {
    return {
      ...defaultMeta,
      accent,
      accentColor,
      description: module.description ?? defaultMeta.description,
      tags: module.tags?.slice(0, 4) ?? defaultMeta.tags,
      folderId: module.folderId || defaultMeta.folderId
    };
  }

  return {
    icon: module.title.slice(0, 1) || '教',
    accent,
    accentColor,
    subtitle: module.subject,
    description: module.description ?? 'シャッフルで学習します。',
    tags: module.tags?.slice(0, 4) ?? [module.subject],
    folderId: module.folderId || 'other'
  };
}
