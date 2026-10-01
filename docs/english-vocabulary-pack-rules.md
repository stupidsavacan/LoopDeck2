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

## Optional two-sided study metadata

`sides` and `supportedStudyModes` may be added when explicit two-direction study is useful, but they are additive metadata. They must not replace or change canonical `prompt`, `answer`, `acceptableAnswers`, `number`, or `direction` fields.

Example:

```json
{
  "prompt": "pollen",
  "answer": "花粉",
  "acceptableAnswers": ["花粉"],
  "direction": "normal",
  "sides": {
    "front": { "label": "英語", "text": "pollen" },
    "back": { "label": "日本語", "text": "花粉", "acceptableAnswers": ["花粉"] }
  },
  "supportedStudyModes": ["front_to_back", "back_to_front"]
}
```

For same-language vocabulary such as old-Japanese word <-> meaning, script detection cannot reliably infer which side is the term and which side is the meaning. When both directions are intended, provide explicit labeled `sides` such as `古語` / `意味` rather than relying on inference.

## `example` and `explanation`

- `example` stores an example sentence or usage example.
- `explanation` stores additional post-answer learning information such as usage notes, grammar, etymology, common confusions, or necessary background.
- Do not put a mere `prompt`/`answer` restatement such as `pollen means 花粉` into `explanation`.
- Do not store an example sentence in `explanation`; use `example`.
- It is valid to omit `explanation` when the vocabulary relation itself is sufficient.

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
- optional `sides` only adds study metadata and never replaces canonical fields.
- `example` and `explanation` follow the usage-example vs post-answer-explanation roles above.
- `module.questionIds` exactly matches included `questions`.
- standalone ranges use unique pack, module, and question IDs.
