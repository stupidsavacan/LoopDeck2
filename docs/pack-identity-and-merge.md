# Pack identity and merge semantics

LoopDeck resolves pack data in **weak-to-strong order**. The built-in pack is loaded first and imported packs are loaded after it.

## Identity contract

- `packId` is a replacement key. If the same `packId` appears more than once, the later pack is the active pack.
- `module.id` is an override key. If different active packs contain the same module ID, the later pack's module is active.
- `question.id` is a **global active-data key**. Different active `packId`s must not own the same question ID because attempts, bookmarks, review cards and review logs are keyed by question ID.
- A same-pack update may reuse its existing question IDs because it replaces that pack.
- A merge may resolve an incoming question-ID conflict inside the target pack: identical questions are reused; different questions receive a deterministic `__merge_N` suffix and the incoming module references are remapped.

The runtime resolver additionally looks up each module's questions only inside the pack that owns that active module. This is a defensive rule for legacy/corrupt data: a cross-pack ID collision cannot make a module display another pack's question.

## Metadata precedence

Presentation metadata belongs to pack/module data. Home does not keep a second built-in metadata table.

For an ID conflict, later data wins consistently:

- later pack replaces the same `packId`;
- later active pack replaces the same `module.id`;
- later pack folder metadata replaces the same `folder.id` while preserving the folder's first shelf position.

Legacy built-in source rows are normalized once into the same `FolderInfo` / `ModuleInfo` fields used by imported packs (`description`, `tags`, `subtitle`, accent fields, and folder assignment).

## Asset writes

Asset persistence always receives `pack + assets + strategy` explicitly. There is no hidden importer/merger staging state.

- `replace`: delete all stored assets for the target pack, then store the incoming set. Use for a direct pack overwrite/import.
- `upsert`: preserve unrelated stored paths and write every incoming path. If an incoming asset reuses an existing path, the incoming bytes replace the stored bytes. Use for pack/module merge updates.

Merge-preview functions only calculate a candidate pack and report. They do not stage or persist assets.

## Validation before persistence

Each imported pack is structurally validated. Merge results are validated again before they are returned for persistence. Direct imports are also checked against the active pack set so cross-pack question-ID collisions are rejected instead of becoming ambiguous runtime state.
