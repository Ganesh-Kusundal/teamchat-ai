# Task 6 Report: dead code deletion + internal dedup

**Status:** DONE_WITH_CONCERNS (1 deliberate deviation from brief's exact code, documented below)
**Commit:** `2781eda` — `refactor: delete dead symbols, dedup streaming loop, drop duplicate npm scripts` (pushed to `origin/dev`)
**Base:** `657e530` (matches `.superpowers/sdd/task-6-base.txt`)

---

## Step 1: Prove dead code is dead

Command: `grep -rn "GroundingRecord\|aiPersona" backend src`

```
Binary file backend/app/models/__pycache__/schemas.cpython-313.pyc matches
Binary file backend/app/models/__pycache__/schemas.cpython-314.pyc matches
backend/app/models/schemas.py:63:    aiPersona: Optional[str] = None
backend/app/models/schemas.py:237:class GroundingRecord(BaseModel):
src/types.ts:45:  aiPersona?: string;
```

Only definition lines in source (brief's line numbers `:62`/`:236` were off by one against the actual file; the symbols are the same). `.pyc` matches are stale compiled bytecode, not source usage. **No usages found → safe to delete.** Post-deletion re-grep with `--include="*.py" --include="*.ts" --include="*.tsx"`: `no source refs`.

Additional safety checks before deleting:
- `grep -rn "_stream_response\|generate_content_stream" backend/tests/` → no test references to streaming internals.
- `Literal` import in `schemas.py` stays used (9 other sites) after `GroundingRecord` removal.
- `re` import in `gemini_service.py` stays used (`generate_intelligent_fallback` at `:450`) after the dedup.

## WIP audit (per task instructions)

- `chat_store.clear_typing(AI_SENDER_ID, room_id, org_slug)` (WIP, committed in `2eb0441`) sits at the END of `generate_ai_response_stream` (was `:441`, now `:457`) — **outside** both streaming branches, after the fallback path. Untouched by the dedup; behavior preserved. It does NOT exist inside the two branches, so nothing needed merging into the helper.
- No other WIP lines inside or adjacent to the two streaming blocks.
- Working-tree WIP (`src/components/ChatArea.tsx`, `src/context/ChatContext.tsx`, `src/index.css`, `.superpowers/sdd/progress.md`) was NOT staged. `src/types.ts` IS a task file and WAS staged despite living in `src/`.

## Step 2: Deletions

- `backend/app/models/schemas.py`: removed `aiPersona: Optional[str] = None` (was `:63`, `Room`) and the entire `GroundingRecord` class (was `:237-244`, last class in file). File now ends at `estimated_annual_payment: int`. Net −10 lines.
- `src/types.ts:45`: removed `aiPersona?: string;` from `Room`. Net −1 line.
- `package.json`: removed `"dev:python"` and `"test:python"` scripts (exact duplicates of `dev:backend` and `test`). JSON validated: `python3 -c "import json;json.load(open('package.json'))"` → `JSON OK`. Net −2 lines.

## Step 3: Streaming dedup in `gemini_service.py`

Added `_stream_response` immediately after `execute_tool` (ends `:128`), per the brief's exact body, plus ONE addition: a `strip_tool_tags=False` kwarg.

**Deviation from brief — reason:** The brief's helper body (`text_chunk = chunk.text or ""`, no sanitization) was written against the plan-time shape of the two branches, but the current tool-calls branch contains a committed functional line the no-tool branch lacks:

```python
raw_chunk = chunk.text or ""
# Sanitize any accidental internal tool tags
text_chunk = re.sub(r"</?tool_code>", "", raw_chunk)
```

Provenance: introduced in commit `cb7ed67` ("feat: add Firestore production backend...") — NOT in the original `25550fb`, where both branches were identical. It exists in only ONE branch.

Why it must not be dropped: `chat_store.update_streaming_message` (in-memory, `chat_store.py:507`) strips `</?tool_code>` only on completion, and `firestore_store.update_streaming_message` (`firestore_store.py:314-329`) **never strips**. So the inline strip is the only thing preventing `<tool_code>` tags from (a) appearing in mid-stream chunk payloads and (b) persisting to Firestore production documents when the model disobeys its "Never output internal tags" system instruction. Applying the brief's helper verbatim would have silently changed behavior in the tool-synthesis path — this is not a WIP line, but per the task rule ("if they exist in only ONE branch ... Do not delete or reorder"), branch-divergent functional lines must not be collapsed away.

Resolution: the helper signature keeps the brief's 8 params as the base and appends `strip_tool_tags=False`; the tool branch passes `strip_tool_tags=True` (one-kwarg deviation from the brief's exact call); the no-tool branch call matches the brief **verbatim**. Net behavior: 100% identical to pre-refactor for both branches. The deleted in-loop comment (`# Sanitize any accidental internal tool tags`) is covered by the self-documenting kwarg name; no new comments added (global constraint).

Branch replacements (now `:373-378`):

```python
                    await _stream_response(client, model_name, followup_prompt, system_instruction,
                                           ai_message_id, room_id, org_slug, tool_calls_executed,
                                           strip_tool_tags=True)
                else:
                    await _stream_response(client, model_name, attributed_prompt, system_instruction,
                                           ai_message_id, room_id, org_slug, [])
```

`gemini_service.py`: 620 → 583 lines. Overall diff: 4 files changed, 21 insertions(+), 71 deletions(-).

## Step 4: Verify

`npm test` tail:

```
backend/tests/test_token_extraction.py::test_x_user_id_then_query PASSED [ 94%]
backend/tests/test_token_extraction.py::test_realtime_stream_accepts_bearer PASSED [ 97%]
backend/tests/test_token_extraction.py::test_query_token_still_authenticates_regular_routes PASSED [100%]
======================== 34 passed, 2 warnings in 0.26s ========================
```

34 passed = baseline, no new tests added, none broken.

`npm run lint` (tsc --noEmit): exit 0 (`LINT EXIT 0`).

Also verified: `python3 -m py_compile` on both edited backend files → OK.

## Step 5: Commit

```
[dev 2781eda] refactor: delete dead symbols, dedup streaming loop, drop duplicate npm scripts
 4 files changed, 21 insertions(+), 71 deletions(-)
To https://github.com/Ganesh-Kusundal/teamchat-ai.git
   657e530..2781eda  dev -> dev
```

Staged exactly: `backend/app/models/schemas.py`, `backend/app/services/gemini_service.py`, `src/types.ts`, `package.json`. NOT staged: `src/components/ChatArea.tsx`, `src/context/ChatContext.tsx`, `src/index.css`, `.superpowers/sdd/progress.md`, untracked `.superpowers/sdd/*` files. Brief's `git add -A` overridden by task instructions.

## Self-review

- Dead symbols provably unused in source; only `__pycache__` binaries mentioned them (regenerated on next run).
- Dedup is behavior-preserving by construction: same stream → per-chunk store call → `sleep(0.02)` → final complete call ordering in both paths; identical args; temperature 0.3 and system_instruction wiring unchanged.
- One-branch-only functional line (`re.sub` tag strip) preserved via `strip_tool_tags=True` on the tool branch only; documented rather than silently dropped.
- `clear_typing` WIP line untouched and outside the deduped region.
- No comments added; no HTTP status or error-string changes anywhere.
- Tests: 34 passed (baseline). Lint: exit 0.

## Concerns

1. **Interface deviation (minor, deliberate):** `_stream_response` has a 9th optional kwarg (`strip_tool_tags=False`) beyond the brief's "Produces" signature, and the tool-branch call adds `strip_tool_tags=True`. Required to preserve committed behavior from `cb7ed67`; dropping it would have changed what persists to Firestore when the model emits forbidden tags. If the reviewer prefers the brief's exact 8-param signature, the alternative is a behavior change in the tool path — not recommended.
2. Brief line references (`schemas.py:62,236-242`, `gemini_service.py:325-381`) were stale by a few lines vs. the actual file; symbols/branches identified structurally instead. No impact.
