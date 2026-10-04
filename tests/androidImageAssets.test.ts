import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoopDeckPack } from '../src/core/models';
import { createLoopDeckZipBytes } from '../src/packs/zipExporter';

const script = fileURLToPath(new URL('../scripts/embed-android-image-assets.mjs', import.meta.url));
const temporaryDirectories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const path of temporaryDirectories.splice(0)) {
    if (dirname(resolve(path)) !== resolve(tmpdir()) || !basename(path).startsWith('loopdeck-android-assets-'))
      throw new Error('Unexpected test cleanup directory');
    await rm(path, { recursive: true, force: true });
  }
});

describe('Android packaged image assets', () => {
  it('builds the fixed local asset map and exports its original bytes without file fetch', async () => {
    const root = await mkdtemp(join(tmpdir(), 'loopdeck-android-assets-'));
    temporaryDirectories.push(root);
    await mkdir(join(root, 'images'));
    await writeFile(join(root, 'index.html'), '<html><head></head><body></body></html>');
    const pixel = await readFile(new URL('./fixtures/imageContainers/pixel.png', import.meta.url));
    await writeFile(join(root, 'images/pixel.png'), pixel);
    await writeFile(join(root, 'images/ignored.svg'), '<svg/>');
    execFileSync(process.execPath, [script, root]);
    execFileSync(process.execPath, [script, root]);
    const html = await readFile(join(root, 'index.html'), 'utf8');
    expect(html.match(/loopdeck-image-assets\.js/g)).toHaveLength(1);
    const scope: { __LOOPDECK_EMBEDDED_ASSETS__?: Record<string, string> } = {};
    runInNewContext(await readFile(join(root, 'loopdeck-image-assets.js'), 'utf8'), scope);
    expect(Object.keys(scope.__LOOPDECK_EMBEDDED_ASSETS__ ?? {})).toEqual(['images/pixel.png']);
    vi.stubGlobal('__LOOPDECK_EMBEDDED_ASSETS__', scope.__LOOPDECK_EMBEDDED_ASSETS__);
    const fetchSpy = vi.fn(() => {
      throw new Error('file:// fetch must not be required');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const pack: LoopDeckPack = {
      packVersion: 1,
      packId: 'loopdeck-builtin-v1',
      title: 'Builtin',
      folders: [],
      modules: [{ id: 'm', folderId: '', title: 'M', subject: '', questionIds: ['q'] }],
      questions: [{ id: 'q', moduleId: 'm', type: 'input', prompt: 'Image', answer: 'a', imageAsset: 'images/pixel.png' }]
    };
    const zip = await JSZip.loadAsync(await createLoopDeckZipBytes(pack, []));
    expect(await zip.file('images/pixel.png')!.async('nodebuffer')).toEqual(pixel);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
