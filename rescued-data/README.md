# StudyHome data rescue for LoopDeck

This folder contains rescued StudyHome-Next教材データ converted for LoopDeck.

## What changed in this v0.2 rescue

- Reverse-practice modules were removed because normal shuffled study is the intended workflow.
- Empty `kobun_vocab` was omitted from the usable LoopDeck pack because it had 0 questions.
- Raw original data is still preserved under `rescued-data/raw/`.

## Usable files

- `rescued-data/loopdeck/StudyHomeNext_normal_only.loopdeck.json`
- `rescued-data/loopdeck/StudyHomeNext_normal_only.loopdeck.zip`
- `data/builtin/builtin.json` is the same normal-only rescued pack and is loaded as LoopDeck built-in data.

## Counts

| Module | Questions |
| --- | ---: |
| 歴史総合 (`history`) | 188 |
| 地理総合 (`geography`) | 147 |
| 化学 (`chemistry`) | 176 |
| 生物 (`biology`) | 79 |
| 英語コミュニケーション (`english_comm`) | 129 |
| 英文暗記 (`english`) | 28 |
| LEAP 001〜200 (`leap`) | 200 |
| LEAP 201〜300 (`leap_final`) | 100 |
| 古文・動詞の活用 (`kobun_conjugation`) | 65 |

Total usable questions: **1112**.

Removed reverse modules: `english_reverse, leap_final_reverse, leap_reverse`.
