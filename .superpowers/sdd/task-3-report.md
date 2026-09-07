# Task 3 Report: `require_room_member` shared dependency

**Status:** DONE_WITH_CONCERNS
**Branch:** `dev` · **Commit:** `756d314` · **Pushed:** yes (origin/dev)
**Tests:** 25 passed, 2 warnings (baseline 22 + 3 new guard tests)

## Per-file changes

### Created: `backend/app/api/dependencies.py`
New module, verbatim from the brief: exports `require_room_member(room_id: str, context: RequestContext = Security(get_request_context)) -> Room`. Raises `404` ("Room not found or access denied.") for missing/cross-tenant rooms, `403` ("You are not a member of this room.") for same-org non-members.

### Created: `backend/tests/test_room_guard.py`
The brief's three tests, verbatim:
- `test_guard_blocks_same_org_non_member` — Sarah creates a private solo room; Mike (same org, not a member) gets 403 on GET messages.
- `test_guard_404_for_missing_room` — nonexistent room id → 404.
- `test_guard_404_cross_tenant_room_id` — Valley user (`usr-elena`) requesting Northside `room-nor-001` → 404 (org-scoped id lookup).

### Modified: `backend/app/api/routes_messages.py`
- Import: added `Security` to the fastapi import, `Room` to the schemas import, `from .dependencies import require_room_member`.
- **4 guard sites deleted** (6 lines each = lookup + 404-if + 403-if), replaced by one signature parameter `room: Room = Security(require_room_member)` on:
  - `get_messages` — body unchanged (`mark_messages_as_read` + `get_messages`).
  - `mark_room_read` — body unchanged.
  - `send_message` — body unchanged; **403 detail changed** from "You cannot send messages to this room." to the shared "You are not a member of this room." (explicitly sanctioned by the brief; status code unchanged).
  - `set_typing_status` — body unchanged.
- `HTTPException` import still needed (400 empty-content, 401 invalid session user); no dead imports left.

### Modified: `backend/app/api/routes_rooms.py`
- Import: added `Security`, `from .dependencies import require_room_member`.
- **2 guard sites deleted**, same conversion pattern:
  - `get_room_details` — now `return room` (room supplied by the dependency).
  - `get_room_members` — body now just builds the member list from `room.memberIds`.

## Red/green step evidence

**Step 2 (before refactor, after adding tests):** the three new tests PASSED immediately, as the brief predicted — they pin the existing inline guards, not a bug fix. Suite: **25 passed** (22 baseline + 3).

```
backend/tests/test_room_guard.py::test_guard_blocks_same_org_non_member PASSED [ 72%]
backend/tests/test_room_guard.py::test_guard_404_for_missing_room PASSED [ 76%]
backend/tests/test_room_guard.py::test_guard_404_cross_tenant_room_id PASSED [ 80%]
======================== 25 passed, 2 warnings in 0.07s ========================
```

**Step 4 (after refactor):** identical result — no behavior drift.

```
backend/tests/test_room_guard.py::test_guard_blocks_same_org_non_member PASSED [ 72%]
backend/tests/test_room_guard.py::test_guard_404_for_missing_room PASSED [ 76%]
backend/tests/test_room_guard.py::test_guard_404_cross_tenant_room_id PASSED [ 80%]
======================== 25 passed, 2 warnings in 0.06s ========================
```

**Grep check (`memberIds` in api routes):**
- `routes_messages.py`: **zero matches** — guard owns membership checks there, as specified.
- `routes_rooms.py`: 3 matches remain (see Concerns — all non-guard).

**Excluded per brief:** `routes_realtime.py` manual-token guard untouched (Task 5); `create_room` untouched (no room_id).

## Self-review

- **Status codes pinned:** 404/403/400/401 all unchanged; tenant-isolation suite (`test_tenant_isolation.py`, `test_production_boundaries.py`) passes unmodified.
- **Auth semantics unchanged:** `Security(require_room_member)` nests `Security(get_request_context)`; FastAPI's dependency cache means auth resolves once per request, same as the old inline pattern. `context: RequestContext = Depends(get_request_context)` kept on every handler per the brief.
- **OpenAPI contract:** the dependency does not add request parameters; no schema change.
- **Diff minimality:** 4 files, +51/−35; no comments added; no frontend WIP staged.
- **Count discrepancy handled:** brief prose says "7 guards"; its own Sites list names **6** conversion sites (4 messages + 2 rooms) and explicitly defers the 7th (routes_realtime) to Task 5. Converted exactly the 6 listed. Brief's step-2/step-4 expected counts (21/24) were superseded by the actual baseline (22) per task context; final 25 matches the stated expectation.

## Concerns

1. **Brief's grep expectation unachievable for `routes_rooms.py`:** 3 legitimate non-guard `memberIds` uses remain: `get_rooms` list filter (response semantics — filtering the room list by membership is not an access guard; converting it would change GET /rooms behavior), `create_room`'s `req.memberIds` (request DTO field), and `get_room_members`' member-list construction (must read `room.memberIds` to build its response). The invariant that matters — no route handler performs its own room-access guard — holds in both files.
2. Minor: brief prose "7 guards" vs. 6 listed conversion sites (7th = routes_realtime, deliberately deferred). No action needed; flagging for Task 5 planning.
