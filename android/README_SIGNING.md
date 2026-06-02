# Building LoopDeck APKs

LoopDeck's Android project is a small WebView wrapper around the built Vite app. It packages local `dist` files into `android_asset` and does not request internet permission.

## Debug APK

The easiest path is GitHub Actions:

```text
.github/workflows/build-android-debug.yml
```

Run it manually and download the `LoopDeck-debug-apk` artifact.

## Local Android Studio Build

From the repository root, build web assets first:

```bash
npm install
npm run build
```

Then open `android/` in Android Studio and run `assembleDebug`.

## Signed Release

Copy:

```bash
cp android/keystore.properties.example android/keystore.properties
```

Then edit `android/keystore.properties`:

```properties
storeFile=/absolute/path/to/your/loopdeck-release-key.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=YOUR_KEY_ALIAS
keyPassword=YOUR_KEY_PASSWORD
```

Run `assembleRelease`. If `keystore.properties` is missing, debug builds still work and release builds remain unsigned.
