# LoopDeck Android 実機QA報告

実施: 2026-09-26 23:34 JST〜。moto g13へワイヤレスadbで接続して、インストール済みrelease APKを実機操作した。
この文書は23:38時点で一度保存された途中版を、Codex rolloutと後続の実機証拠から再構成した追補版である。23:38以降もCodexはQAを継続しており、旧版の「未実施」欄には実際には実施済みの項目が多数残っていた。

## 環境
- moto g13 / Android 14 / 720×1600
- package: `com.loopdeck.app` / versionName `0.1.0` / versionCode `1`
- アプリ更新日時: 2026-09-24 20:36:11
- Android System WebView: 153.0.8010.36
- 参照ソース: `4ab156ddff021282eb21138effb1efcbf4fcf11d`
- インストール済みAPKと参照ソースの完全一致は未確認。release APKは`run-as`不可のnon-debuggable buildだった。

## 実施範囲
Codexは起動・通常学習だけで終了せず、その後に専用6問教材を投入して入力式、4択、複数選択、長文、ブックマーク、答え表示、連打、強制終了、復習、PDF、バックアップ、削除・復元、教材ZIP出力まで実施した。rollout上の実機操作は少なくとも23:59頃まで継続している。

その後の引継ぎでは、Codexが最後に準備していた教材ZIP再取込と画像ZIP取込を完遂し、起動不能になる追加不具合を再現・切り分けした。

## 結果一覧
|確認|結果|証拠・観測|
|---|---|---|
|起動・ホーム|PASS|`01-home.png`|
|保存済み学習の再開|PASS|LEAP 301〜400を8/200から再開|
|4択回答・次問遷移|PASS|回答後9/200へ進行。`02-answer.png`|
|通常バックグラウンド復帰|PASS|9/200の同一問題を維持|
|画面回転|FAIL|学習画面からホームへ戻る。`03-landscape.png`, `rotation-repeat.xml`|
|回転後の進捗保存|PASS|教材詳細に再開(9/200)を表示|
|復習・分析画面|PASS|`04-review.png`, `05-analysis.png`|
|事前バックアップ|PASS|4,966,394 bytes。648 attempts / 9 imported packs / 7 imported assets / reviewCards 1 / reviewLogs 1|
|壊れたJSONの拒否|PASS|エラー表示で拒否し、その後のファイル選択も継続可能。`invalid-result.xml`|
|正常JSON教材の取込|PASS|`qa-device.json` 1教材6問を取込。`installed.xml`|
|入力式・空入力|PASS|空入力を不正解として処理し、正答と解説を表示。`q1-empty.xml`|
|4択誤答|PASS|誤答後に正答・解説を表示。`q2-wrong.xml`|
|複数選択|PASS|A/Cの組合せを正解判定。`q3-result.xml`|
|長い選択肢表示|FAIL|長い英数字が折り返されず右へはみ出す。`06-long-choice.png`|
|ブックマーク・答え表示|PASS|ブックマーク保存、答え表示を確認。`q4-hint.xml`, `q4-reveal.xml`|
|ソフトキーボード入力|PASS|入力欄へ`BANANA`を入力し`banana`として正解判定。`07-keyboard.png`, `q5-correct.xml`|
|回答後の連打耐性|PASS|同一ボタンを複数回押しても追加遷移・重複保存なし|
|強制終了→再起動→再開|PASS|6問目の途中でforce-stop後、`再開 (6/6)`から同じ6問目へ復帰。`restart-module.xml`, `restart-q6.xml`|
|学習完了|PASS/表示不具合あり|6問完了自体は成功。`08-complete.png`|
|再開後の完了集計|FAIL|6問完了表示に対し「回答記録1件・正答率100%」のみ表示。`09-resume-summary.png`, `complete-details.xml`|
|ブックマークだけ復習|PASS|1/1で対象問題を開始。`bookmark-review.xml`|
|SRS復習セッション|PASS|2問を完了し2件・100%を表示。`srs1.xml`, `srs2.xml`, `srs-complete.xml`|
|PDF生成・Android保存|PASS|A4 4ページ、41,806 bytesを保存。`worksheet.pdf`|
|PDF日本語描画|FAIL|4ページで日本語が欠落/文字化けし、問題文を読めない|
|テスト後バックアップ|PASS|4,982,137 bytes、657 attempts。通常学習6件+復習3件の追加9件を確認|
|回答履歴全削除|PASS|確認ダイアログのキャンセルと実削除を確認。削除後分析は0回答。`analytics-empty.xml`|
|バックアップ復元|PASS|657回答へ復元し、分析画面で654正解/3ミスを確認。`restored-analytics.xml`|
|教材ZIP書き出し|PASS|既存教材を`QA-HISTORY.zip`として保存。保存ダイアログのキャンセル→再試行も確認|
|教材ZIP再取込|PASS|`QA-HISTORY.zip`を再選択し、105問・同一IDの更新/マージプレビューまで正常。`history-import-picked.xml`|
|画像ZIPの欠損検出|PASS|`images/missing.png`欠損をWARNING表示。`image-import-result.xml`|
|画像ZIP取込後の起動|FAIL|取込直後にSYSTEM ERROR。再起動後も継続。`image-imported.xml`|

