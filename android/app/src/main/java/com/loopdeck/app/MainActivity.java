package com.loopdeck.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 2410;
    private static final int SAVE_FILE_REQUEST = 2411;

    private ValueCallback<Uri[]> filePathCallback;
    private PendingSave pendingSave;
    private WebView webView;

    private static final class PendingSave {
        final String filename;
        final String mimeType;
        final String base64Data;

        PendingSave(String filename, String mimeType, String base64Data) {
            this.filename = filename;
            this.mimeType = mimeType;
            this.base64Data = base64Data;
        }
    }

    public final class LoopDeckBridge {
        @JavascriptInterface
        public void saveFile(String filename, String mimeType, String base64Data) {
            runOnUiThread(() -> startSaveFile(filename, mimeType, base64Data));
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
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.addJavascriptInterface(new LoopDeckBridge(), "LoopDeckAndroid");
        webView.setWebViewClient(new WebViewClient());
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

        webView.loadUrl("file:///android_asset/loopdeck/index.html");
    }

    private void startSaveFile(String filename, String mimeType, String base64Data) {
        pendingSave = new PendingSave(filename, mimeType, base64Data);
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename == null || filename.isEmpty() ? "loopdeck-export" : filename);
        try {
            startActivityForResult(intent, SAVE_FILE_REQUEST);
        } catch (Exception error) {
            pendingSave = null;
            Toast.makeText(this, "保存先を開けませんでした。", Toast.LENGTH_LONG).show();
        }
    }

    private void completeSaveFile(Uri uri) {
        if (pendingSave == null) return;
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("No output stream");
            byte[] bytes = Base64.decode(pendingSave.base64Data, Base64.DEFAULT);
            output.write(bytes);
            Toast.makeText(this, "書き出しました。", Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, "書き出しに失敗しました。", Toast.LENGTH_LONG).show();
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
