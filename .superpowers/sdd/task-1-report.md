# Task 1 Report: `core/constants.py` — single-source shared backend values

**Status:** DONE_WITH_CONCERNS (all checks pass; two pre-existing-work deviations noted below)
**Commit:** `2eb0441` — `refactor: single-source shared constants in backend/app/core` (pushed to `origin/dev`, base `a615645`)
**Tests:** 19 passed (17 baseline + 2 new), 0 failures
**Grep audit:** clean — zero matches outside `backend/app/core/constants.py`

---

## What changed per file

### Created
- `backend/app/core/__init__.py` — empty package marker.
- `backend/app/core/constants.py` — verbatim from brief Step 3 (module docstring, `time` import, `settings` import, 9 constants incl. `ROOM_SNIPPET_MAX_CHARS`, `utc_now_iso()` with the one `# ponytail:` marker).
- `backend/tests/test_constants.py` — verbatim from brief Step 1 (incl. its `# ponytail:` marker).

### Modified (brief-listed)
| File | Changes |
|---|---|
| `backend/app/config.py` | Deleted `DEFAULT_BASE_RATE: float = 12000.0` from `Settings`. |
| `backend/app/models/schemas.py` | Import `DEFAULT_BASE_RATE`; `Organization.baseRate` default → `DEFAULT_BASE_RATE`. |
| `backend/app/services/chat_store.py` | Import (`DEFAULT_BASE_RATE, DEMO_PASSWORD, ROOM_SNIPPET_MAX_CHARS, SSE_OFFLINE_GRACE_SECONDS, TYPING_TTL_SECONDS, utc_now_iso`); 3× `baseRate=12000.0` → `DEFAULT_BASE_RATE`; 10× `passwordHash="password123"` → `DEMO_PASSWORD`; `authenticate_user` default + `or password ==` check → `DEMO_PASSWORD`; 4× strftime → `utc_now_iso()`; `> 3.0` → `> TYPING_TTL_SECONDS`; `asyncio.sleep(4.0)` → `SSE_OFFLINE_GRACE_SECONDS`; 2× `[:45]` → `[:ROOM_SNIPPET_MAX_CHARS]`. |
| `backend/app/services/firestore_store.py` | Import `TYPING_TTL_SECONDS, utc_now_iso`; 4× strftime → `utc_now_iso()`; `<= 3` → `<= TYPING_TTL_SECONDS`. |
| `backend/app/services/clinical_engine.py` | Deleted local `DATASET_VERSION = settings.VERSION`; import `DATASET_VERSION, DEFAULT_BASE_RATE`; `base_rate: float = 12000.0` → `DEFAULT_BASE_RATE`; `reason="Unknown ICD-10 code in teamchat-seed-2026.1"` → `reason=f"Unknown ICD-10 code in {DATASET_VERSION}"` (byte-identical rendered string; `settings` import retained — still used for `ClinicalEngine(settings.DATA_DIR)`). |
| `backend/app/services/memory_engine.py` | Deleted local `DATASET_VERSION = settings.VERSION`; import `DATASET_VERSION, utc_now_iso`; strftime → `utc_now_iso()` (`time` retained — `time.time()` still used for memory IDs). |
| `backend/app/services/firestore_memory.py` | strftime → `utc_now_iso()`; removed now-unused `import time`. |
| `backend/app/services/gemini_service.py` | Import (`AI_SENDER_ID, AI_SENDER_NAME, DEFAULT_BASE_RATE, GEMINI_KEY_PLACEHOLDER, utc_now_iso`); `"MY_GEMINI_API_KEY"` sentinel tuple → `GEMINI_KEY_PLACEHOLDER`; `args.get("base_rate", 12000.0)` → `DEFAULT_BASE_RATE`; `senderId`/`senderName` → `AI_SENDER_ID`/`AI_SENDER_NAME`; strftime → `utc_now_iso()`. |
| `backend/app/api/routes_auth.py` | `LoginRequest.password` default → `DEMO_PASSWORD`. |
| `backend/app/api/routes_messages.py` | strftime → `utc_now_iso()`; removed now-unused `import time`. |
| `backend/app/api/routes_realtime.py` | `serverTime` strftime → `utc_now_iso()` (`time` retained — heartbeat uses `time.time()`). |
| `backend/app/main.py` | Health sentinel `!= "MY_GEMINI_API_KEY"` → `!= GEMINI_KEY_PLACEHOLDER`; timestamp strftime → `utc_now_iso()`; removed now-unused `import time`. |

