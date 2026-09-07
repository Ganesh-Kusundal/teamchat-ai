from backend.app.core.events import EventType, event


def test_event_envelope_is_uniform():
    e = event(EventType.NEW_MESSAGE, {"id": "m1"}, org_slug="northside-health")
    assert e == {"type": "NEW_MESSAGE", "payload": {"id": "m1"}, "orgSlug": "northside-health"}


def test_target_user_and_empty_org():
    e = event(EventType.MEMBER_REMOVED, {"roomId": "r"}, target_user_id="usr-mike")
    assert e["targetUserId"] == "usr-mike" and "orgSlug" not in e
    assert EventType.TYPING_UPDATE.value == "TYPING_UPDATE"
