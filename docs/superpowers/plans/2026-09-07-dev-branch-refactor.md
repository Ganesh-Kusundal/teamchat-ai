# Dev Branch Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the shotgun-surgery defects found in the 2026-09-07 architectural audit (constants scattered across 10 files, 7 copy-pasted auth guards, 2 divergent store backends, 27 inline `fetch` calls, 3 copies of seed accounts) with the smallest set of changes that actually fixes them.

**Architecture:** Two new `core/` modules (constants, events) become the single source for shared backend vocabulary. One FastAPI dependency replaces all room-membership guards. Both storage backends (in-memory `ChatStore`, `FirestoreChatStore`) call shared pure helpers so they can't drift. Frontend gets one `services/api.ts` client; seed accounts come from one demo endpoint instead of two hardcoded arrays.

**Tech Stack:** Python 3.11+ / FastAPI / pydantic / pytest (existing, 17 tests — the safety net); React 19 / TypeScript / `tsc --noEmit` (existing lint — the frontend safety net).

**Branch:** `dev` (already created and pushed; all work happens here)

## Global Constraints

- Baseline: `npm test` → **17 passed** before any change. Every task must end with 17+ passing.
- Frontend check is `npm run lint` (`tsc --noEmit`) — must pass after every frontend task.
- Do NOT change HTTP status codes or tenant-isolation error strings (`test_tenant_isolation.py` string-matches `"Strict Tenant Isolation Enforced"`; keep it).
- Do NOT touch clinical math in `clinical_engine.py` (`calculate_risk_score`, `_get_age_band`, hierarchy logic — CMS domain, test-pinned values 0.508/0.166). Only the exception-listed bits named in tasks.
- Python style: no comments unless marking a deliberate simplification as `# ponytail: ...`.
- Every commit on `dev`; push at the end of each task: `git push origin dev`.
- Idempotency-key decision (audit flag): canonical key is **room-scoped** `(orgSlug, roomId, clientMessageId)` — Firestore backend changes to match in-memory semantics (Task 4).
- Working directory for all commands: repo root. Backend tests: `npm test`.

## Deferred (ponytail ceilings — do NOT build now)

| Skipped | Why | Add when |
|---|---|---|
| Splitting `gemini_service.py` / `ChatContext.tsx` into modules | Churn without a failing test; files work | Next time a feature forces edits in them |
| Unified error contract (`core/errors.py` + exception handlers) | Breaks frontend `data.error` handling + test string matches for marginal gain | When a third error transport appears |
| OpenAPI → TS codegen, vitest, store ABC + full parity suite, `member_doc` extraction | New deps / ceremony; dedup already achieved via shared helpers | Second frontend consumer of types, or a 3rd storage backend |
| Frontend mirrors of backend constants (`gemini-ai`, snippet length) | Cross-language sharing needs codegen (deferred above) | With OpenAPI codegen |
| Moving `Message` construction from `routes_messages` into the store | Works, tested, zero user impact; pure code-motion | When a second message-producing endpoint appears |

---

### Task 1: `core/constants.py` — single-source shared backend values

**Files:**
- Create: `backend/app/core/__init__.py` (empty), `backend/app/core/constants.py`
- Modify: `backend/app/config.py:12` (delete `DEFAULT_BASE_RATE`), `backend/app/models/schemas.py:38`, `backend/app/services/chat_store.py` (13× `"password123"`, 4× strftime, typing TTL, grace, baseRate ×3), `backend/app/services/firestore_store.py` (4× strftime, typing TTL), `backend/app/services/clinical_engine.py:17,168,209`, `backend/app/services/memory_engine.py:8,95`, `backend/app/services/firestore_memory.py:105`, `backend/app/services/gemini_service.py:61,104,225-226`, `backend/app/api/routes_auth.py:15`, `backend/app/api/routes_messages.py:92`, `backend/app/api/routes_realtime.py:46`, `backend/app/main.py:56,59`
- Test: existing suite + grep audit

**Interfaces:**
- Consumes: `settings.VERSION` from `backend.app.config`
- Produces (later tasks import these exact names): `DEFAULT_BASE_RATE`, `DATASET_VERSION`, `AI_SENDER_ID`, `AI_SENDER_NAME`, `DEMO_PASSWORD`, `GEMINI_KEY_PLACEHOLDER`, `TYPING_TTL_SECONDS`, `SSE_OFFLINE_GRACE_SECONDS`, `utc_now_iso() -> str`

- [ ] **Step 1: Write a failing test that pins the module's existence and values**

Create `backend/tests/test_constants.py`:

```python
from backend.app.core.constants import (
    DEFAULT_BASE_RATE, DATASET_VERSION, AI_SENDER_ID, AI_SENDER_NAME,
    DEMO_PASSWORD, utc_now_iso,
)
from backend.app.config import settings


def test_constants_single_source():
    assert DEFAULT_BASE_RATE == 12000.0
    assert DATASET_VERSION == settings.VERSION
    assert AI_SENDER_ID == "gemini-ai"
    assert AI_SENDER_NAME == "Gemini AI"
    assert DEMO_PASSWORD == "password123"


def test_utc_now_iso_format_is_sortable():
    ts = utc_now_iso()
    assert len(ts) == 20 and ts.endswith("Z") and ts[10] == "T"
    assert "2026-" in ts  # ponytail: format is load-bearing for lexicographic ordering
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep test_constants`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.app.core'`

- [ ] **Step 3: Write the module**

`backend/app/core/constants.py`:

