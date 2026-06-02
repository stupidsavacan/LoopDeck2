import type { LoopDeckPack } from '../core/models';

export interface PackValidationIssue {
  level: 'error' | 'warning';
  message: string;
  path?: string;
}

export interface PackValidationResult {
  ok: boolean;
  issues: PackValidationIssue[];
  pack?: LoopDeckPack;
}

export const FORBIDDEN_EXTENSIONS = [
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.css',
  '.apk',
  '.dex',
  '.jar',
  '.so',
  '.exe',
  '.bat',
  '.cmd',
  '.sh'
];

export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
