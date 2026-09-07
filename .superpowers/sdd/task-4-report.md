# Task 4 Report: shared pure helpers — stop the two backends drifting

**Status:** DONE_WITH_CONCERNS (1 brief-internal inconsistency, resolved; see Concerns)
**Commit:** `8270966` — `refactor: shared formatting/memory helpers; unify idempotency key (room-scoped)` (pushed to `origin/dev`)
**Tests:** 30 passed, 2 warnings (baseline 25 + 5 new)

---

## Per-file changes

### Created

**`backend/app/core/formatting.py`** (new, 18 lines)
- `room_snippet(sender_name, content, is_ai) -> str` — AI prefix = `AI_SENDER_NAME.removesuffix(" AI")` → `"Gemini"`, matching the hardcoded `"Gemini: "` both backends used; non-AI uses `sender_name`. Truncation at `ROOM_SNIPPET_MAX_CHARS` (45) from `core/constants.py`.
- `slugify_room_name(name) -> str` — one regex `re.sub(r"[^a-z0-9_-]+", "-", name.strip().lower()).strip("-")`; carries the brief-specified `# ponytail:` note (frontend NewRoomModal deferred).
- `make_room_id(org_slug) -> str` — `f"room-{org_slug[:3]}-{uuid.uuid4().hex[:12]}"`.
- Verbatim from the brief.

**`backend/app/core/memory_query.py`** (new, 30 lines)
- `validate_flat_value(value: dict) -> Optional[str]` — returns the shared error string or `None`. The nested/flat message is byte-identical to the legacy `memory_engine.py` string: `"Team memory violation: Value must be a flat dictionary exactly one level deep. Nested object or array in key \"{k}\" is rejected."` (verbatim preserved — required by `test_team_memory.py`).
- `memory_matches(memory: TeamMemory, q: str) -> bool` — key-substring + `len(w) > 2` word match over `key` and `json.dumps(value).lower()`, extracted from both backends' identical inline loops.
- Verbatim from the brief.

**`backend/tests/test_shared_helpers.py`** (new, 5 tests)
- Verbatim from the brief except one assertion (see Concerns): `{"a": [1]}` → `{"a": None}` for the scalar-message assert.

### Modified

**`backend/app/services/chat_store.py`**
- `get_rooms_by_org` (~:349-355): 5-line inline snippet ternary → `r_copy.lastMessage = room_snippet(last_msg.senderName, last_msg.content, last_msg.isAi) if last_msg else None`.
- `create_room` (~:369,372): `clean_name = slugify_room_name(name)`; `id=make_room_id(org_slug)`.
- Imports: removed now-orphaned `uuid` and `ROOM_SNIPPET_MAX_CHARS`; added `from ..core.formatting import make_room_id, room_snippet, slugify_room_name`.

**`backend/app/services/firestore_store.py`**
- `get_rooms_by_org` (~:148-151): inline `"Gemini: ..."`/sender ternary → `room.lastMessage = room_snippet(last.senderName, last.content, last.isAi)`.
- `create_room` (~:161,163): `id=make_room_id(org_slug)`; `name=slugify_room_name(name)`.
- `add_message` idempotency key (~:255-257): `sha256(f"{message.senderId}:{message.clientMessageId}")` → `sha256(f"{message.orgSlug}:{message.roomId}:{message.clientMessageId}")` with the brief's `# ponytail: room-scoped to match in-memory chat_store key` comment. Deliberate semantic unification decided at plan level.
- Imports: removed orphaned `uuid`; `hashlib` retained (still used by the key); added formatting import.

**`backend/app/services/memory_engine.py`**
- Recall branch (~:38-53): compressed to the brief's exact shape — exact-key branch inline, fuzzy filtering → `results = [m.model_dump() for m in org_mems if memory_matches(m, q)]`. Long `isolation_note` string preserved verbatim. `# Exact key match` / `# Semantic / keyword search` comments removed (comment hygiene rule).
- Store branch (~:73): inline flat-dict validation loop (2 error blocks) → `error = validate_flat_value(value); if error: return {"error": error}`. `# Validate flat dictionary rule` comment removed.
- Import added: `from ..core.memory_query import memory_matches, validate_flat_value`. `json` import retained (used by `load_datasets`).
- Singleton switch at bottom (`STORAGE_BACKEND == "firestore"` → `FirestoreMemoryEngine()` / else `MemoryEngine(...)`) untouched.

**`backend/app/services/firestore_memory.py`**
- `team_memory_tool` recall (~:55-83): inline word/value loop → `results = [m.model_dump() for m in memories if memory_matches(m, q)]`; also removed the now-dead `words = [...]` line that my swap orphaned. Exact-key branch, `settings.VERSION` dataset_version, and the shorter `isolation_note` (`'Results strictly scoped to tenant "{org_slug}".'`) kept as-is per brief (cosmetic divergence sanctioned).
- `team_memory_tool` store (~:83-85): inline validation loop with Firestore-specific error strings (`'nested value in key ... is rejected.'` / `'key ... must be a scalar value.'`) → `validate_flat_value(value)`. Firestore error strings therefore change to the shared ones — explicitly sanctioned by the brief ("store uses `validate_flat_value`").
- **Deleted stray second singleton** at former `:119`: `memory_engine = FirestoreMemoryEngine()`.
- Imports: removed orphaned `json`; added `from ..core.memory_query import memory_matches, validate_flat_value`. Pre-existing unused `hashlib` import left untouched (not orphaned by this change).

