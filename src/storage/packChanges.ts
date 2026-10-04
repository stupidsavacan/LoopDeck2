const CHANNEL_NAME = 'loopdeck_pack_changes_v1';
const source = Math.random().toString(36).slice(2);

/** Notify other app tabs only after the IndexedDB mutation has committed. */
export function notifyPackChanges(): void {
  const message = JSON.stringify({ source, revision: `${Date.now()}:${Math.random()}` });
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(message);
      channel.close();
    } catch {
      // The storage signal below also works when BroadcastChannel is unavailable.
    }
  }
  try {
    localStorage.setItem(CHANNEL_NAME, message);
  } catch {
    // A committed pack must not be reported as failed because storage is denied.
  }
}

export function subscribePackChanges(onChange: () => void): () => void {
  let lastMessage = '';
  const receive = (message: unknown) => {
    if (typeof message !== 'string' || message === lastMessage) return;
    try {
      const parsed: unknown = JSON.parse(message);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('source' in parsed) ||
        typeof parsed.source !== 'string' ||
        !('revision' in parsed) ||
        typeof parsed.revision !== 'string' ||
        parsed.source === source
      )
        return;
      lastMessage = message;
      onChange();
    } catch {
      // Ignore unrelated or malformed browser messages.
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === CHANNEL_NAME) receive(event.newValue);
  };
  window.addEventListener('storage', onStorage);
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => receive(event.data);
    }
  } catch {
    // The storage listener remains usable.
  }
  return () => {
    window.removeEventListener('storage', onStorage);
    channel?.close();
  };
}
