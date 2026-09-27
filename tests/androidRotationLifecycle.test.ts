import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

describe('Android rotation lifecycle', () => {
  it('keeps MainActivity alive for orientation and size configuration changes', () => {
    const activity = manifest.match(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/s)?.[0];
    expect(activity).toBeDefined();

    const configChanges = activity?.match(/android:configChanges="([^"]+)"/)?.[1].split('|') ?? [];
    expect(configChanges).toEqual(expect.arrayContaining(['orientation', 'screenSize', 'smallestScreenSize', 'screenLayout']));
  });
});
