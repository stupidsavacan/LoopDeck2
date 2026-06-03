# Building LoopDeck APKs

LoopDeck's Android project packages the built Vite app as a small local Android wrapper. It uses the files generated in `dist` and does not execute imported study packs as code.

## Debug APK

The easiest path is GitHub Actions:

```text
.github/workflows/build-android-debug.yml
```

Run it manually and download the `LoopDeck-debug-apk` artifact.

Debug builds do not need signing secrets.

## Signed Release APK from GitHub Actions

Use this workflow:

```text
.github/workflows/build-android-release.yml
```

It builds the web app, prepares release signing files from GitHub Secrets, runs `assembleRelease`, uploads the signed APK, and removes the temporary signing files.

The uploaded artifact is named:

```text
LoopDeck-signed-release-apk
```

Required GitHub Actions secrets:

```text
STUDYHOME_KEYSTORE_BASE64
STUDYHOME_KEYSTORE_PASSWORD
STUDYHOME_KEY_ALIAS
STUDYHOME_KEY_PASSWORD
```

The workflow decodes `STUDYHOME_KEYSTORE_BASE64` into a temporary `android/studyhome-release.jks` file and creates `android/keystore.properties` during CI. Those files must never be committed.

## Creating STUDYHOME_KEYSTORE_BASE64

After creating or locating your release keystore locally, copy its base64 value to the clipboard.

PowerShell example:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\gamit\AndroidKeys\studyhome-release.jks")) | Set-Clipboard
```

Paste that clipboard value into the GitHub Secret named `STUDYHOME_KEYSTORE_BASE64`.

Then add the remaining GitHub Secrets with their real values:

```text
STUDYHOME_KEYSTORE_PASSWORD
STUDYHOME_KEY_ALIAS
STUDYHOME_KEY_PASSWORD
```

Do not paste those values into README files, source files, workflow logs, issues, or normal text files.

## Local Android Studio Build

From the repository root, build web assets first:

```bash
npm install
npm run build
```

Then open `android/` in Android Studio and run `assembleDebug`.

## Local Signed Release

Copy:

```bash
cp android/keystore.properties.example android/keystore.properties
```

Then edit `android/keystore.properties`:

```properties
storeFile=/absolute/path/to/your/studyhome-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=YOUR_KEY_ALIAS
keyPassword=YOUR_KEY_PASSWORD
```

Run `assembleRelease` from the Android project.

If `android/keystore.properties` is missing or incomplete, debug builds still work. Release builds fail with a clear signing message so an unsigned release is not mistaken for a signed APK.

## Safety Rules

Never commit:

```text
*.jks
*.keystore
android/keystore.properties
```

Only store real signing secrets in GitHub Actions Secrets or in a local file that is ignored by git.