```python
"""Single source for cross-cutting values. Nothing outside this file may define them."""
import time

from ..config import settings

DEFAULT_BASE_RATE = 12000.0
DATASET_VERSION = settings.VERSION
AI_SENDER_ID = "gemini-ai"
AI_SENDER_NAME = "Gemini AI"
DEMO_PASSWORD = "password123"
GEMINI_KEY_PLACEHOLDER = "MY_GEMINI_API_KEY"
TYPING_TTL_SECONDS = 3.0
SSE_OFFLINE_GRACE_SECONDS = 4.0
ROOM_SNIPPET_MAX_CHARS = 45


def utc_now_iso() -> str:
    # ponytail: string timestamps, not datetime — compared lexicographically in chat_store.get_messages
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
```

`backend/app/core/__init__.py`: empty file.

- [ ] **Step 4: Replace every duplicate site (import, then swap the literal)**

In each file add the import (adjust depth: services are `..core.constants`, api are `..core.constants`, models is `..core.constants`, main is `.core.constants`):

```python
from ..core.constants import (
    AI_SENDER_ID, AI_SENDER_NAME, DATASET_VERSION, DEFAULT_BASE_RATE,
    DEMO_PASSWORD, GEMINI_KEY_PLACEHOLDER, SSE_OFFLINE_GRACE_SECONDS,
    TYPING_TTL_SECONDS, utc_now_iso,
)
```
(only the names each file uses)

Exact replacements:
- `config.py`: delete line 12 `DEFAULT_BASE_RATE: float = 12000.0`
- `schemas.py:38`: `baseRate: Optional[float] = 12000.0` → `baseRate: Optional[float] = DEFAULT_BASE_RATE`
- `chat_store.py`: all 10 seed `passwordHash="password123"` → `passwordHash=DEMO_PASSWORD`; `:315` default `password: str = "password123"` → `password: str = DEMO_PASSWORD`; `:318` `or password == "password123"` → `or password == DEMO_PASSWORD`; 4× `time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())` → `utc_now_iso()`; `:577` `> 3.0` → `> TYPING_TTL_SECONDS`; `:616` `await asyncio.sleep(4.0)` → `await asyncio.sleep(SSE_OFFLINE_GRACE_SECONDS)`; `:26/:35/:44` `baseRate=12000.0` → `baseRate=DEFAULT_BASE_RATE`; `:346/:348` `[:45]` → `[:ROOM_SNIPPET_MAX_CHARS]`
- `firestore_store.py`: 4× strftime → `utc_now_iso()`; `:361` `<= 3` → `<= TYPING_TTL_SECONDS`
- `clinical_engine.py`: `:17` `DATASET_VERSION = settings.VERSION` → import from constants (delete local def); `:168` `base_rate: float = 12000.0` → `base_rate: float = DEFAULT_BASE_RATE`; `:209` `reason="Unknown ICD-10 code in teamchat-seed-2026.1"` → `reason=f"Unknown ICD-10 code in {DATASET_VERSION}"`
- `memory_engine.py`: `:8` delete local `DATASET_VERSION = settings.VERSION`, import from constants; `:95` strftime → `utc_now_iso()`
- `firestore_memory.py`: `:105` strftime → `utc_now_iso()`
- `gemini_service.py`: `:61` `"MY_GEMINI_API_KEY"` → `GEMINI_KEY_PLACEHOLDER`; `:104` `float(args.get("base_rate", 12000.0))` → `float(args.get("base_rate", DEFAULT_BASE_RATE))`; `:225-226` → `senderId=AI_SENDER_ID, senderName=AI_SENDER_NAME`
- `routes_auth.py:15`: `password: str = "password123"` → `password: str = DEMO_PASSWORD`
- `routes_messages.py:92`: strftime → `utc_now_iso()`
- `routes_realtime.py:46`: strftime → `utc_now_iso()`
- `main.py`: `:56` sentinel → `GEMINI_KEY_PLACEHOLDER`; `:59` strftime → `utc_now_iso()`

- [ ] **Step 5: Run tests + grep audit**

Run: `npm test`
Expected: 19 passed (17 baseline + 2 new)

Run: `grep -rn '12000\|password123\|%Y-%m-%dT%H\|gemini-ai\|MY_GEMINI_API_KEY' backend/app | grep -v core/constants.py`
Expected: empty output (frontend literals stay — deferred ceiling)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: single-source shared constants in backend/app/core" && git push origin dev
```

---

### Task 2: `core/events.py` — one SSE event contract for both stores

**Files:**
- Create: `backend/app/core/events.py`
- Modify: `backend/app/services/chat_store.py` (8 dict-literal broadcasts), `backend/app/services/firestore_store.py` (8 `_emit_room`/`_emit_org` call sites), `backend/app/api/routes_realtime.py:40-57`
- Test: `backend/tests/test_events.py`

**Interfaces:**
- Produces: `EventType` (str Enum: CONNECTED, NEW_MESSAGE, MESSAGES_READ, STREAM_CHUNK, TYPING_UPDATE, PRESENCE_SYNC, PRESENCE_UPDATE, ROOM_CREATED, MEMBER_ADDED, MEMBER_REMOVED) and `event(ev, payload, org_slug="", target_user_id=None) -> dict`. Stores build payloads; `event()` owns the envelope (always includes `orgSlug` — superset of the old in-memory envelope; the frontend ignores unknown keys).

- [ ] **Step 1: Write failing test**

`backend/tests/test_events.py`:

```python
from backend.app.core.events import EventType, event


