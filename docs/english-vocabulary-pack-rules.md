# English vocabulary pack rules

This document defines the canonical data format for English vocabulary packs such as LEAP.

## Canonical input question format

For an English vocabulary input question, store the English word by itself in `prompt`, and store Japanese meanings in `answer` and `acceptableAnswers`.

Recommended example:

```json
{
  "id": "leap_301_400-301",
  "moduleId": "leap_301_400",
  "type": "input",
  "number": 301,
  "prompt": "modern",
  "answer": "現代の",
  "acceptableAnswers": ["近代的な", "現代的な", "近代の"],
  "direction": "normal"
}
```

Avoid mixing the English term with Japanese UI text in `prompt`. For example, use `modern`, not `modern の意味は？`.

Do not mark canonical vocabulary rows as `direction: "en_to_ja"`. Use `direction: "normal"` or omit `direction`.

## Two-sided study metadata

To let LoopDeck show the UI option labeled `出題形式`, add `sides` and `supportedStudyModes` to input vocabulary rows. Do not create separate reverse-direction modules or duplicate question rows.

For English vocabulary packs:

- `sides.front` is the English headword.
- `sides.back` is the Japanese meaning side.
- `front_to_back` displays `英語 → 日本語`.
- `back_to_front` displays `日本語 → 英語`.
- `mixed` locks each question to one concrete direction when the session starts.

Recommended example:

```json
{
  "id": "leap_301_400-301",
  "moduleId": "leap_301_400",
  "type": "input",
  "number": 301,
  "prompt": "modern",
  "answer": "現代の",
  "acceptableAnswers": ["近代的な", "現代的な", "近代の"],
  "direction": "normal",
  "sides": {
    "front": {
      "label": "英語",
      "text": "modern",
      "acceptableAnswers": ["modern"]
    },
    "back": {
      "label": "日本語",
      "text": "現代の、近代的な、現代的な、近代の",
      "acceptableAnswers": ["現代の", "近代的な", "現代的な", "近代の"]
    }
  },
  "supportedStudyModes": ["front_to_back", "back_to_front"]
}
```

When supporting Japanese-to-English study, keep `sides.front.acceptableAnswers` narrow. For LEAP-style range packs, the expected English answer should be the headword for that row, not a nearby synonym from another numbered row.

Do not add modules such as `english_reverse`, `leap_reverse`, or `leap_final_reverse`. LoopDeck keeps attempts and review state tied to the original question ID, so direction is selected at study time instead of being represented by duplicated data.

## Japanese-to-English PDF worksheet behavior

The worksheet exporter can reverse clean English-word rows:

```json
{
  "prompt": "modern",
  "answer": "現代の",
  "acceptableAnswers": ["近代的な", "現代的な", "近代の"],
  "direction": "normal"
}
```

The PDF row becomes:

```text
問題: 現代の；近代的な；現代的な；近代の
解答: modern
```

## Split range pack rules

A pack must be self-contained. Do not reference question IDs that are not included in the same pack.

For a standalone LEAP 301-400 pack:

- `packId`: use a unique value such as `leap-301-400-v1`.
- module `id`: use a unique value such as `leap_301_400`.
- module `title`: use the actual included range, for example `LEAP 301〜400`.
- module `questionIds`: include only existing question IDs from the same pack.
- question IDs: use the same prefix as the module, for example `leap_301_400-301`.

Do not title a pack `LEAP 201〜400` if it only contains questions 301〜400. Do not list 201〜300 IDs unless those question objects are also included in the same pack.

## Checklist

- `type` is `input`.
- `prompt` is the bare English term only.
- `answer` is the main Japanese meaning.
- `acceptableAnswers` are additional Japanese meanings.
- `direction` is `normal` or omitted.
- add `sides` and `supportedStudyModes` when the module should offer `出題形式`.
- for English vocabulary, `sides.front` is English and `sides.back` is Japanese.
- for Japanese-to-English, keep the accepted English answer to the numbered headword.
- do not create reverse-direction modules.
- `module.questionIds` exactly matches included `questions`.
- standalone ranges use unique pack, module, and question IDs.
