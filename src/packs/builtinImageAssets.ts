const BUILTIN_IMAGE_URLS: Record<string, string> = {
  'images/history/graph63.png': new URL('../../public/images/history/graph63.png', import.meta.url).href,
  'images/history/map62.png': new URL('../../public/images/history/map62.png', import.meta.url).href,
  'images/history/map64.png': new URL('../../public/images/history/map64.png', import.meta.url).href,
  'images/history/relation63.png': new URL('../../public/images/history/relation63.png', import.meta.url).href
};

export function resolveBuiltinImageAsset(path: string): string | undefined {
  return BUILTIN_IMAGE_URLS[path];
}
