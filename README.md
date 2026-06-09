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

## LoopDeck Pack format

LoopDeck can import two教材 formats:

1. a single `.loopdeck.json` file containing one full `LoopDeckPack` object
2. a `.loopdeck.zip` file containing split JSON files and optional local images

Study content is treated as data only. Imported packs must not contain executable教材HTML, JavaScript, CSS, Android binaries, shell scripts, remote URLs, or unsafe paths.

### Option A: single JSON pack

Create a file such as:

```text
my-pack.loopdeck.json
```

The file must contain one full pack object:

```json
{
  "packVersion": 1,
  "packId": "my-first-pack",
  "title": "My First Pack",
  "description": "A small sample pack.",
  "folders": [
    {
      "id": "term-1-mid",
      "title": "一学期中間"
    }
  ],
  "modules": [
    {
      "id": "english-basic",
      "folderId": "term-1-mid",
      "title": "英単語 基礎",
      "subject": "英語",
      "description": "基本単語を確認します。",
      "tags": ["英語", "単語"],
      "questionIds": ["eng-001", "eng-002", "eng-003"]
    }
  ],
  "questions": [
    {
      "id": "eng-001",
      "moduleId": "english-basic",
      "type": "input",
      "prompt": "apple の意味は？",
      "answer": "りんご",
      "acceptableAnswers": ["リンゴ"],
      "category": "名詞",
      "number": 1,
      "example": "I ate an apple.",
      "explanation": "apple は「りんご」。"
    },
    {
      "id": "eng-002",
      "moduleId": "english-basic",
      "type": "choice",
      "prompt": "book の意味は？",
      "choices": ["本", "机", "窓", "水"],
      "answer": "本",
      "category": "名詞",
      "number": 2,
      "explanation": "book は「本」。"
    },
    {
      "id": "eng-003",
      "moduleId": "english-basic",
      "type": "multi_select",
      "prompt": "動物をすべて選べ。",
      "choices": ["cat", "dog", "desk", "pen"],
      "correctChoices": ["cat", "dog"],
      "category": "分類",
      "number": 3
    }
  ]
}
```

Then open LoopDeck's `教材入出力` screen, choose the JSON file, preview the validation result, and install it.

### Option B: `.loopdeck.zip` pack

Create a ZIP file such as:

```text
my-pack.loopdeck.zip
```

The ZIP root must contain:

```text
manifest.json
modules.json
questions.json
images/
  optional-image.png
```

`images/` is optional. When using images, place only local image files inside the ZIP and reference them from questions with a relative path such as `images/map01.png`.

#### `manifest.json`

`manifest.json` stores pack metadata and folders:

```json
{
  "packVersion": 1,
  "packId": "history-mini-pack",
  "title": "歴史ミニパック",
  "description": "歴史の確認問題です。",
  "folders": [
    {
      "id": "history-folder",
      "title": "歴史"
    }
  ]
}
```

Required fields:

- `packVersion`: must be `1`
- `packId`: unique string ID for the pack
- `title`: pack title
- `folders`: array of folder objects

Optional field:

- `description`

#### `modules.json`

`modules.json` is an array of教材 modules:

```json
[
  {
    "id": "history-basic",
    "folderId": "history-folder",
    "title": "歴史基礎",
    "subject": "社会",
    "description": "歴史の重要語句を確認します。",
    "tags": ["社会", "歴史", "一問一答"],
    "questionIds": ["hist-001", "hist-002"]
  }
]
```

Required fields:

- `id`: unique module ID
- `questionIds`: list of question IDs included in this module

Recommended fields:

- `folderId`: should match a folder ID from `manifest.json`
- `title`
- `subject`
- `description`
- `tags`

#### `questions.json`

`questions.json` is an array of questions.

Supported question types:

```text
input
choice
multi_select
```

Common fields for all questions:

- `id`: unique question ID
- `moduleId`: module ID that owns this question
- `type`: `input`, `choice`, or `multi_select`
- `prompt`: question text
- `explanation`: optional explanation shown after answering
- `imageAsset`: optional local image reference, for example `images/map01.png`
- `category`: optional category used by category filtering
- `number`: optional question number used by range filtering
- `example`: optional example/hint line

