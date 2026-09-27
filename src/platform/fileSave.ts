export interface LoopDeckAndroidBridge {
  saveFile(filename: string, mimeType: string, base64Data: string): void;
  beginSaveFile?(saveId: string, filename: string, mimeType: string, expectedBytes: number, expectedChunks: number): boolean;
  appendSaveFileChunk?(saveId: string, chunkIndex: number, base64Chunk: string): boolean;
  finishSaveFile?(saveId: string): boolean;
  canUseNativeSave?(): boolean;
  showToast?(message: string): void;
}

declare global {
  interface Window {
    LoopDeckAndroid?: LoopDeckAndroidBridge;
  }
}

export interface NativeSaveResult {
  id: string;
  ok: boolean;
  code: string;
  message: string;
  bytes?: number;
}

export type SaveProgressReporter = (code: string, message: string, detail?: string) => void;

export interface SaveBlobOptions {
  idPrefix?: string;
  progress?: SaveProgressReporter;
  timeoutMs?: number;
}

const ANDROID_SAVE_CHUNK_SIZE = 48_000;
const NATIVE_SAVE_TIMEOUT_MS = 120_000;

function saveError(code: string, message: string, cause?: unknown): Error {
  const causeText = cause instanceof Error ? cause.message : cause ? String(cause) : '';
  return new Error(`[${code}] ${message}${causeText ? ` / ${causeText}` : ''}`);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      if (!base64) reject(saveError('SAV-B002', '保存データのbase64化結果が空です。'));
      else resolve(base64);
    };
    reader.onerror = () => reject(saveError('SAV-B001', '保存データをbase64に変換できません。', reader.error));
    reader.readAsDataURL(blob);
  });
}

export function waitForNativeSave(saveId: string, timeoutMs = NATIVE_SAVE_TIMEOUT_MS): Promise<NativeSaveResult> {
  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.removeEventListener('loopdeck-native-save-result', handler);
      window.clearTimeout(timeoutId);
    };
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<NativeSaveResult>).detail;
      if (!detail || detail.id !== saveId) return;
      cleanup();
      if (detail.ok) resolve(detail);
      else reject(saveError(detail.code || 'SAV-E999', detail.message || 'Android保存に失敗しました。'));
    };
    window.addEventListener('loopdeck-native-save-result', handler);
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(saveError('SAV-A032', 'Android保存結果を受信できませんでした。もう一度お試しください。'));
    }, timeoutMs);
  });
}

function browserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveBlob(blob: Blob, filename: string, options: SaveBlobOptions = {}): Promise<void> {
  const progress = options.progress ?? (() => {});
  const mimeType = blob.type || 'application/octet-stream';
  const android = window.LoopDeckAndroid;

  if (android?.beginSaveFile && android.appendSaveFileChunk && android.finishSaveFile) {
    progress('SAV-B010', '保存データをbase64へ変換中', `${blob.size.toLocaleString()} bytes`);
    const base64 = await blobToBase64(blob);
    const chunks = Math.max(1, Math.ceil(base64.length / ANDROID_SAVE_CHUNK_SIZE));
    const saveId = `${options.idPrefix ?? 'file'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    progress('SAV-A010', 'Android保存セッションを開始中', `${chunks} chunks / ${base64.length.toLocaleString()} chars`);

    if (!android.beginSaveFile(saveId, filename, mimeType, blob.size, chunks)) {
      throw saveError('SAV-A011', 'Android保存セッションの開始に失敗しました。');
    }

    for (let index = 0; index < chunks; index += 1) {
      const chunk = base64.slice(index * ANDROID_SAVE_CHUNK_SIZE, (index + 1) * ANDROID_SAVE_CHUNK_SIZE);
      if (!android.appendSaveFileChunk(saveId, index, chunk)) {
        throw saveError('SAV-A012', `Android保存チャンク送信に失敗しました。chunk=${index + 1}/${chunks}`);
      }
      if (index === 0 || index === chunks - 1 || (index + 1) % 10 === 0) {
        progress('SAV-A020', 'Androidへ保存データを送信中', `${index + 1}/${chunks} chunks`);
      }
    }

    progress('SAV-A030', '保存先選択画面を開いています', 'ファイル名と保存先を選んでください。');
    if (!android.finishSaveFile(saveId)) throw saveError('SAV-A031', 'Android保存処理の開始に失敗しました。');
    const result = await waitForNativeSave(saveId, options.timeoutMs);
    progress(result.code || 'SAV-OK', 'Android保存が完了しました', `${(result.bytes ?? blob.size).toLocaleString()} bytes`);
    return;
  }

  if (android?.saveFile) {
    progress('SAV-L010', '旧Android保存方式で保存します', '保存完了結果はアプリへ戻りません。');
    android.saveFile(filename, mimeType, await blobToBase64(blob));
    return;
  }

  progress('WEB-S010', 'ブラウザ保存を開始します', filename);
  browserDownload(blob, filename);
  progress('WEB-S020', 'ブラウザ保存を開始しました', `${blob.size.toLocaleString()} bytes`);
}