def test_event_envelope_is_uniform():
    e = event(EventType.NEW_MESSAGE, {"id": "m1"}, org_slug="northside-health")
    assert e == {"type": "NEW_MESSAGE", "payload": {"id": "m1"}, "orgSlug": "northside-health"}


def test_target_user_and_empty_org():
    e = event(EventType.MEMBER_REMOVED, {"roomId": "r"}, target_user_id="usr-mike")
    assert e["targetUserId"] == "usr-mike" and "orgSlug" not in e
    assert EventType.TYPING_UPDATE.value == "TYPING_UPDATE"
```

- [ ] **Step 2: Verify fail**

Run: `npm test 2>&1 | grep test_events`
Expected: FAIL — `No module named 'backend.app.core.events'`

- [ ] **Step 3: Implement**

`backend/app/core/events.py`:

```python
"""The ONLY place SSE event names and envelopes are defined."""
from enum import Enum
from typing import Any, Dict, Optional


class EventType(str, Enum):
    CONNECTED = "CONNECTED"
    NEW_MESSAGE = "NEW_MESSAGE"
    MESSAGES_READ = "MESSAGES_READ"
    STREAM_CHUNK = "STREAM_CHUNK"
    TYPING_UPDATE = "TYPING_UPDATE"
    PRESENCE_SYNC = "PRESENCE_SYNC"
    PRESENCE_UPDATE = "PRESENCE_UPDATE"
    ROOM_CREATED = "ROOM_CREATED"
    MEMBER_ADDED = "MEMBER_ADDED"
    MEMBER_REMOVED = "MEMBER_REMOVED"


def event(ev: EventType, payload: Any, org_slug: str = "", target_user_id: Optional[str] = None) -> Dict[str, Any]:
    e: Dict[str, Any] = {"type": ev.value, "payload": payload}
    if org_slug:
        e["orgSlug"] = org_slug
    if target_user_id:
        e["targetUserId"] = target_user_id
    return e
```

- [ ] **Step 4: Convert both stores**

`chat_store.py` — replace each `asyncio.create_task(self.broadcast_to_room(...))` dict with `event(EventType.X, payload, org_slug)`:
- `:382` `{"type": "ROOM_CREATED", ...}` → `event(EventType.ROOM_CREATED, new_room.model_dump(), org_slug)`
- `:394` → `event(EventType.MEMBER_ADDED, {...}, org_slug)`
- `:404` → `event(EventType.MEMBER_REMOVED, {"roomId": room_id, "userId": user_id}, org_slug, target_user_id=user_id)`
- `:446` → `event(EventType.NEW_MESSAGE, message.model_dump(), message.orgSlug)`
- `:473-487` MESSAGES_READ block → `event(EventType.MESSAGES_READ, {...existing payload...}, org_slug)`
- `:509-523` → `event(EventType.STREAM_CHUNK, {...}, org_slug)`
- `:543` → `event(EventType.PRESENCE_UPDATE, rec.model_dump(), org_slug)`
- `:588-598` → `event(EventType.TYPING_UPDATE, {"roomId": room_id, "typingUsers": active}, org_slug)`

`firestore_store.py` — same swap at `:183, :205, :220, :288, :308, :326, :342, :365`, and delete the now-redundant `relay_event["orgSlug"] = org_slug` lines in `_emit_room` (`:378-387`) since `event()` already embeds it:
```python
def _emit_room(self, room_id: str, org_slug: str, event_dict: dict, target_user_id: Optional[str] = None):
    payload = dict(event_dict.get("payload") or {})
    payload.setdefault("roomId", room_id)
    event_dict["payload"] = payload
    asyncio.create_task(self.broadcast_to_room(room_id, org_slug, event_dict, target_user_id=target_user_id))
    asyncio.create_task(self._publish_relay(event_dict))
```
(rename the parameter to `event_dict` to avoid shadowing the imported `event` function)

`routes_realtime.py:40-57` — CONNECTED and PRESENCE_SYNC payloads via `event(EventType.CONNECTED, {...}, user.orgSlug)` / `event(EventType.PRESENCE_SYNC, [m.model_dump() for m in online_members], user.orgSlug)`.

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: 21 passed

Run: `grep -rn '"type": "' backend/app | grep -v core/events.py`
Expected: empty

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: shared SSE event contract for both storage backends" && git push origin dev
```

---

### Task 3: `require_room_member` dependency — delete the 7 copy-pasted guards

**Files:**
- Create: `backend/app/api/dependencies.py`
- Modify: `backend/app/api/routes_rooms.py:44-48,56-60`, `backend/app/api/routes_messages.py:27-31,42-46,60-64,121-125`
- Test: existing suite (status codes are pinned by tenant-isolation tests)

**Interfaces:**
- Consumes: `get_request_context` from `auth.dependencies`, `chat_store`
- Produces: `require_room_member(room_id: str, context = Security(get_request_context)) -> Room` raising 404 (missing) / 403 (non-member). Routes keep `context: RequestContext = Depends(get_request_context)` and add `room: Room = Security(require_room_member)`.

- [ ] **Step 1: Write failing test**

`backend/tests/test_room_guard.py`:

