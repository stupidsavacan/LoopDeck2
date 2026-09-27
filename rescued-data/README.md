# StudyHome rescue archive

This directory is **archive/provenance only**. LoopDeck does not load runtime data from `rescued-data/`.

## Current source of truth

- Built-in runtime pack: `data/builtin/loopdeck_builtin.loopdeck.json`
- Built-in runtime images: `public/images/history/`
- Android packaged web assets: generated from `dist/` into `android/app/src/main/assets/loopdeck/` by Gradle `preBuild`; they are not maintained in Git

## Archived rescue material

- `rescued-data/raw/StudyHomeNext_question_bank.raw.json`: rescued StudyHome-Next question-bank source used during migration
- `rescued-data/raw/assets/`: rescued original image binaries kept for provenance
- `rescued-data/loopdeck/by_module/`: per-module conversion outputs kept for audit/history
- `rescued-data/reports/`: conversion/count reports

The active built-in pack contains 1,112 usable questions. Reverse-practice modules are not part of the active pack, and the empty legacy vocabulary module is not exposed as a normal study module.

Do not edit files in this archive to change application behavior. Changes to built-in study content belong in the active runtime pack/assets above, with any provenance update made explicitly when needed.
