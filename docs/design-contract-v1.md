# LoopDeck Flow — Design Contract v1

Status: implementation contract

Baseline: `main` at `a97777f12ba13175fa54807ce52d86a54837c8ad`

Target: `reinterpretation/chat-redesign`

## Product thesis

LoopDeck Flowは、保存済みの教材・回答履歴・復習状態から「今やる数分」を自動構成し、考える前に学習へ入れるローカルファーストの学習ランナーである。

v1では新しいPack schema、新しいSRS、AI採点、cloud sync、concept graph、教材エディタを作らない。FocusはPackへ入れず、ユーザー端末内の設定として扱う。

## Compatibility Island

次の実装と意味を固定する。

- `src/core/models.ts`: Question、Attempt、ReviewCard、ReviewLog
- `src/core/answerJudge.ts`: 採点、near miss
- `src/core/reviewEngine.ts`: 履歴ベースの弱点
- `src/core/scheduler.ts`: SRSとdue順
- `src/core/questionPresentation.ts`: 表裏・方向変換
- `src/packs/assetSafety.ts`
- `src/packs/importedAssetStaging.ts`
- `src/packs/packAssetResolver.ts`
- `src/packs/packMerger.ts`
- `src/packs/packResolver.ts`
- `src/packs/packTypes.ts`
- `src/packs/packValidator.ts`
- `src/packs/zipImporter.ts`
- `src/packs/zipExporter.ts`
- Android WebViewのlocal-only、file chooser、native save、remote navigation拒否
- offline buildとsingle HTML build

新UIは `PackGateway` の外側からZIP、manifest、asset staging、merge規則を直接扱わない。既存import回帰テストは変更せず通す。

## Information architecture

主要階層は4つ。

- Today: 今やるもの
- Library: 持っている教材と自由学習
- Progress: 状態と次の行動
- More: Focus、Pack、PDF、表示、学習設定

Canonical routes:

```text
#today
#library
#module/<moduleId>
#module/<moduleId>/custom
#progress
#progress/attention
#progress/history
#more
#focus
#packs
#packs/import
#pdf-worksheet
#debug-log
#study/<sessionId>
#study/<sessionId>/checkpoint
#study/<sessionId>/complete
```

空hashと `#home` は `#today`、`#review` は `#progress/attention`、`#graphs` は `#progress`、`#import` は `#packs` へ `replaceState` で正規化する。問題ごとにhistory entryを作らない。CheckpointとCompleteは現在のstudy entryを置換する。

## Flow composition

時間と目標数は5分=12問、10分=25問、20分=50問。1問24秒で見積もる。

Fresh planの基準配分:

- due: 45%
- weak: 35%
- new: 20%

`buildSrsReviewQueue()`、`buildReviewQueue()`、未回答問題を利用する。同一question IDを統合し、`due > weak > new` をprimary reasonとする一方、全reason evidenceを保存する。過去30分の最新8種類はweak/newから一旦外すが、dueは外さない。不足枠はdue、weak、newの順で再配分し、それでも不足する場合だけ最近の候補を古い順に戻す。重複で水増ししない。同じmoduleが3問以上続く場合は、source priorityを大きく壊さない範囲で他moduleを挟む。5問ごとにCheckpointを作る。

## Player and idle reveal

Playerは `question → persisting → feedback → checkpoint/complete` のtagged stateで管理する。判定後の保存順は次の意味を維持する。

```text
judge
→ Attempt
→ db.addAttempt
→ ReviewCard get/create
→ inferReviewRating
→ applyReviewRating
→ putReviewCard
→ putReviewLog
```

保存完了前に二重送信・自動進行しない。正解時の自動進行は保存成功後650ms。不正解と答え表示では手動で次へ進む。

10秒auto revealは初期OFF。入力値の実変更、paste、selection set変更、初回hint表示で10秒へ戻す。IME composition中とdocument hidden中は停止する。1秒より大きなtimer gapをsleep/throttlingとして消費しない。自動表示したAttemptは `result=revealed`、`input=""`、auto nextなし。

## Storage

IndexedDBはv4へ上げ、`flowSessions` storeだけを追加する。既存storeをrename、移動、再計算しない。既存 `settings` storeで `flow.preferences.v1` と `flow.focus.v1` を保存する。新しい恒久データをlocalStorageへ増やさない。旧 `loopdeck_session_<moduleId>` はread compatibilityとして残し、FlowSessionへ薄く適応する。

Backup version 1の形式は変更しない。Flow preferences、Focus、paused Flow sessionはv1 backupへ追加しない。

## Architecture

```text
Screens / App shell
        ↓
PlayerController / StudyPlanEngine
        ↓                 ↓
LearningRepository    PackGateway
        ↓                 ↓
IndexedDB           Compatibility Island
```

`StudyPlanEngine` はpure domain logicでありDOM、IndexedDB、route、import/exportへ依存しない。`PlayerController` はDOMを生成しない。

## Acceptance

- `#today` がdefault entryで、1操作で5分Flowを開始できる
- due/weak/newが1Planへ合成され、reason evidenceが残る
- 既存history、bookmark、ReviewCard、ReviewLog、imported packs/assetsが消えない
- legacy module sessionを再開できる。旧データにauto revealがなければOFF
- input、choice、multi-select、長文、画像、keyboard、360/390pxで破綻しない
- bottom navがcontentやsafe areaを隠さない
- Android WebView、offline、single HTMLが動く
- import/export/merge/asset safetyの既存テストが無変更で通る
- 現行Home、Review Center、Graphsの情報設計を公開導線に残さない

実装中の優先順位は、データ無損失、import互換、採点/SRS意味、学習開始の摩擦、reason説明可能性、offline/Android/single HTML、360px、高度設定の退避、既存engineの再利用、迷ったUIの削除、の順とする。
