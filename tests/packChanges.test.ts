// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyPackChanges, subscribePackChanges } from '../src/storage/packChanges';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('cross-tab pack invalidation', () => {
  it('deduplicates broadcast and storage delivery and stops after disposal', () => {
    const channels: FakeChannel[] = [];
    class FakeChannel {
      onmessage?: (event: { data: unknown }) => void;
      close = vi.fn();
      postMessage = vi.fn();
      constructor() {
        channels.push(this);
      }
    }
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    const changed = vi.fn();
    const dispose = subscribePackChanges(changed);
    const message = JSON.stringify({ source: 'another-tab', revision: '1' });
    channels[0].onmessage!({ data: message });
    window.dispatchEvent(new StorageEvent('storage', { key: 'loopdeck_pack_changes_v1', newValue: message }));
    expect(changed).toHaveBeenCalledTimes(1);
    dispose();
    expect(channels[0].close).toHaveBeenCalledOnce();
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'loopdeck_pack_changes_v1', newValue: JSON.stringify({ source: 'another-tab', revision: '2' }) })
    );
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('provides storage fallback and ignores its own mutation signal', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const changed = vi.fn();
    const dispose = subscribePackChanges(changed);
    notifyPackChanges();
    const ownMessage = localStorage.getItem('loopdeck_pack_changes_v1');
    window.dispatchEvent(new StorageEvent('storage', { key: 'loopdeck_pack_changes_v1', newValue: ownMessage }));
    expect(changed).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: 'loopdeck_pack_changes_v1', newValue: '{bad' }));
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'loopdeck_pack_changes_v1', newValue: JSON.stringify({ source: 'another-tab', revision: '1' }) })
    );
    expect(changed).toHaveBeenCalledOnce();
    dispose();
  });

  it('does not turn a committed pack mutation into a failure when browser signaling is denied', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('denied');
        }
      }
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => notifyPackChanges()).not.toThrow();
  });
});