##### Input question

```json
{
  "id": "hist-001",
  "moduleId": "history-basic",
  "type": "input",
  "prompt": "鎌倉幕府を開いた人物は？",
  "answer": "源頼朝",
  "acceptableAnswers": ["頼朝"],
  "category": "鎌倉時代",
  "number": 1,
  "explanation": "源頼朝が鎌倉幕府を開いた。"
}
```

Required fields:

- `answer`

Optional fields:

- `acceptableAnswers`
- `direction`: `normal`, `ja_to_en`, or `en_to_ja`

##### Choice question

```json
{
  "id": "hist-002",
  "moduleId": "history-basic",
  "type": "choice",
  "prompt": "鎌倉幕府が開かれた年は？",
  "choices": ["1192年", "1185年", "1603年", "1868年"],
  "answer": "1192年",
  "category": "鎌倉時代",
  "number": 2,
  "explanation": "教科書や授業の扱いに合わせて答えを設定してください。"
}
```

Required fields:

- `choices`: at least two choices
- `answer`: one correct answer

Optional field:

- `acceptableAnswers`

##### Multi-select question

```json
{
  "id": "hist-003",
  "moduleId": "history-basic",
  "type": "multi_select",
  "prompt": "三大改革をすべて選べ。",
  "choices": ["享保の改革", "寛政の改革", "天保の改革", "明治維新"],
  "correctChoices": ["享保の改革", "寛政の改革", "天保の改革"],
  "category": "江戸時代",
  "number": 3
}
```

Required fields:

- `choices`: at least two choices
- `correctChoices`: one or more correct choices

The answer is correct only when the selected set exactly matches `correctChoices`. Order does not matter, but missing or extra choices make the answer wrong.

### Image files

Images are optional. Supported image extensions are:

```text
.png
.jpg
.jpeg
.webp
```

Use a local relative path in `imageAsset`:

```json
{
  "id": "geo-001",
  "moduleId": "geography-map",
  "type": "input",
  "prompt": "画像の地形名を答えよ。",
  "answer": "扇状地",
  "imageAsset": "images/fan-delta.png"
}
```

Do not use remote URLs such as `https://...` in `imageAsset`.

### ID rules

Use stable unique IDs.

Recommended style:

```text
packId: school-term-1
module id: chemistry-ion
question id: chemistry-ion-001
```

Rules:

- `packId` must not be empty.
- module `id` values must be unique inside the pack.
- question `id` values must be unique inside the pack.
- every question's `moduleId` should point to a module ID.
- every module's `questionIds` should point to question IDs.

### Creating the ZIP

Example folder before zipping:

```text
history-mini-pack/
  manifest.json
  modules.json
  questions.json
  images/
    map01.png
```

Zip the contents of the folder, not the folder itself. The ZIP root should directly contain `manifest.json`, `modules.json`, and `questions.json`.

Good:

```text
manifest.json
modules.json
questions.json
images/map01.png
```

Bad:

```text
history-mini-pack/manifest.json
history-mini-pack/modules.json
history-mini-pack/questions.json
```

### Safety rules

LoopDeck validates the pack before storing it.

Rejected file types:

```text
.html
.htm
.js
.mjs
.cjs
.css
.apk
.dex
.jar
.so
.exe
.bat
.cmd
.sh
.ps1
```

Rejected paths:

```text
../evil.json
..\\evil.json
/absolute/path.json
C:\\absolute\\path.json
https://example.com/file.json
empty paths
paths with null bytes
```

LoopDeck also rejects remote URLs and unsafe image references. Imported教材HTML, JavaScript, and CSS are not executed.

### Quick checklist

Before importing a pack, check:

- `packVersion` is `1`.
- `packId` and `title` are not empty.
- every module has an `id` and `questionIds`.
- every question has `id`, `moduleId`, `type`, and `prompt`.
- `input` questions have `answer`.
- `choice` questions have at least two `choices` and an `answer`.
- `multi_select` questions have `choices` and `correctChoices`.
- image paths are local and use `.png`, `.jpg`, `.jpeg`, or `.webp`.
- the ZIP root directly contains `manifest.json`, `modules.json`, and `questions.json`.
