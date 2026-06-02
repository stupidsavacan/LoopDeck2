# LoopDeck

LoopDeck is the HTML/PWA successor to StudyHome.

This build uses the old StudyHome-style lightweight UX, but the data model and import safety ideas come from StudyHome-Next.

## What is included in this ZIP

- LoopDeck web app source: Vite + TypeScript + HTML/CSS
- Built-in rescued StudyHome-Next教材データ
- Normal-direction-only data pack: reverse-practice modules removed
- 1,112 usable questions from StudyHome-Next
- 4 rescued history images
- Basic Review Center
- Input / choice / multi_select questions
- Safer Japanese answer judging
- JSON / `.loopdeck.zip` import entry point
- Android Studio wrapper project with signing-key support

## Removed on purpose

Reverse-practice modules were removed because the intended workflow is shuffled normal study.

Removed modules:

- `english_reverse`
- `leap_reverse`
- `leap_final_reverse`

The empty old `kobun_vocab` module is also omitted from the usable built-in pack because it contained 0 questions. The raw source data is still preserved under `rescued-data/raw/`.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

## Android Studio build

Open the `android/` folder in Android Studio.

For a signed release build, copy:

```bash
cp android/keystore.properties.example android/keystore.properties
```

Then edit `android/keystore.properties` to point to the key you generated in Android Studio.

See:

```text
android/README_SIGNING.md
```

## Temporary unsigned debug APK build

A GitHub Actions workflow builds an unsigned debug APK for testing:

```text
.github/workflows/build-android-debug.yml
```

The uploaded artifact name is:

```text
LoopDeck-debug-apk
```

Signed release builds are intentionally left for later, after `keystore.properties` is available locally.

## Data files

The app loads this as built-in data:

```text
data/builtin/builtin.json
```

Rescued files are also included here:

```text
rescued-data/
```

Most useful files:

```text
rescued-data/loopdeck/StudyHomeNext_normal_only.loopdeck.json
rescued-data/loopdeck/StudyHomeNext_normal_only.loopdeck.zip
rescued-data/raw/StudyHomeNext_question_bank.raw.json
```

## Pack format

A `.loopdeck.zip` can contain:

```text
manifest.json
modules.json
questions.json
images/optional-image.png
```

LoopDeck validates the pack before storing it. Imported `.html`, `.js`, `.css`, `.apk`, `.dex`, `.jar`, `.so`, `.exe`, `.bat`, `.sh` and path traversal entries are rejected.