## Issue対応
- QA全体の親Issue: #42
- ANDROID-001（画面回転で学習画面が閉じる）: #51
- ANDROID-002（長い英数字の選択肢が横にはみ出す）: #52
- ANDROID-003（再開後の完了集計がセッション全体を反映しない）: 既存 #11
- ANDROID-004（PDFの日本語が欠落・文字化けする）: #53（#15は別系統のPDF correctness/truncationを追跡）
- ANDROID-005（仕様上許可されるmoduleを含むZIPで永続的な起動不能）: #54（関連 #7, #46）

## 不具合詳細

### ANDROID-001: 画面回転で学習画面が閉じる（#51）
手順: LEAP 301〜400の学習を再開し、9/200の問題を表示した状態で横向きへ回転。
期待: 同じ問題と学習画面を維持。
実際: ホームへ戻る。再試行でも再現。進捗自体は9/200として残る。
参照ソースでは`MainActivity.onCreate`がWebViewを作り直して`index.html`をロードし、Manifestに回転を処理する`configChanges`指定がないため、この経路が原因候補。ただしインストール済みAPKと参照ソースの完全一致は未確認。

### ANDROID-002: 長い英数字の選択肢が横にはみ出す（#52）
専用QA教材の4問目で、空白なしの長い英字列が折り返されず画面右端を越えた。同じ問題内の他の選択肢も横方向に押し広げられ、全文を読めない状態になった。
証拠: `06-long-choice.png`, `q4-long.xml`。

### ANDROID-003: 再開後の完了集計がセッション全体を反映しない（#11）
6問中6問目の表示中にアプリをforce-stopし、再起動後に`再開 (6/6)`から最後の問題を完了した。
完了画面は「6問の学習が終わりました」と表示する一方、回答記録は1件、正答率100%、正解1問と表示した。
一方、テスト後バックアップでは通常学習6問が各1件ずつ保存されており、回答履歴の欠損ではなく完了画面の集計範囲の問題と切り分けられた。

### ANDROID-004: PDFの日本語が欠落・文字化けする（#53）
PDF生成処理とAndroid保存自体は成功し、`worksheet.pdf`はA4・4ページ・41,806 bytesとして取得できた。
しかしレンダリング確認では4ページすべてで日本語が多数欠落/文字化けし、問題文を実用的に読めなかった。保存成功表示だけでは検出できない。
参照実装はNoto Sans JPのWOFFを埋め込む設計だが、実機出力では期待どおりの日本語描画になっていない。WOFF/fontkit/subset/glyph mapping/Android WebViewのどこが原因かは未確定であり、フォント経路を原因と断定しない。