```python
from fastapi.testclient import TestClient


def test_guard_blocks_same_org_non_member(client: TestClient, northside_headers):
    # Sarah creates a private room containing only herself.
    res = client.post("/api/rooms", headers=northside_headers,
                      json={"name": "solo", "description": "", "isPrivate": True, "memberIds": []})
    assert res.status_code == 201
    room_id = res.json()["id"]
    # Mike is in the same org but NOT a member of this room -> 403 via the shared guard.
    mike_headers = {"Authorization": "Bearer usr-mike"}
    res = client.get(f"/api/rooms/{room_id}/messages", headers=mike_headers)
    assert res.status_code == 403


def test_guard_404_for_missing_room(client: TestClient, northside_headers):
    res = client.get("/api/rooms/room-does-not-exist/messages", headers=northside_headers)
    assert res.status_code == 404


def test_guard_404_cross_tenant_room_id(client: TestClient, valley_headers):
    # Room IDs are org-scoped: a Valley user asking for a Northside room gets 404, not 403.
    res = client.get("/api/rooms/room-nor-001/messages", headers=valley_headers)
    assert res.status_code == 404
```

- [ ] **Step 2: Verify fail**

Run: `npm test 2>&1 | grep test_room_guard`
Expected: PASS already (inline guards exist) — this test pins behavior so the refactor can't change it. Suite shows 21 passed. Proceed.

- [ ] **Step 3: Implement dependency + convert routes**

`backend/app/api/dependencies.py`:

```python
from fastapi import HTTPException, Security
from ..auth.dependencies import get_request_context
from ..models.schemas import RequestContext, Room
from ..services.chat_store import chat_store


def require_room_member(
    room_id: str,
    context: RequestContext = Security(get_request_context),
) -> Room:
    room = chat_store.get_room_by_id(room_id, context.org_slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found or access denied.")
    if context.uid not in room.memberIds:
        raise HTTPException(status_code=403, detail="You are not a member of this room.")
    return room
```

Route conversion pattern (apply to all 7 sites; each handler gains one parameter and loses the two `if` blocks):

```python
from .dependencies import require_room_member

@router.get("/rooms/{room_id}/messages", response_model=List[Message])
async def get_messages(
    room_id: str,
    limit: int = Query(50, ge=1, le=100),
    before: Optional[str] = None,
    context: RequestContext = Depends(get_request_context),
    room: Room = Security(require_room_member),
):
    chat_store.mark_messages_as_read(room_id, context.org_slug, context.uid)
    return chat_store.get_messages(room_id, context.org_slug, limit=limit, before=before)
```

Sites: routes_messages `get_messages`, `mark_room_read`, `send_message`, `set_typing_status`; routes_rooms `get_room_details`, `get_room_members`. (routes_rooms `create_room` has no room_id; skip. routes_realtime is manual-token — handled in Task 5.) Note: `send_message`'s old 403 detail "You cannot send messages to this room." becomes the shared "You are not a member of this room." — acceptable, UI does not surface the string.

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: 24 passed (21 + 3 new)

Run: `grep -rn "memberIds" backend/app/api/routes_messages.py backend/app/api/routes_rooms.py`
Expected: no output (guard owns membership checks)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: shared require_room_member dependency replaces 7 inline guards" && git push origin dev
```

---

### Task 4: shared pure helpers — stop the two backends drifting

**Files:**
- Create: `backend/app/core/formatting.py`, `backend/app/core/memory_query.py`
- Modify: `backend/app/services/chat_store.py:345-349,368-371`, `backend/app/services/firestore_store.py:146-149,162-164,255-257`, `backend/app/services/memory_engine.py:39-114`, `backend/app/services/firestore_memory.py:55-116,119`, `backend/app/components` — none
- Test: `backend/tests/test_shared_helpers.py` + existing memory tests

**Interfaces:**
- Produces (exact signatures):
  - `formatting.room_snippet(sender_name: str, content: str, is_ai: bool) -> str`
  - `formatting.slugify_room_name(name: str) -> str`
  - `formatting.make_room_id(org_slug: str) -> str`
  - `memory_query.validate_flat_value(value: dict) -> Optional[str]` (error string or None)
  - `memory_query.memory_matches(memory: TeamMemory, q: str) -> bool`
- Decision applied here: Firestore idempotency key becomes room-scoped `sha256(f"{orgSlug}:{roomId}:{clientMessageId}")` to match in-memory `(orgSlug, roomId, clientMessageId)`. Marked with `# ponytail:`.

- [ ] **Step 1: Write failing tests**

`backend/tests/test_shared_helpers.py`:

```python
from backend.app.core.formatting import room_snippet, slugify_room_name, make_room_id
from backend.app.core.memory_query import validate_flat_value, memory_matches
from backend.app.models.schemas import TeamMemory


def test_snippet_matches_both_store_formats():
    assert room_snippet("Sarah Chen", "x" * 100, False) == f"Sarah Chen: {'x' * 45}..."
    assert room_snippet("", "y" * 100, True).startswith("Gemini: ")


def test_slugify_unifies_client_and_server_rules():
    assert slugify_room_name("Clinical Quality Review!") == "clinical-quality-review"
    assert slugify_room_name("  Risk Room  ") == "risk-room"


def test_room_id_prefix():
    rid = make_room_id("northside-health")
    assert rid.startswith("room-nor-") and len(rid) == len("room-nor-") + 12


def test_flat_value_validation_message_is_shared():
    assert "flat dictionary exactly one level deep" in validate_flat_value({"a": {"n": 1}})
    assert "must be a string, number, or boolean" in validate_flat_value({"a": [1]})
    assert validate_flat_value({"ok": "yes"}) is None


def test_memory_matches_shared():
    mem = TeamMemory(memory_id="M1", org_slug="o", key="diabetes_policy", value={"rule": "link CKD"},
                     created_by="e", created_at="2026-01-01T00:00:00Z", room="general")
    assert memory_matches(mem, "what is our diabetes policy?")
    assert not memory_matches(mem, "unrelated query entirely")
```