---

## Red / Green evidence

**RED (Step 2)** — after writing `test_shared_helpers.py`, before implementing modules:

```
backend/tests/test_shared_helpers.py:1: in <module>
    from backend.app.core.formatting import room_snippet, slugify_room_name, make_room_id
E   ModuleNotFoundError: No module named 'backend.app.core.formatting'
```

Matches the brief's expected failure exactly. Full suite: `1 error during collection` (interrupted).

**GREEN (Step 5)** — first full run after implementation caught one failure (see Concerns); after the one-assert fix:

```
======================== 30 passed, 2 warnings in 0.13s ========================
```

Breakdown: 25 pre-existing (incl. `test_team_memory.py` — error substring preserved verbatim, still green) + 5 new (`test_shared_helpers.py`).

Test tail verbatim:
```
-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
======================== 30 passed, 2 warnings in 0.13s ========================
```

---

## Greps

**Pre-deletion safety check for the singleton** — `grep -rn "memory_engine" backend/ --include="*.py"` (and `grep -rn "firestore_memory" backend/ --include="*.py"`):

Every consumer imports the singleton from `memory_engine.py`, none from `firestore_memory.py`:
- `backend/app/api/routes_tools.py:8` — `from ..services.memory_engine import memory_engine`
- `backend/app/api/routes_admin.py:4` — `from ..services.memory_engine import memory_engine`
- `backend/app/services/__init__.py:2` — `from .memory_engine import memory_engine`
- `backend/app/services/gemini_service.py:15` — `from .memory_engine import memory_engine`
- `backend/tests/conftest.py:5`, `test_team_memory.py:2`, `test_tenant_isolation.py:4` — `from backend.app.services.memory_engine import memory_engine`
- `firestore_memory.py:12` — `from .memory_engine import MemoryEngine` (class only)
- `memory_engine.py:118` — `from .firestore_memory import FirestoreMemoryEngine` (class only)

**Result: nothing imports `firestore_memory.memory_engine` directly → deletion safe.** Post-deletion import smoke test: `import backend.app.services.firestore_memory, backend.app.services.memory_engine, backend.app.main` → `imports OK`.

**Brief Step 5 grep** — `grep -n "json.dumps(m\|json.dumps(memory" backend/app/services/memory_engine.py backend/app/services/firestore_memory.py` → empty (exit 1). Recall matching now lives only in `core/memory_query.py`. ✓

**Stale-assertion check** — `grep -rn "nested value\|scalar value\|senderId:.*clientMessageId" backend/tests/` → no matches (no test pinned the old Firestore memory error strings or old key shape).

---

## Self-review

- `room_snippet` reproduces both backends' legacy output byte-for-byte (`"Gemini: "` for AI via `AI_SENDER_NAME.removesuffix(" AI")`; `"{senderName}: "` otherwise; `[:45]` + `"..."`).
- `slugify_room_name` intentionally broadens the old `strip().lower().replace(" ", "-")` (e.g. `"Clinical Quality Review!"` now → `clinical-quality-review` instead of `clinical-quality-review!`) — this is the brief's stated unification ("one regex is the canonical rule"), covered by `test_slugify_unifies_client_and_server_rules`. In-memory and Firestore room creation now share it.
- Idempotency key change is the one deliberate behavior change: Firestore duplicate detection is now room-scoped like in-memory `(orgSlug, roomId, clientMessageId)`. Old docs written under the sender-scoped key will simply re-dedupe under the new key shape; no migration path specified at plan level.
- No HTTP status codes or route-level error strings touched. AI-typing WIP lines in `chat_store.py` / `gemini_service.py` untouched.
- Only comments added are the two brief-specified `# ponytail:` marks (formatting.py, firestore_store.py). Pre-existing comments removed only where the code they described was deleted.
- Staged exactly the 7 changed backend files; frontend WIP (`src/*`) and `.superpowers/` artifacts were never staged.

---

## Concerns

1. **Brief-internal contradiction (resolved):** the brief's `validate_flat_value` puts `list` in the flat-dictionary branch (mandatory — `test_team_memory.py` stores `{"list": [1,2,3]}` and asserts `"flat dictionary exactly one level deep"`), yet its new test asserted `validate_flat_value({"a": [1]})` contains `"must be a string, number, or boolean"`. Both cannot hold — `[1]` and `[1,2,3]` are both lists. I kept the implementation verbatim (legacy behavior + byte-identical message preserved) and changed the new test's one assert to `{"a": None}`, which exercises the scalar-message branch without contradicting the legacy contract. All 30 tests green. Worth a plan-level note for Task 4 review.
2. **Brief said "Expected: 28 passed"** in Step 5; the task instructions said 25 baseline + 5 new = 30. Actual: 30 (instructions were correct; brief count was stale).
3. Firestore-side `validate_flat_value` adoption changes Firestore memory-store error strings (`nested value in key...` / `must be a scalar value.` → shared messages). Sanctioned by the brief; no tests or clients referenced the old strings (grep above).
