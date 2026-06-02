# LoopDeck

LoopDeck is the HTML/PWA successor to StudyHome.

This build keeps the old StudyHome-style lightweight study flow, while using StudyHome-Next rescue data and safer data-only import rules.

## What is included

- Vite + TypeScript + HTML/CSS LoopDeck web app
- Built-in rescued StudyHome / StudyHome-Next 教材データ
- Normal-direction-only study data; reverse-practice modules are not active
- 1,112 usable rescued questions
- Basic Review Center for wrong-answer sessions
- Input / choice / multi_select questions
- Japanese answer judging that rejects partial fragments
- JSON / `.loopdeck.zip` import and export
- Android debug APK build workflow

## Removed on purpose

Reverse-practice modules are removed because the intended workflow is shuffled normal study.

Removed module ids:

- `english_reverse`
- `leap_reverse`
- `leap_final_reverse`

The empty old `kobun_vocab` / `古文単語` module is preserved as a 0-question reference module, but it is hidden from normal Home study cards.

## Commands

```bash
npm install
npm run dev
npm test
npm run build
```

Dependencies are pinned to stable Vite / TypeScript / Vitest versions instead of `latest`. The generated lockfile was removed because it pointed at a private/internal registry and had resolved to a broken Vite package for GitHub Actions.

## GitHub Actions

Pushes, pull requests, and manual workflow runs use the web-only CI workflow:

```text
.github/workflows/ci.yml
```

It runs:

```text
npm install --include=dev
npm test
npm run build
```

To write out an unsigned debug APK, manually run:

```text
.github/workflows/build-android-debug.yml
```

Download the artifact named:

```text
LoopDeck-debug-apk
```

The APK is a small WebView wrapper around the bundled local Vite build. Imported study content remains data-only; LoopDeck still rejects executable/imported HTML, JavaScript, CSS, APK, shell, and unsafe paths.

## Android Studio build

Build the web assets first:

```bash
npm install
npm run build
```

Then open the `android/` folder in Android Studio and run `assembleDebug`.

For signing notes, see:

```text
android/README_SIGNING.md
```

## Data files

The app loads this as built-in data:

```text
data/builtin/studyhome_rescued.loopdeck.json
```

Reference rescue data is kept here and is not loaded at runtime:

```text
data/rescued/raw/
```

## Pack format

A `.loopdeck.zip` can contain:

```text
manifest.json
modules.json
questions.json
images/optional-image.png
```

LoopDeck validates the pack before storing it. Imported `.html`, `.js`, `.mjs`, `.cjs`, `.css`, `.apk`, `.dex`, `.jar`, `.so`, `.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, remote URLs, absolute paths, path traversal, empty paths, and null-byte paths are rejected.