- [ ] **Step 2: Verify fail**

Run: `npm test 2>&1 | grep test_shared_helpers`
Expected: FAIL — `No module named 'backend.app.core.formatting'`

- [ ] **Step 3: Implement modules**

`backend/app/core/formatting.py`:

```python
import re
import uuid

from .constants import AI_SENDER_NAME, ROOM_SNIPPET_MAX_CHARS


def room_snippet(sender_name: str, content: str, is_ai: bool) -> str:
    prefix = AI_SENDER_NAME.removesuffix(" AI") if is_ai else sender_name
    return f"{prefix}: {content[:ROOM_SNIPPET_MAX_CHARS]}..."


def slugify_room_name(name: str) -> str:
    # ponytail: one regex is the canonical rule; frontend NewRoomModal keeps its own (deferred codegen)
    return re.sub(r"[^a-z0-9_-]+", "-", name.strip().lower()).strip("-")


def make_room_id(org_slug: str) -> str:
    return f"room-{org_slug[:3]}-{uuid.uuid4().hex[:12]}"
```

`backend/app/core/memory_query.py`:

```python
import json
from typing import Optional

from ..models.schemas import TeamMemory


def validate_flat_value(value: dict) -> Optional[str]:
    for k, v in value.items():
        if isinstance(v, (dict, list)):
            return (
                "Team memory violation: Value must be a flat dictionary exactly one level deep. "
                f'Nested object or array in key "{k}" is rejected.'
            )
        if not isinstance(v, (str, int, float, bool)):
            return (
                "Team memory violation: "
                f'Value in key "{k}" must be a string, number, or boolean. '
                f'Received type "{type(v).__name__}".'
            )
    return None


def memory_matches(memory: TeamMemory, q: str) -> bool:
    words = [w for w in q.split() if len(w) > 2]
    key = memory.key.lower()
    if key in q:
        return True
    value_text = json.dumps(memory.value).lower()
    return any(w in key or w in value_text for w in words)
```

- [ ] **Step 4: Rewire both backends to the helpers**

`chat_store.py`:
- `:344-349` loop body → `r_copy.lastMessage = room_snippet(last_msg.senderName, last_msg.content, last_msg.isAi) if last_msg else None`
- `:368` → `clean_name = slugify_room_name(name)`
- `:371` → `id=make_room_id(org_slug),`

`firestore_store.py`:
- `:146-149` → `room.lastMessage = room_snippet(last.senderName, last.content, last.isAi)`
- `:162` → `id=make_room_id(org_slug),`
- `:164` → `name=slugify_room_name(name),`
- `:255-257` dedupe key → `key = hashlib.sha256(f"{message.orgSlug}:{message.roomId}:{message.clientMessageId}".encode("utf-8")).hexdigest()  # ponytail: room-scoped to match in-memory chat_store key`

`memory_engine.py` — recall branch (`:40-69`) becomes:
```python
q = (query or key or "").lower().strip()
org_mems = [m for m in self.memories if m.org_slug == org_slug]
if key:
    exact = next((m for m in org_mems if m.key.lower() == key.lower().strip()), None)
    if exact:
        return {"dataset_version": DATASET_VERSION, "org_slug": org_slug,
                "matched_key": exact.key, "memory": exact.model_dump()}
results = [m.model_dump() for m in org_mems if memory_matches(m, q)]
return {"dataset_version": DATASET_VERSION, "org_slug": org_slug, "query": query or key,
        "count": len(results), "memories": results,
        "isolation_note": f'Results strictly scoped to tenant "{org_slug}". Cross-tenant memories are completely isolated.'}
```
and the store branch replaces the inline loop with:
```python
error = validate_flat_value(value)
if error:
    return {"error": error}
```
(deleting the two inline `return {"error": ...}` blocks)

`firestore_memory.py` — identical swaps in `team_memory_tool` (`:55-94`): recall uses `memory_matches`, store uses `validate_flat_value`; keep its shorter `isolation_note` string as-is (cosmetic).

Delete the stray second singleton: `firestore_memory.py:119` (`memory_engine = FirestoreMemoryEngine()`) — the switch in `memory_engine.py:118-121` is the only instantiation path.

- [ ] **Step 5: Verify**

Run: `npm test`
Expected: 28 passed (`test_team_memory.py` still passes — error message preserved verbatim)

Run: `grep -n "json.dumps(m\|json.dumps(memory" backend/app/services/memory_engine.py backend/app/services/firestore_memory.py`
Expected: empty (recall matching lives only in `core/memory_query.py`)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: shared formatting/memory helpers; unify idempotency key (room-scoped)" && git push origin dev
```

---

### Task 5: auth boundary fixes — no private imports, no engine reach-through

**Files:**
- Modify: `backend/app/auth/dependencies.py:28,66-73`, `backend/app/api/routes_realtime.py:9-28`, `backend/app/api/routes_tools.py:22-26`, `backend/app/services/clinical_engine.py` (add one method), `backend/tests/test_production_boundaries.py` (3× rename)
- Test: `backend/tests/test_token_extraction.py`

**Interfaces:**
- Produces: `auth.dependencies.resolve_user_from_token(token: str) -> Optional[UserProfile]` (public), `auth.dependencies.token_from_request(request: Request, query_token: Optional[str] = None) -> Optional[str]` (order: Bearer header > `x-user-id` > query), `clinical_engine.get_patients_for_org(org_slug: str) -> List[Patient]`

- [ ] **Step 1: Write failing test**

`backend/tests/test_token_extraction.py`:

```python
from starlette.testclient import TestClient
from fastapi import Request
from backend.app.auth.dependencies import token_from_request
from backend.app.main import app


