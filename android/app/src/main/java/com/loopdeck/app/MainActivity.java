package com.loopdeck.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 2410;
    private ValueCallback<Uri[]> filePathCallback;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); // LoopDeck's bundled app code only.
        settings.setDomStorageEnabled(true); // Required for localStorage / IndexedDB in WebView.
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(true);

        webView.addJavascriptInterface(new LoopDeckExportBridge(), "LoopDeckAndroid");

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

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

    private class LoopDeckExportBridge {
        @JavascriptInterface
        public void saveFile(String filename, String mimeType, String base64Data) {
            try {
                saveExportFile(filename, mimeType, base64Data);
            } catch (Exception error) {
                showToast("Export failed: " + error.getMessage());
            }
        }
    }

    private void saveExportFile(String filename, String mimeType, String base64Data) throws IOException {
        String safeName = safeFileName(filename);
        String safeMimeType = mimeType == null || mimeType.trim().isEmpty() ? "application/octet-stream" : mimeType;
        byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);

        String location;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveToMediaStoreDownloads(safeName, safeMimeType, bytes);
            location = "Downloads";
        } else {
            File outputFile = saveToLegacyDownloads(safeName, bytes);
            location = outputFile.getAbsolutePath();
        }

        showToast("Saved " + safeName + " to " + location);
    }

    private void saveToMediaStoreDownloads(String filename, String mimeType, byte[] bytes) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IOException("Could not create download file.");
        }

        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) {
                throw new IOException("Could not open download file.");
            }
            output.write(bytes);
        } catch (IOException error) {
            getContentResolver().delete(uri, null, null);
            throw error;
        }

        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        getContentResolver().update(uri, values, null, null);
    }

    private File saveToLegacyDownloads(String filename, byte[] bytes) throws IOException {
        File publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        try {
            return writeFile(publicDownloads, filename, bytes);
        } catch (IOException | SecurityException error) {
            File appDownloads = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (appDownloads == null) appDownloads = getFilesDir();
            return writeFile(appDownloads, filename, bytes);
        }
    }

    private File writeFile(File directory, String filename, byte[] bytes) throws IOException {
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Could not create export directory.");
        }

        File outputFile = new File(directory, filename);
        try (OutputStream output = new FileOutputStream(outputFile)) {
            output.write(bytes);
        }
        return outputFile;
    }

    private String safeFileName(String filename) {
        String safe = filename == null ? "" : filename.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", "-").trim();
        while (safe.startsWith(".")) safe = safe.substring(1);
        if (safe.length() > 120) safe = safe.substring(0, 120);
        return safe.isEmpty() ? "loopdeck-export" : safe;
    }

    private void showToast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
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
