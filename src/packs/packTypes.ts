import type { LoopDeckPack } from '../core/models';

export interface PackValidationIssue {
  level: 'error' | 'warning';
  message: string;
  path?: string;
}

export interface ImportedPackAsset {
  packId: string;
  path: string;
  mimeType: string;
  dataUrl: string;
}

export interface PackValidationResult {
  ok: boolean;
  issues: PackValidationIssue[];
  pack?: LoopDeckPack;
  assets?: ImportedPackAsset[];
}

export const FORBIDDEN_EXTENSIONS = [
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.apk',
  '.dex',
  '.jar',
  '.so',
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1'
];

export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