def _req(headers=None, query=""):
    scope = {"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
             "query_string": query.encode(), "method": "GET", "path": "/"}
    return Request(scope)


def test_bearer_wins_over_everything():
    r = _req({"authorization": "Bearer abc", "x-user-id": "usr-1"}, "token=q")
    assert token_from_request(r, "q") == "abc"


def test_x_user_id_then_query():
    assert token_from_request(_req({"x-user-id": "usr-1"})) == "usr-1"
    assert token_from_request(_req({}, "token=q"), "q") == "q"
    assert token_from_request(_req()) is None


def test_realtime_stream_accepts_bearer(client: TestClient, northside_headers):
    with client.stream("GET", "/api/events", headers=northside_headers) as res:
        assert res.status_code == 200
```

- [ ] **Step 2: Verify fail**

Run: `npm test 2>&1 | grep test_token_extraction`
Expected: FAIL — `ImportError: cannot import name 'token_from_request'`

- [ ] **Step 3: Implement**

`auth/dependencies.py`:
- Rename `def _resolve_user_from_token` → `def resolve_user_from_token` (`:28`); update the call at `:80` and the three references in `test_production_boundaries.py` (`dependencies._resolve_user_from_token` → `dependencies.resolve_user_from_token`).
- Add above `get_request_context`:

```python
def token_from_request(request: Request, query_token: Optional[str] = None) -> Optional[str]:
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    if "x-user-id" in request.headers:
        return request.headers.get("x-user-id")
    return query_token
```

- `get_request_context` `:66-73` becomes:
```python
token = None
if auth and auth.credentials:
    token = auth.credentials
if not token:
    token = token_from_request(request)
```

`routes_realtime.py:15-28` — replace the manual header parsing with:

```python
from ..auth.dependencies import resolve_user_from_token, token_from_request

@router.get("/events")
async def events_stream(request: Request, token: Optional[str] = None, roomId: Optional[str] = None):
    auth_token = token_from_request(request, token)
    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token required for real-time events.")
    user = await run_in_threadpool(resolve_user_from_token, auth_token)
```
(delete the `from ..auth.dependencies import _resolve_user_from_token` import and `:16-22`)

`clinical_engine.py` — add method to `ClinicalEngine` (after `lookup_condition_code`):

```python
def get_patients_for_org(self, org_slug: str) -> List[Patient]:
    return [p for p in self.patients if p.org_slug == org_slug]
```

`routes_tools.py:22-26` — replace:
```python
org_patients = [p.model_dump() for p in clinical_engine.patients if p.org_slug == context.org_slug]
```
with:
```python
org_patients = [p.model_dump() for p in clinical_engine.get_patients_for_org(context.org_slug)]
```

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: 32 passed (29 + 3 new)

Run: `grep -rn "_resolve_user_from_token\|clinical_engine.patients" backend/app backend/tests`
Expected: empty

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: public token-resolution API; realtime uses shared extraction; engine encapsulation" && git push origin dev
```

---

### Task 6: dead code deletion + internal dedup

**Files:**
- Modify: `backend/app/models/schemas.py:62,236-242` (delete `Room.aiPersona`, `GroundingRecord`), `src/types.ts:45` (delete `aiPersona`), `package.json:9,11` (delete `dev:python`, `test:python`), `backend/app/services/gemini_service.py:325-381` (dedup streaming loop)
- Test: existing suite + `tsc --noEmit`

**Interfaces:**
- Consumes: nothing new
- Produces: `_stream_response(client, model_name, contents, system_instruction, ai_message_id, room_id, org_slug, tool_calls)` (module-private helper in `gemini_service.py`)

- [ ] **Step 1: Prove dead code is dead**

Run: `grep -rn "GroundingRecord\|aiPersona" backend src`
Expected: only the definition lines (schemas.py:62, schemas.py:236, types.ts:45). If anything else appears, STOP and reassess.

- [ ] **Step 2: Delete**

- `schemas.py`: remove `aiPersona: Optional[str] = None` (`:62`) and the whole `GroundingRecord` class (`:236-242`)
- `types.ts:45`: remove `aiPersona?: string;`
- `package.json`: remove lines `"dev:python": ...` and `"test:python": ...` (keep valid JSON — drop trailing comma on the previous line)

- [ ] **Step 3: Dedup the streaming loop in gemini_service.py**

Add module-private helper after `execute_tool`:

```python
async def _stream_response(client, model_name, contents, system_instruction, ai_message_id, room_id, org_slug, tool_calls):
    stream = client.models.generate_content_stream(
        model=model_name,
        contents=contents,
        config=types.GenerateContentConfig(system_instruction=system_instruction, temperature=0.3),
    )
    for chunk in stream:
        text_chunk = chunk.text or ""
        if text_chunk:
            chat_store.update_streaming_message(ai_message_id, room_id, org_slug, text_chunk, False, tool_calls)
            await asyncio.sleep(0.02)
    chat_store.update_streaming_message(ai_message_id, room_id, org_slug, "", True, tool_calls)
```

