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
    assert "must be a string, number, or boolean" in validate_flat_value({"a": None})
    assert validate_flat_value({"ok": "yes"}) is None


def test_memory_matches_shared():
    mem = TeamMemory(memory_id="M1", org_slug="o", key="diabetes_policy", value={"rule": "link CKD"},
                     created_by="e", created_at="2026-01-01T00:00:00Z", room="general")
    assert memory_matches(mem, "what is our diabetes policy?")
    assert not memory_matches(mem, "unrelated query entirely")
