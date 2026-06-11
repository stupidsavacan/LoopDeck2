import { ALLOWED_IMAGE_EXTENSIONS } from './packTypes';

const WINDOWS_ABSOLUTE_PATH = /^[a-zA-Z]:[\\/]/;
const URI_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const SAFE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]*={0,2}$/i;

export function extensionOf(path: string): string {
  const clean = path.split(/[?#]/, 1)[0].toLowerCase();
  const lastSlash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  const dot = clean.lastIndexOf('.');
  return dot > lastSlash ? clean.slice(dot) : '';
}

export function isSafePackPath(path: string): boolean {
  const trimmed = path.trim();
  if (trimmed !== path) return false;
  if (!trimmed || trimmed.includes('\0')) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || WINDOWS_ABSOLUTE_PATH.test(trimmed)) return false;
  if (URI_SCHEME.test(trimmed)) return false;

  const segments = trimmed.replace(/\\/g, '/').split('/');
  return segments.every((segment) => segment !== '' && segment !== '..');
}

export function isSafeImageAssetRef(ref: string): boolean {
  return isSafePackPath(ref) && ALLOWED_IMAGE_EXTENSIONS.includes(extensionOf(ref));
}

export function isSafeImageDataUrl(value: string): boolean {
  return SAFE_IMAGE_DATA_URL.test(value);
}