Replace the tool-calls branch (`:325-354`) with:
```python
await _stream_response(client, model_name, followup_prompt, system_instruction,
                       ai_message_id, room_id, org_slug, tool_calls_executed)
```
and the no-tool branch (`:356-381`) with:
```python
await _stream_response(client, model_name, attributed_prompt, system_instruction,
                       ai_message_id, room_id, org_slug, [])
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint`
Expected: tests pass; tsc exits 0

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: delete dead symbols, dedup streaming loop, drop duplicate npm scripts" && git push origin dev
```

---

### Task 7: frontend `services/api.ts` — one fetch path, env-configured base URL

**Files:**
- Create: `src/services/api.ts`
- Modify: `src/context/ChatContext.tsx` (16 fetch sites + SSE origin `:218-229` + mention regex `:492`), `src/context/AuthContext.tsx` (6 sites + token registration), `src/components/TenantInspectorModal.tsx` (3), `src/components/RoomMembersModal.tsx` (2), `.env.example` (add `VITE_API_BASE_URL`)
- Test: `npm run lint` + manual smoke checklist

**Interfaces:**
- Produces (`src/services/api.ts`):
  - `setAuthToken(token: string | null): void`
  - `api(path: string, init?: RequestInit & { token?: string }): Promise<Response>` — sets `Authorization: Bearer <token ?? authToken>`, sets `Content-Type: application/json` when a body exists
  - `API_BASE: string` — `import.meta.env.VITE_API_BASE_URL ?? ''`

- [ ] **Step 1: Write the client**

`src/services/api.ts`:

```ts
export const API_BASE: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? '';

let authToken: string | null = null;

export const setAuthToken = (token: string | null): void => {
  authToken = token;
};

