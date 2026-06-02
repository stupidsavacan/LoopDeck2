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