### Modified (audit-driven — beyond the brief's file list)
The brief's Step 5 grep audit (authoritative acceptance gate: zero matches) required three conversions not listed in Step 4:

- `backend/app/api/routes_tools.py` — `CalculateRafRequest.baseRate` default and `base_rate=req.baseRate or 12000.0` → `DEFAULT_BASE_RATE` (import added). Same semantics, no status-code/behavior change.
- `backend/app/services/gemini_service.py:229` — the initial AI message `timestamp` strftime → `utc_now_iso()` (brief listed only :225-226 for this file).

### Uncommitted WIP handled
The working tree contained pre-existing, uncommitted work unrelated to this task (a typing-indicator feature):

- `routes_messages.py:103` `chat_store.set_typing("gemini-ai", "Gemini AI (Thinking...)", ...)` and `gemini_service.py:437` `chat_store.clear_typing("gemini-ai", ...)` — these lines sit in files this task must commit, and their `"gemini-ai"` literals are exactly the duplicate this task kills, so they were converted to `AI_SENDER_ID` to keep the audit clean. The functional WIP lines themselves ride along in commit `2eb0441` (staging is whole-file; hunk-splitting them out would have produced a half-wired feature in neither state). `"Gemini AI (Thinking...)"` left as-is — it is not `AI_SENDER_NAME`.
- Frontend WIP (`src/components/ChatArea.tsx`, `src/context/ChatContext.tsx`, `src/index.css`) — deliberately **not** committed (excluded from staging despite the brief's `git add -A`, to avoid sweeping unrelated half-finished UI into a backend refactor commit). It remains uncommitted in the working tree.

---

## Step verification

- **Step 2 (red):** `ModuleNotFoundError: No module named 'backend.app.core'` — failed exactly as predicted; collection interrupted, baseline 17 still green at that point.
- **Step 5 (green):** see test output tail below.
- Import smoke test: `backend.app.main` + all touched services/routes import cleanly in default (memory) storage mode. Directly importing `firestore_memory`/`firestore_store` standalone fails on missing GCP credentials — **pre-existing in HEAD** (module-level `memory_engine = FirestoreMemoryEngine()` instantiation); unreachable in default mode, not a regression.

### Test output tail
```
-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
======================== 19 passed, 2 warnings in 0.14s ========================
```

### Grep audit
```
$ grep -rn '12000\|password123\|%Y-%m-%dT%H\|gemini-ai\|MY_GEMINI_API_KEY' backend/app | grep -v core/constants.py
```
With text-mode binary exclusion (`-I`): **empty** (exit 1). Without `-I`, the only matches are gitignored stale `__pycache__/*.pyc` bytecode. Frontend literals untouched per the brief's deferred ceiling.

---

## Self-review notes

1. **Zero behavior drift:** every replacement is value-identical (`TYPING_TTL_SECONDS=3.0` vs `3`/`3.0`, `SSE_OFFLINE_GRACE_SECONDS=4.0`, `DATASET_VERSION` renders to the same `teamchat-seed-2026.1`). No HTTP status codes or clinical math touched; `baseRate` math paths unchanged (only the defaulted literal).
2. **No import cycles:** `core/constants.py` imports only `..config`; verified all modules import in both directions used.
3. **Line drift:** brief's `:577`/`:616` chat_store refs were actually `:579`/`:618` — located by snippet, as instructed. All conversions cross-checked by count (13× DEMO_PASSWORD, 4× utc_now_iso in chat_store, etc.).
4. **`ROOM_SNIPPET_MAX_CHARS`** is defined and used per brief even though it's absent from the brief's "Produces" interface list — later tasks should add it to that list if they consume it.
5. **Unused imports** (`time` in `main.py`, `routes_messages.py`, `firestore_memory.py`) were removed since the refactor orphans them; kept where `time.time()` remains in use.
6. **Constraints honored:** no comments added except the two `# ponytail:` markers from the brief; no error strings, status codes, or clinical math changed; commit message verbatim from brief.
