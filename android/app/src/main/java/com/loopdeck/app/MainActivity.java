package com.loopdeck.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebChromeClient.FileChooserParams;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 2410;
    private static final int SAVE_FILE_REQUEST = 2411;
    private static final String ASSET_BASE_URL = "file:///android_asset/loopdeck/";

    private ValueCallback<Uri[]> filePathCallback;
    private PendingSave pendingSave;
    private final Map<String, PendingSaveBuffer> pendingSaveBuffers = new HashMap<>();
    private WebView webView;

    private static final class PendingSave {
        final String saveId;
        final String filename;
        final String mimeType;
        final String base64Data;
        final int expectedBytes;

        PendingSave(String saveId, String filename, String mimeType, String base64Data, int expectedBytes) {
            this.saveId = saveId;
            this.filename = filename;
            this.mimeType = mimeType;
            this.base64Data = base64Data;
            this.expectedBytes = expectedBytes;
        }
    }

    private static final class PendingSaveBuffer {
        final String saveId;
        final String filename;
        final String mimeType;
        final int expectedBytes;
        final int expectedChunks;
        final StringBuilder base64Data = new StringBuilder();
        int receivedChunks = 0;

        PendingSaveBuffer(String saveId, String filename, String mimeType, int expectedBytes, int expectedChunks) {
            this.saveId = saveId;
            this.filename = filename;
            this.mimeType = mimeType;
            this.expectedBytes = expectedBytes;
            this.expectedChunks = expectedChunks;
        }
    }

    public final class LoopDeckBridge {
        @JavascriptInterface
        public boolean canUseNativeSave() {
            return true;
        }

        @JavascriptInterface
        public boolean beginSaveFile(String saveId, String filename, String mimeType, int expectedBytes, int expectedChunks) {
            if (saveId == null || saveId.trim().isEmpty()) return false;
            if (expectedChunks <= 0 || expectedChunks > 200000) return false;
            synchronized (pendingSaveBuffers) {
                if (pendingSaveBuffers.containsKey(saveId)) return false;
                pendingSaveBuffers.put(saveId, new PendingSaveBuffer(saveId, safeFilename(filename), safeMimeType(mimeType), expectedBytes, expectedChunks));
            }
            return true;
        }

        @JavascriptInterface
        public boolean appendSaveFileChunk(String saveId, int chunkIndex, String base64Chunk) {
            if (saveId == null || base64Chunk == null) return false;
            synchronized (pendingSaveBuffers) {
                PendingSaveBuffer buffer = pendingSaveBuffers.get(saveId);
                if (buffer == null) return false;
                if (chunkIndex != buffer.receivedChunks) return false;
                buffer.base64Data.append(base64Chunk);
                buffer.receivedChunks += 1;
            }
            return true;
        }

        @JavascriptInterface
        public boolean finishSaveFile(String saveId) {
            if (saveId == null) return false;
            final PendingSaveBuffer buffer;
            synchronized (pendingSaveBuffers) {
                buffer = pendingSaveBuffers.remove(saveId);
            }
            if (buffer == null) return false;
            if (buffer.receivedChunks != buffer.expectedChunks) {
                reportSaveResult(buffer.saveId, false, "SAV-A021", "保存データのchunk数が一致しません。", 0);
                return false;
            }
            runOnUiThread(() -> startSaveFile(buffer.saveId, buffer.filename, buffer.mimeType, buffer.base64Data.toString(), buffer.expectedBytes));
            return true;
        }

        @JavascriptInterface
        public void saveFile(String filename, String mimeType, String base64Data) {
            String saveId = "legacy-" + System.currentTimeMillis();
            runOnUiThread(() -> startSaveFile(saveId, filename, mimeType, base64Data, -1));
        }

        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, safeToast(message), Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // Bundled LoopDeck app code only; imported study content is data.
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        // Vite builds ES modules and CSS under file:///android_asset/loopdeck/assets/.
        // The app must allow those bundled file URLs to load, while remote/universal access stays blocked.
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.addJavascriptInterface(new LoopDeckBridge(), "LoopDeckAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return shouldBlockNavigation(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return shouldBlockNavigation(Uri.parse(url));
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = callback;

                Intent intent = fileChooserParams.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        }

        webView.loadUrl(ASSET_BASE_URL + "index.html");
    }

    private boolean shouldBlockNavigation(Uri uri) {
        if (uri == null) return true;
        String url = uri.toString();
        String scheme = uri.getScheme();
        if ("file".equals(scheme)) return !url.startsWith(ASSET_BASE_URL);
        if ("about".equals(scheme) || "blob".equals(scheme)) return false;
        return true;
    }

    private String safeToast(String message) {
        if (message == null || message.trim().isEmpty()) return "LoopDeck";
        String compact = message.replace('\n', ' ').replace('\r', ' ').trim();
        return compact.length() > 140 ? compact.substring(0, 140) : compact;
    }

    private String safeFilename(String filename) {
        String fallback = "loopdeck-export";
        if (filename == null || filename.trim().isEmpty()) return fallback;
        String cleaned = filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        return cleaned.isEmpty() ? fallback : cleaned;
    }

    private String safeMimeType(String mimeType) {
        return mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType;
    }

    private String errorText(Exception error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName() + (message == null || message.isEmpty() ? "" : ": " + message);
    }

    private void reportSaveResult(String saveId, boolean ok, String code, String message, int bytes) {
        if (webView == null || saveId == null || saveId.isEmpty()) return;
        try {
            JSONObject detail = new JSONObject();
            detail.put("id", saveId);
            detail.put("ok", ok);
            detail.put("code", code);
            detail.put("message", message);
            detail.put("bytes", bytes);
            String script = "window.dispatchEvent(new CustomEvent('loopdeck-native-save-result',{detail:" + detail.toString() + "}))";
            webView.post(() -> webView.evaluateJavascript(script, null));
        } catch (Exception ignored) {
            // Best effort only. The native Toast below still exposes the error code.
        }
    }

    private void startSaveFile(String saveId, String filename, String mimeType, String base64Data, int expectedBytes) {
        if (pendingSave != null) {
            reportSaveResult(saveId, false, "SAV-A003", "別の保存処理が完了するまで待ってください。", 0);
            Toast.makeText(this, "[SAV-A003] 別の保存処理が進行中です。", Toast.LENGTH_LONG).show();
            return;
        }
        if (base64Data == null || base64Data.isEmpty()) {
            reportSaveResult(saveId, false, "SAV-A001", "保存データが空です。", 0);
            Toast.makeText(this, "[SAV-A001] 保存データが空です。", Toast.LENGTH_LONG).show();
            return;
        }
        pendingSave = new PendingSave(saveId, safeFilename(filename), safeMimeType(mimeType), base64Data, expectedBytes);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(pendingSave.mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, pendingSave.filename);
        try {
            startActivityForResult(intent, SAVE_FILE_REQUEST);
        } catch (Exception error) {
            reportSaveResult(saveId, false, "SAV-A002", "保存先を開けませんでした: " + errorText(error), 0);
            pendingSave = null;
            Toast.makeText(this, "[SAV-A002] 保存先を開けませんでした。", Toast.LENGTH_LONG).show();
        }
    }

    private void completeSaveFile(Uri uri) {
        if (pendingSave == null) return;
        int bytesWritten = 0;
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("No output stream");
            byte[] bytes = Base64.decode(pendingSave.base64Data, Base64.DEFAULT);
            if (bytes.length <= 0) throw new IllegalStateException("Decoded data is 0 bytes");
            if (pendingSave.expectedBytes > 0 && bytes.length != pendingSave.expectedBytes) {
                throw new IllegalStateException("Decoded bytes " + bytes.length + " did not match expected " + pendingSave.expectedBytes);
            }
            output.write(bytes);
            output.flush();
            bytesWritten = bytes.length;
            Toast.makeText(this, "書き出しました。", Toast.LENGTH_SHORT).show();
            reportSaveResult(pendingSave.saveId, true, "SAV-OK", "保存に成功しました。", bytesWritten);
        } catch (Exception error) {
            reportSaveResult(pendingSave.saveId, false, "SAV-A005", "書き出しに失敗しました: " + errorText(error), bytesWritten);
            Toast.makeText(this, "[SAV-A005] 書き出しに失敗しました。", Toast.LENGTH_LONG).show();
        } finally {
            pendingSave = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == SAVE_FILE_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                completeSaveFile(data.getData());
            } else {
                if (pendingSave != null) reportSaveResult(pendingSave.saveId, false, "SAV-A004", "保存がキャンセルされました。", 0);
                pendingSave = null;
            }
            return;
        }

        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) {
                    results[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