### ANDROID-005: 仕様上許可されるmoduleを含むZIPで永続的な起動不能（#54）
引継ぎで`QA-IMAGES.loopdeck.zip`を取り込んだところ、プレビューでは欠損画像`images/missing.png`をWARNINGとして検出し、教材自体は取込可能と判定された。
取込直後、`SYSTEM ERROR` / `Cannot read properties of undefined (reading 'trim')`となり、アプリ再起動後も同じ起動エラーが継続した。証拠: `image-import-result.xml`, `image-imported.xml`。
原因は参照ソース上で具体化できた。READMEの`modules.json`仕様では必須なのは`id`と`questionIds`で、`subject`は推奨フィールドに留まる。`packValidator.ts`もmoduleの`subject`を必須検証していないため、`subject`なしのmoduleは正規に受理される。
一方`homeFolders.ts`の`folderTags()`は`module.subject`を`unique()`へ渡し、`unique()`は各値へ無条件に`value.trim()`を呼ぶ。`subject === undefined`の受理済みmoduleがホーム構築に入ると、この`.trim()`で例外になる。
したがって「不正なfixtureを誤って入れた」だけではなく、**documented/validated input contractとホーム画面側の前提が食い違っている**。インポート成功後の永続データに保存されるため、以降の起動でも同じ例外を踏む。

この不具合の復旧時、release APKはnon-debuggableで`run-as com.loopdeck.app`が使えず、アプリprivate DBから問題packだけを直接除去できなかった。ローカルにはrelease署名鍵もなく、同一署名の一時修正版APKによる上書きもできなかったため、最終的にアプリデータをclearして起動を回復した。事前バックアップはPC側に保持していた。

## データ整合性の確認
- 事前: 648 attempts / 9 imported packs / 7 imported assets / bookmarks 0
- テスト後: 657 attempts。専用QAの通常学習6件 + 復習3件 = 追加9件で一致
- 専用QAの各通常問題は1件ずつで、回答後の連打による重複保存なし
- ブックマークは`qa-long` 1件として保存
- 履歴全削除後、分析画面は0回答を表示
- `QA-POST.json`再読込後、分析画面は657回答・654正解・3ミスへ復元
- 元データ用`pretest-backup.json`はPC側に保存済み。後続の復元も完了済み

## 作成・保存された主な証拠
- `01-home.png`〜`09-resume-summary.png`: 主要UIと再現画面
- `app-logcat.txt`, `pdf-logcat.txt`: 実機ログ
- `qa-attempts.json`: QA回答履歴の抽出
- `worksheet.pdf`: 実機生成PDF
- 各`*.xml`: UIAutomatorの状態証拠
- `work/pretest-backup.json`: テスト前バックアップ
- `work/posttest-backup.json`: テスト後バックアップ
- `work/QA-IMAGES.loopdeck.zip`: 画像/欠損画像を含む再現fixture

## ログ・制限
取得したアプリPID限定logcatにはMALI `BAD ALLOC`、GPUAUX `Null anb`、OpenGLRendererのエラーがあったが、画面回転問題との因果関係は確認できていない。取得範囲ではAndroid側の`FATAL EXCEPTION`は確認しなかった。

旧版にあった「入力式・複数選択式、不正解表示、学習完了、復習セッション実行、インポート・エクスポート、PDF、バックアップ復元、ソフトキーボードは未実施」という記述は、rollout上の後続実施と矛盾するため撤回した。

今回なお未検証なのは、長時間のバックグラウンド放置、自動答え表示の時間精度、Chrome/Web版との挙動比較、インストール済みrelease APKと参照commitのバイナリ同一性である。

## 総括
通常学習・入力式・選択式・複数選択・復習・履歴保存/復元・教材入出力の主要経路は実機で広く動作した。一方、回転による学習中断、長文選択肢の横溢れ、再開後の完了集計、PDF日本語描画に実用上の不具合がある。
最も重大なのはANDROID-005で、仕様とvalidatorが受理するmoduleを永続保存した結果、次回起動を含めてアプリ全体が起動不能になる。これはインポート境界とホーム画面の型前提を揃える回帰テストが必要な問題である。
