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