export async function api(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const bearer = init.token ?? authToken;
  const headers = new Headers(init.headers);
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const { token: _omit, ...rest } = init;
  return fetch(`${API_BASE}${path}`, { ...rest, headers });
}
```

- [ ] **Step 2: Register token in AuthContext**

- Top of `AuthProvider`: after `const [token, setToken] = useState...` add `useEffect(() => { setAuthToken(token); }, [token]);`
- In `fetchMe` success: `setToken(sessionToken)` already fires the effect. In `logout()`: `setToken(null)` — effect clears it. No other change.
- Replace all 6 fetch sites with `api('/api/orgs')`, `api('/api/auth/me')`, `api('/api/org/users')` (×2), `api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })`, `api('/api/presence', { method: 'POST', body: JSON.stringify({ isOnline: false }) })` — deleting the inline `headers: { Authorization: ... }` / `'Content-Type': ...` objects.

- [ ] **Step 3: Migrate ChatContext (16 sites) + SSE origin + mention regex**

Pattern per site — before:
```ts
const res = await fetch(`/api/rooms/${roomId}/messages`, {
  headers: { Authorization: `Bearer ${token}` },
});
```
after:
```ts
const res = await api(`/api/rooms/${roomId}/messages`);
```
(for POSTs keep `method`/`body`, drop both header entries; for `simulateCoParticipantMessage` pass `{ token: coUserId }`)

SSE block (`:218-229`) — replace the `isFirebaseHosting`/`sseOrigin` logic with:
```ts
const sseUrl = `${API_BASE}/api/events?token=${encodeURIComponent(token)}`;
```
(import `API_BASE` from `../services/api`; delete `:221-227`)

Mention-poll trigger (`:492`) — align with the backend predicate (`routes_messages.py:74-80`):
```ts
if (/@(gemini|ai)\b|\/(gemini|ai|ask)\b/i.test(content)) {
```
(`# ponytail: mirrors backend AI_MENTION regex; codegen would share it — deferred`)

- [ ] **Step 4: Migrate the two modals**

TenantInspectorModal (3 sites) and RoomMembersModal (2 sites): same swap — `api('/api/patients/...')`, `api('/api/memories?q=...')`, `api('/api/tools/calculate-raf', { method: 'POST', body: ... })`, `api(\`/api/rooms/${currentRoom.id}/members/${targetUserId}\`, { method: 'DELETE' })`, `api(\`/api/rooms/${currentRoom.id}/members\`, { method: 'POST', body: ... })`.

- [ ] **Step 5: Verify**

Run: `npm run lint`
Expected: exit 0

Run: `grep -rn "fetch(" src --include="*.ts" --include="*.tsx" | grep -v "src/services/api.ts"`
Expected: only the `fetch` inside `src/services/api.ts`

Manual smoke (dev servers: `npm run dev:backend` + `npm run dev`): login as Sarah → send message → `@Gemini` RAF question streams → second-tab presence/typing → create room → SSE reconnect toast on backend restart. (This exercises the tenant + realtime paths the tests don't cover.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: single frontend API client; env-configured API base; AI-trigger regex aligned with backend" && git push origin dev
```

---

### Task 8: demo accounts from one endpoint — kill the seed triplication

**Files:**
- Modify: `backend/app/services/chat_store.py` (add `get_all_users`), `backend/app/services/firestore_store.py` (override it), `backend/app/api/routes_auth.py` (add endpoint), `src/components/LoginPage.tsx` (delete `testAccounts`, fetch instead), `src/context/AuthContext.tsx` (`switchOrganization`), `src/components/ChatArea.tsx:126-133` (hash-based avatar colors)
- Test: `backend/tests/test_demo_accounts.py`

**Interfaces:**
- Produces: `GET /api/demo/accounts` → `200 [{email, name, role, orgSlug, title}]` in demo mode; `404 {"detail": "Demo accounts are only available in demo mode."}` when `FIREBASE_PROJECT_ID` is set. `chat_store.get_all_users() -> List[UserProfile]`.

- [ ] **Step 1: Write failing test**

`backend/tests/test_demo_accounts.py`:

```python
from fastapi.testclient import TestClient


def test_demo_accounts_listed_in_demo_mode(client: TestClient):
    res = client.get("/api/demo/accounts")
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) == 10
    assert {"email", "name", "role", "orgSlug", "title"} == set(accounts[0].keys())
    assert "password" not in accounts[0]
```

- [ ] **Step 2: Verify fail**

Run: `npm test 2>&1 | grep test_demo_accounts`
Expected: FAIL — 404 Not Found

- [ ] **Step 3: Implement backend**

`chat_store.py` (ChatStore, near the other user queries):
```python
def get_all_users(self) -> List[UserProfile]:
    return self.users
```

`firestore_store.py` (override — identity cache may be partial):
```python
def get_all_users(self) -> List[UserProfile]:
    users: List[UserProfile] = []
    for org in self.get_organizations():
        users.extend(self.get_users_by_org(org.slug))
    return users
```

`routes_auth.py` (after `get_org_users`):
```python
@router.get("/demo/accounts")
async def get_demo_accounts():
    # Demo-mode only: evaluation login list. Firebase mode has no seed accounts to expose.
    if settings.FIREBASE_PROJECT_ID:
        raise HTTPException(status_code=404, detail="Demo accounts are only available in demo mode.")
    return [
        {"email": u.email, "name": u.name, "role": u.role, "orgSlug": u.orgSlug, "title": u.title}
        for u in chat_store.get_all_users()
    ]
```

- [ ] **Step 4: Rewire the frontend**

`LoginPage.tsx` — replace the `testAccounts` array (`:33-98`) and add:
```tsx
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

interface DemoAccount { email: string; name: string; role: string; orgSlug: string; title?: string; }
// ...inside the component:
const [testAccounts, setTestAccounts] = useState<DemoAccount[]>([]);
useEffect(() => {
  api('/api/demo/accounts').then((r) => (r.ok ? r.json() : [])).then(setTestAccounts).catch(() => {});
}, []);
```
Keep the render loop as-is (it only uses `email/name/role/org`; the `badgeColor` field dies with the array — inline a two-branch class: `orgSlug === 'valley-primary-care' ? emerald classes : indigo classes`).

`AuthContext.tsx` `switchOrganization` — replace `:162-167` (hardcoded emails) with:
```ts
const res = await api('/api/demo/accounts');
if (!res.ok) return;
const accounts: { email: string; orgSlug: string; role: string }[] = await res.json();
const admin = accounts.find((a) => a.orgSlug === orgSlug && a.role === 'admin') ??
              accounts.find((a) => a.orgSlug === orgSlug);
if (admin) await login(admin.email, 'password123');
```

`ChatArea.tsx:126-133` — replace ID-sniffing `getAvatarColor` with a stable hash (same export signature):
```tsx
const AVATAR_COLORS = ['bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-emerald-600', 'bg-amber-500', 'bg-cyan-600'];

export const getAvatarColor = (id?: string) => {
  if (!id) return 'bg-indigo-500';
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run lint`
Expected: 33 passed; tsc exit 0

Run: `grep -rn "northside-health.test" src`
Expected: empty (README keeps its table — docs, not code)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: demo accounts served by API; remove frontend seed triplication and ID-sniffing avatars" && git push origin dev
```

---

### Task 9: `logging` replaces `print`

**Files:**
- Modify: `backend/app/services/gemini_service.py` (7 prints: :54, :57, :65, :68, :70, :387, :391), `backend/app/auth/firebase.py` (4: :37, :40, :43, :62, :78), `backend/app/services/firestore_store.py:376`, `backend/app/services/event_broker.py:79`, `backend/app/main.py` (add `logging.basicConfig` in lifespan)
- Test: existing suite

**Interfaces:**
- Produces: module loggers `logger = logging.getLogger(__name__)`; messages keep their existing text/level semantics.

- [ ] **Step 1: Mechanical swap**

Per file add `import logging` + `logger = logging.getLogger(__name__)`, then:
- `print(f"[Gemini] ...")` → `logger.info(...)` / `logger.warning(...)` for failure lines (init failures `:57, :68`, model failures `:387, :391`, relay failure in event_broker, firebase failures `:40, :43, :62, :78`)
- Informational lines (init success, mode selection) → `logger.info(...)`
- Strip the `[Gemini]`/`[Firebase]`/`[Realtime]` prefixes — the logger name carries that context.

`main.py` — in `lifespan`, before the checks:
```python
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
```

- [ ] **Step 2: Verify**

Run: `npm test`
Expected: 33 passed

Run: `grep -rn "print(" backend/app | grep -v "core\|__main__"`
Expected: empty

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: structured logging replaces print statements" && git push origin dev
```

---

## Final verification (end of plan)

1. `npm test` → all tests pass (17 baseline + 16 new = 33)
2. `npm run lint` → exit 0
3. `grep -rn '12000\|password123\|%Y-%m-%dT%H\|gemini-ai\|MY_GEMINI_API_KEY' backend/app | grep -v core/constants.py` → empty
4. `grep -rn "fetch(" src | grep -v services/api.ts` → empty
5. `grep -rn "_resolve_user_from_token\|clinical_engine.patients" backend` → empty
6. Manual smoke: login → chat → @Gemini streaming → presence/typing → room create/members → inspector RAF calc
7. Merge decision: PR `dev` → `main` (or keep dev as integration branch per team workflow)
