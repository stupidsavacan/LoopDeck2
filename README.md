# LoopDeck

LoopDeck は、シャッフル型の高速復習を行うための軽量な HTML / TypeScript 製学習アプリです。

## 含まれているもの

- Vite + TypeScript + HTML/CSS で作られた LoopDeck Web アプリ
- 内蔵教材データ
- 通常方向のみの学習データ。逆方向練習モジュールは有効化していません
- 利用可能な問題数: 1,112問
- SRS の復習期限キューと履歴ベースの弱点キューを備えた復習センター
- 保存された回答履歴をもとにした学習グラフ
- `input` / `choice` / `multi_select` 形式の問題
- 部分的な断片回答を不正解にする日本語回答判定
- JSON / `.loopdeck.zip` のインポート・エクスポート
- Android debug APK と署名付き release APK の GitHub Actions ワークフロー

## 復習スケジューラー

LoopDeck は、生の回答履歴と問題ごとの復習状態を保存します。

各問題は、次の情報を持つ `ReviewCard` を持つことができます。

- state: `new` / `learning` / `review` / `relearning` / `leech` / `mastered` / `suspended`
- `dueAt`
- `intervalDays`
- `ease`
- 正解・不正解の連続回数
- lapse count（復習失敗回数）

復習センターには2つの層があります。

1. SRS 期限到来レビュー:
   スケジュール済みカード、期限超過カード、再学習カード、leech カードを扱います。

2. 履歴ベースの弱点キュー:
   不正解、答え表示、ニアミス、遅い正解、連続不正解から検出された問題を扱います。

1つ目のスケジューラーは、SM-2 風のシンプルな実装です。将来的に FSRS 形式の difficulty、stability、retrievability を追加できるように設計しています。

通常学習でも、回答直後に `Attempt` を保存します。その後 LoopDeck は、結果と回答時間から SRS レーティングを自動推定します。不正解・答え表示は `again`、遅い正解は `hard`、通常の正解は `good`、とても速い正解は `easy` になります。クイズ中に手動レーティングボタンは表示しません。

## 意図的に削除したもの

想定している使い方はシャッフルされた通常方向の学習なので、逆方向練習モジュールは削除しています。

削除した module id:

- `english_reverse`
- `leap_reverse`
- `leap_final_reverse`

空の `kobun_vocab` / `古文単語` モジュールは、0問の参照用モジュールとして残しています。ただし、通常のホーム画面の学習カードには表示しません。

## コマンド

```bash
npm install
npm run dev
npm test
npm run build
```

依存関係は `latest` ではなく、安定した Vite / TypeScript / Vitest のバージョンに固定しています。生成済みの lockfile は削除しました。これは private / internal registry を指しており、GitHub Actions 上で壊れた Vite パッケージに解決されていたためです。

## GitHub Actions

push、pull request、手動実行では、Web のみの CI ワークフローを使用します。

```text
.github/workflows/ci.yml
```

実行内容:

```text
npm install --include=dev
npm test
npm run build
```

未署名の debug APK を出力するには、次のワークフローを実行します。

```text
.github/workflows/build-android-debug.yml
```

次の名前の artifact をダウンロードします。

```text
LoopDeck-debug-apk
```

署名付き release APK を出力するには、次のワークフローを実行します。

```text
.github/workflows/build-android-release.yml
```

署名付き release ワークフローには、次の GitHub Actions Secrets が必要です。

```text
ANDROID_KEYSTORE_BASE64
KEYSTORE_PASSWORD
KEY_ALIAS
KEY_PASSWORD
```

署名付き APK は GitHub Releases にアップロードされます。Releases から最新の `LoopDeck2-signed-release-...apk` をダウンロードしてください。

release ワークフローは CI 中だけ keystore をデコードし、CI 中だけ `android/keystore.properties` を作成します。その後 `assembleRelease` を実行し、署名付き APK をアップロードして、一時的な署名ファイルを削除します。`.jks`、`.keystore`、`android/keystore.properties` はコミットしないでください。

署名設定のメモは次を参照してください。

```text
android/README_SIGNING.md
```

APK は、バンドルされたローカル Vite ビルドを包む小さな Android ラッパーです。インポートされた学習コンテンツはデータとしてのみ扱われます。LoopDeck は、実行可能な HTML、JavaScript、CSS、APK、shell、危険なパスを含むインポートを拒否します。

## Android Studio でのビルド

先に Web アセットをビルドします。

```bash
npm install
npm run build
```

その後、Android Studio で `android/` フォルダを開き、`assembleDebug` を実行します。

ローカルで署名付き release ビルドを作成する場合は、`android/keystore.properties.example` から `android/keystore.properties` を作成し、`assembleRelease` を実行します。実際の keystore や署名情報は絶対にコミットしないでください。

## LoopDeck Pack 形式

LoopDeck は2種類の教材形式をインポートできます。

1. 完全な `LoopDeckPack` オブジェクトを1つ含む単体の `.loopdeck.json` ファイル
2. 分割された JSON ファイルと任意のローカル画像を含む `.loopdeck.zip` ファイル

学習コンテンツはデータとしてのみ扱われます。インポートする pack には、実行可能な教材 HTML、JavaScript、CSS、Android バイナリ、shell script、リモート URL、危険なパスを含めてはいけません。

### Option A: 単体 JSON pack

