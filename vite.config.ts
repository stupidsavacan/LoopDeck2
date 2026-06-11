import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const BASE64_FONT_QUERY = '?base64';

function inlineBase64Fonts(): Plugin {
  return {
    name: 'loopdeck-inline-base64-fonts',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.endsWith(BASE64_FONT_QUERY)) return null;
      const fontPath = source.slice(0, -BASE64_FONT_QUERY.length);
      if (fontPath.startsWith('@fontsource/')) return `${resolve(process.cwd(), 'node_modules', fontPath)}${BASE64_FONT_QUERY}`;
      if (fontPath.startsWith('.') && importer) return `${resolve(dirname(importer.split('?')[0]), fontPath)}${BASE64_FONT_QUERY}`;
      return null;
    },
    load(id) {
      if (!id.endsWith(BASE64_FONT_QUERY)) return null;
      const fontPath = id.slice(0, -BASE64_FONT_QUERY.length);
      const base64 = readFileSync(fontPath).toString('base64');
      return `export default ${JSON.stringify(`data:font/woff;base64,${base64}`)};`;
    }
  };
}

export default defineConfig({
  root: '.',
  base: './',
  plugins: [inlineBase64Fonts()],
  server: {
    port: 5173
  },
  build: {
    outDir: 'dist'
  }
});
