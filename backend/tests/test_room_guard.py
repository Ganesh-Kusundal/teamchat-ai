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
