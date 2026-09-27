import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const screensDir = fileURLToPath(new URL('../src/screens/', import.meta.url));

// These are support modules that live beside the route-level screens, not peer screen controllers.
// Any new same-directory dependency must be explicitly justified here or moved to a shared layer.
const allowedScreenLocalImports = new Map<string, string>([
  ['homeScreen.ts -> ./homeFolders', 'Home-only folder/search support with no route-level rendering boundary.'],
  ['moduleScreen.ts -> ./inlineQuiz', 'Reusable inline quiz renderer, not a route-level screen controller.'],
  ['reviewCenter.ts -> ./inlineQuiz', 'Reusable inline quiz renderer, not a route-level screen controller.']
]);

function localScreenImports(fileName: string): string[] {
  const source = readFileSync(resolve(screensDir, fileName), 'utf8');
  const imports: string[] = [];
  const pattern = /from\s+['\"](\.\/[^'\"]+)['\"]/g;
  for (const match of source.matchAll(pattern)) imports.push(match[1]);
  return imports;
}

describe('screen architecture', () => {
  it('does not introduce unreviewed peer imports between src/screens modules', () => {
    const files = readdirSync(screensDir).filter((name) => name.endsWith('.ts'));
    const screenFiles = new Set(files.map((name) => basename(name, '.ts')));
    const violations: string[] = [];
    const seenAllowed = new Set<string>();

    for (const fileName of files) {
      for (const specifier of localScreenImports(fileName)) {
        const target = specifier.slice(2).replace(/\.ts$/, '');
        if (!screenFiles.has(target)) continue;
        const edge = `${fileName} -> ${specifier.replace(/\.ts$/, '')}`;
        if (allowedScreenLocalImports.has(edge)) {
          seenAllowed.add(edge);
          continue;
        }
        violations.push(edge);
      }
    }

    expect(violations).toEqual([]);
    expect([...allowedScreenLocalImports.keys()].filter((edge) => !seenAllowed.has(edge))).toEqual([]);
  });
});
