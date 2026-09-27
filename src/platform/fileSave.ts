import { saveBlob as saveNativeOrBrowserBlob } from './nativeFileSave';

export type SaveProgressReporter = (code: string, message: string, detail?: string) => void;

export async function saveBlob(blob: Blob, filename: string, options: { idPrefix?: string; progress?: SaveProgressReporter } = {}): Promise<void> {
  const progress = options.progress ?? (() => {});
  const result = await saveNativeOrBrowserBlob(blob, filename, {
    onNativeProgress: (event) => {
      if (event.phase === 'begin') progress('SAV-A010', 'Android保存セッションを開始中', `${event.chunkCount} chunks`);
      if (event.phase === 'chunk') progress('SAV-A020', 'Androidへ保存データを送信中', `${event.chunkIndex}/${event.chunkCount} chunks`);
      if (event.phase === 'picker') progress('SAV-A030', '保存先選択画面を開いています', 'ファイル名と保存先を選んでください。');
    }
  });
  if (result.mode === 'native') progress(result.nativeResult?.code ?? 'SAV-OK', 'Android保存が完了しました', `${result.nativeResult?.bytes ?? blob.size} bytes`);
  else progress('WEB-S020', 'ブラウザ保存を開始しました', `${blob.size} bytes`);
}