次のようなファイルを作成します。

```text
my-pack.loopdeck.json
```

このファイルには、完全な pack オブジェクトを1つ含める必要があります。

```json
{
  "packVersion": 1,
  "packId": "my-first-pack",
  "title": "はじめてのパック",
  "description": "小さなサンプルパックです。",
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

その後、LoopDeck の `教材入出力` 画面を開き、JSON ファイルを選択し、検証結果をプレビューしてからインストールします。

### Option B: `.loopdeck.zip` pack

次のような ZIP ファイルを作成します。

```text
my-pack.loopdeck.zip
```

ZIP のルートには次を含める必要があります。

```text
manifest.json
modules.json
questions.json
images/
  optional-image.png
```

`images/` は任意です。画像を使う場合は、ZIP 内にローカル画像ファイルだけを配置し、`images/map01.png` のような相対パスで問題から参照します。

#### `manifest.json`

`manifest.json` には、pack のメタデータとフォルダを保存します。

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

必須フィールド:

- `packVersion`: `1` である必要があります
- `packId`: pack の一意な文字列 ID
- `title`: pack のタイトル
- `folders`: folder オブジェクトの配列

任意フィールド:

- `description`

#### `modules.json`

`modules.json` は教材モジュールの配列です。

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

必須フィールド:

- `id`: 一意な module ID
- `questionIds`: この module に含まれる question ID の一覧

推奨フィールド:

- `folderId`: `manifest.json` の folder ID と一致させることを推奨します
- `title`
- `subject`
- `description`
- `tags`

#### `questions.json`

`questions.json` は問題の配列です。

対応している問題形式:

```text
input
choice
multi_select
```

すべての問題に共通するフィールド:

- `id`: 一意な question ID
- `moduleId`: この問題を所有する module ID
- `type`: `input`、`choice`、または `multi_select`
- `prompt`: 問題文
- `explanation`: 回答後に表示される任意の解説
- `imageAsset`: 任意のローカル画像参照。例: `images/map01.png`
- `category`: カテゴリ絞り込みで使う任意のカテゴリ
- `number`: 範囲指定で使う任意の問題番号
- `example`: 任意の例文・ヒント行

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

必須フィールド:

- `answer`

任意フィールド:

- `acceptableAnswers`
- `direction`: `normal`、`ja_to_en`、または `en_to_ja`

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

必須フィールド:

- `choices`: 2つ以上の選択肢
- `answer`: 正解を1つ

任意フィールド:

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

必須フィールド:

- `choices`: 2つ以上の選択肢
- `correctChoices`: 1つ以上の正解選択肢

選択した集合が `correctChoices` と完全に一致した場合だけ正解になります。順序は関係ありませんが、選択漏れや余分な選択があると不正解になります。

### 画像ファイル

画像は任意です。対応している画像拡張子は次の通りです。

```text
.png
.jpg
.jpeg
.webp
```

`imageAsset` にはローカル相対パスを使用します。

```json
{
  "id": "geo-001",
  "moduleId": "geography-map",
  "type": "input",
  "prompt": "画像の地形名を答えなさい。",
  "answer": "扇状地",
  "imageAsset": "images/fan-shaped-landform.png"
}
```

`imageAsset` に `https://...` のようなリモート URL を使わないでください。

### ID ルール

安定した一意な ID を使用してください。

推奨スタイル:

```text
packId: school-term-1
module id: chemistry-ion
question id: chemistry-ion-001
```

ルール:

- `packId` は空にできません。
- module の `id` は pack 内で一意である必要があります。
- question の `id` は pack 内で一意である必要があります。
- 各 question の `moduleId` は module ID を指すべきです。
- 各 module の `questionIds` は question ID を指すべきです。

### ZIP の作成

ZIP 化する前のフォルダ例:

```text
history-mini-pack/
  manifest.json
  modules.json
  questions.json
  images/
    map01.png
```

フォルダ自体ではなく、フォルダの中身を ZIP 化してください。ZIP のルートに `manifest.json`、`modules.json`、`questions.json` が直接入っている必要があります。

良い例:

```text
manifest.json
modules.json
questions.json
images/map01.png
```

悪い例:

```text
history-mini-pack/manifest.json
history-mini-pack/modules.json
history-mini-pack/questions.json
```

### 安全ルール

LoopDeck は pack を保存する前に検証します。

拒否されるファイル形式:

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

拒否されるパス:

```text
../evil.json
..\evil.json
/absolute/path.json
C:\absolute\path.json
https://example.com/file.json
空のパス
null byte を含むパス
```

LoopDeck は、リモート URL や安全でない画像参照も拒否します。インポートされた教材 HTML、JavaScript、CSS は実行されません。

### クイックチェックリスト

pack をインポートする前に、次を確認してください。

- `packVersion` が `1` である。
- `packId` と `title` が空ではない。
- すべての module に `id` と `questionIds` がある。
- すべての question に `id`、`moduleId`、`type`、`prompt` がある。
- `input` 問題には `answer` がある。
- `choice` 問題には2つ以上の `choices` と `answer` がある。
- `multi_select` 問題には `choices` と `correctChoices` がある。
- 画像パスがローカルで、`.png`、`.jpg`、`.jpeg`、または `.webp` を使っている。
- ZIP のルートに `manifest.json`、`modules.json`、`questions.json` が直接入っている。
