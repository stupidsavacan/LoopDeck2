# Android file operation lifecycle

Native export has a 120-second transfer timeout. Once the transfer is accepted by `finishSaveFile`, waiting in the system document picker has no timeout. The operation remains cancellable through `SaveBlobOptions.signal` or page departure until a final native result arrives. Native cancellation removes both incomplete transfer buffers and staged picker data.

Each native picker receives a distinct request code. Late results from canceled or replaced pickers cannot complete a newer operation. Import chooser success, cancellation, and launch failure all resolve the WebView callback once, clearing ownership before invoking it.

Ordinary rotation and size changes retain the existing Activity under the manifest configuration. When the Activity actually is destroyed/recreated, outstanding import callbacks and export operations are canceled and temporary files cleaned. A recreated WebView does not restore a native save whose JavaScript waiter no longer exists. The next request code is retained across recreation.

Verified locally: native-save tests exercise a five-minute picker wait followed by completion and retry, cancellation after transfer on AbortSignal/pagehide, stalled-transfer timeout, matching result IDs, native errors, and chunk failure. `MainActivity.java` compiles against the installed Android API 35 SDK. Real-device testing remains required for document-provider cancellation/retry, Activity recreation while a picker is open, and late picker results; no Android device was connected during this verification.

The Android asset sync task additionally generates a fixed local JavaScript map of packaged PNG/JPEG/WebP image bytes. The existing image resolver and ZIP exporter use this map without depending on `fetch(file://...)`, changing WebView permissions, or adding a native read bridge. The generator/export test verifies the original bytes survive ZIP export and no fetch occurs. This requires Node.js during Android packaging, already configured in the Android CI jobs. After the web build, local Gradle 9.4.1 executed `syncLoopDeckDist` and `assembleDebug` successfully. The generated APK contains the local script and all four bundled images; both embedded and packaged image bytes match the originals. Device verification remains separate.

## Japanese worksheet PDF audit (#53)

The current font pipeline already embeds the Japanese font without subsetting (commit `7911f43`) and converts WOFF assets to SFNT during the build. No font replacement was made in this audit. A generated eight-page mixed Japanese/ASCII worksheet (76 questions and answer pages, 1,467,724 bytes) was rendered with Poppler and inspected: Japanese headings, question text, wave-dash fallback, and circled digits were legible on the rendered pages. Existing worksheet tests include Japanese text and symbol fixtures.

This confirms the current desktop-generated artifact renders correctly for that fixture. It does not establish the original Android-only root cause or satisfy the packaged Android/WebView device acceptance matrix. The historical subsetting fix is evidence of the chosen mitigation, not proof that every original glyph failure had that cause.
