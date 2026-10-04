# Review semantics

LoopDeck has two review-related data systems, but only one of them schedules future reviews.

## Ownership

### SRS (`ReviewCard` / `ReviewLog`)

SRS owns automatic scheduling. It decides `dueAt`, interval, ease, and the state shown in the "今日の復習" queue.

Normal runtime states are:

| State        | Meaning                                               | Normal entry                    | Normal exit                                                        |
| ------------ | ----------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| `new`        | no scheduled review yet                               | card creation                   | first rated answer -> `review` or `relearning`                     |
| `review`     | scheduled normal review                               | correct answer                  | correct stays `review`; repeated recent failures can enter `leech` |
| `relearning` | retry after a failed answer                           | `again`                         | correct -> `review`; repeated recent failures can enter `leech`    |
| `leech`      | recent failure pressure is high; needs focused review | recent repeated `again` ratings | a correct answer -> `review`                                       |
| `mastered`   | long correct streak with a long interval              | stable correct answers          | failure -> `relearning`                                            |

`leechLevel` is a bounded recent-failure pressure signal. Historical `totalWrong` and `lapseCount` remain analytics counters; they do not permanently force `leech` or permanently prevent `mastered`.

### Compatibility-only states

- `learning` is retained in `ReviewState` so old persisted data/backups remain readable. Normal scheduling no longer writes it. A legacy `learning` card is handled as `relearning` in due buckets and UI.
- state value `suspended` and the `suspended` flag are retained for persisted-data compatibility. Suspended cards are excluded from automatic due queues. There is currently no normal user-facing transition that creates a suspended card.

## History weak queue (`Attempt`)

The history-based weak queue is analytics/advisory. It ranks candidates for a user-started weak-point review session; it does **not** write SRS `dueAt` or decide the automatic review date.

The default Review Center scope uses the recent-study window and recency weighting introduced for issue #24. All-history mode remains available for old material.

## Reset semantics

The two data sets are intentionally independent:

- **SRS予定だけリセット** deletes `ReviewCard` / `ReviewLog`. It does not delete answer history, so a question may still appear as a history-based weak candidate.
- **ミス履歴だけ消す** deletes wrong/revealed attempt history. It does not delete SRS state or due dates, so a question may still appear in "今日の復習".

UI confirmation text must state these independent effects explicitly.

## Persistence and backup compatibility

SRS cards are identified by `(questionId, questionMode)`. Opposite study directions have independent counters and schedules. Legacy cards/logs without direction migrate to `as_stored`; their original direction cannot be inferred safely. Missing new-card fields receive deterministic baseline defaults. Records with unrecoverable progress or historical log facts are discarded with diagnostics.

Answer/card/log writes use one serialized IndexedDB read-modify-write transaction. Retrying an already committed `attemptId` does not count another review. Review timestamps and due dates use the actual `Attempt.answeredAt`. Automatic queues admit cards only after their exact `dueAt`; today's summaries also include reviews scheduled later today.

Backups contain IndexedDB learning data and imported packs/assets. They do not contain browser resume state or study preferences; successful replace restore clears those browser records. Merge explicitly overwrites matching IDs after validating the resulting active pack set.

Historical attempts, bookmarks, cards and logs may refer to removed questions. These remain exportable historical data, while orphan cards are excluded from live due queues/counts. References to an active question must use its current module. A log linked to a present attempt must agree with its question, direction, result and answer time. A missing attempt is permitted because clearing mistake history intentionally leaves SRS logs intact. Invalid or orphan assets and incompatible stored records are omitted from exports with diagnostics; export reads all stores from one readonly transaction and validates the final backup before returning it.

Attempts marked `contentRetired` retain history for changed/removed content and are included in backups, but are excluded from current learning analytics and exempt from live question ownership checks. Replacing or deleting material clears affected bookmarks and SRS state so reinstalling the same IDs does not attach old study state to changed content.

## Session duration

The completed-session duration accumulates visible study time, including answer feedback. Time while the document is hidden and time between saving and resuming a session are excluded. Saving during feedback retains elapsed time, and completed sessions keep their final duration when reopened. Legacy resume records without accumulated duration recover the recorded answer times; unrecorded feedback time cannot be reconstructed.
