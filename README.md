# LoopDeck

LoopDeck is a lightweight HTML / TypeScript study app for fast shuffle-based review.

## What is included

- Vite + TypeScript + HTML/CSS LoopDeck web app
- Built-in 教材データ
- Normal-direction-only study data; reverse-practice modules are not active
- 1,112 usable questions
- Review Center with SRS due review and history-based weak queues
- Study graphs based on saved answer attempts
- Input / choice / multi_select questions
- Japanese answer judging that rejects partial fragments
- JSON / `.loopdeck.zip` import and export
- Android debug APK and signed release APK workflows

## Review Scheduler

LoopDeck stores raw answer attempts and per-question review state.

Each question can have a `ReviewCard` with:

- state: `new` / `learning` / `review` / `relearning` / `leech` / `mastered` / `suspended`
- `dueAt`
- `intervalDays`
- `ease`
- correct and wrong streaks
- lapse count

The Review Center has two layers:

1. SRS due review:
   scheduled cards, overdue cards, relearning cards, and leech cards.

2. History-based weak queue:
   questions detected from wrong answers, answer reveals, near misses, slow correct answers, and repeated wrong answers.

The first scheduler is a simple SM-2-like implementation. It is designed so that FSRS-style difficulty, stability, and retrievability can be added later.

Normal study still saves an `Attempt` immediately after answering. LoopDeck then automatically infers an SRS rating from the result and timing: wrong/revealed answers become `again`, slow correct answers become `hard`, normal correct answers become `good`, and very fast correct answers become `easy`. The app does not show manual rating buttons in the quiz flow.

## Removed on purpose

Reverse-practice modules are removed because the intended workflow is shuffled normal study.

Removed module ids:

- `english_reverse`
- `leap_reverse`
- `leap_final_reverse`

The empty `kobun_vocab` / `古文単語` module is preserved as a 0-question reference module, but it is hidden from normal Home study cards.

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

To write out an unsigned debug APK, run:

```text
.github/workflows/build-android-debug.yml
```

Download the artifact named:

```text
LoopDeck-debug-apk
```

To write out a signed release APK, run:

```text
.github/workflows/build-android-release.yml
```

The signed release workflow requires these GitHub Actions secrets:

```text
ANDROID_KEYSTORE_BASE64
KEYSTORE_PASSWORD
KEY_ALIAS
KEY_PASSWORD
```

Download the signed artifact named:

```text
LoopDeck-signed-release-apk
```

The release workflow decodes the keystore only during CI, writes `android/keystore.properties` only during CI, runs `assembleRelease`, uploads the signed APK, and removes the temporary signing files. Do not commit `.jks`, `.keystore`, or `android/keystore.properties`.

For signing setup notes, see:

```text
android/README_SIGNING.md
```

The APK is a small Android wrapper around the bundled local Vite build. Imported study content remains data-only; LoopDeck still rejects executable/imported HTML, JavaScript, CSS, APK, shell, and unsafe paths.

## Android Studio build

Build the web assets first:

```bash
npm install
npm run build
```

Then open the `android/` folder in Android Studio and run `assembleDebug`.

For signed local release builds, create `android/keystore.properties` from `android/keystore.properties.example` and run `assembleRelease`. Never commit the real keystore or real signing properties.

## Pack format

A `.loopdeck.zip` can contain:

```text
manifest.json
modules.json
questions.json
images/optional-image.png
```

LoopDeck validates the pack before storing it. Imported `.html`, `.js`, `.mjs`, `.cjs`, `.css`, `.apk`, `.dex`, `.jar`, `.so`, `.exe`, `.bat`, `.cmd`, `.sh`, `.ps1`, remote URLs, absolute paths, path traversal, empty paths, and null-byte paths are rejected.
