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

