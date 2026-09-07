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

