# Building LoopDeck with your Android Studio signing key

LoopDeck's Android wrapper loads the built web app from local `android_asset` files.
It does not need the internet permission.

## 1. Build the web app

From the `loopdeck/` project root:

```bash
npm install
npm run build
```

The Android Gradle project will copy `../dist` into `app/src/main/assets/loopdeck` before build when `dist/index.html` exists.
A prebuilt copy is also included, so the project can still open in Android Studio immediately.

## 2. Add your signing key config

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

Use the key you generated in Android Studio. Do not put the `.jks` file inside GitHub unless you fully understand the risk.

## 3. Build a signed release APK

Open the `android/` folder in Android Studio and run the `assembleRelease` Gradle task, or use:

```bash
cd android
./gradlew assembleRelease
```

Output path:

```text
android/app/build/outputs/apk/release/app-release.apk
```

If `keystore.properties` is missing, debug builds still work and release builds are left unsigned.
