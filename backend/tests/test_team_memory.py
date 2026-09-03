import pytest
from backend.app.services.memory_engine import memory_engine

def test_semantic_memory_recall():
    # "linking diabetes to kidney disease" should retrieve 'diabetes_documentation_policy'
    res = memory_engine.team_memory_tool(
        org_slug="northside-health",
        action="recall",
        query="what did we agree about linking diabetes to kidney disease?",
    )
    assert res["count"] >= 1
    matched_keys = [m["key"] for m in res["memories"]]
    assert "diabetes_documentation_policy" in matched_keys

def test_flat_dictionary_validation():
    # Storing flat dict -> Success
    valid_res = memory_engine.team_memory_tool(
        org_slug="northside-health",
        action="store",
        key="test_policy",
        value={"approved": True, "lead": "Sarah", "target": 95},
    )
    assert valid_res.get("success") is True

    # Storing nested dict -> Rejected
    nested_res = memory_engine.team_memory_tool(
        org_slug="northside-health",
        action="store",
        key="invalid_nested_policy",
        value={"rule": {"nested": "value"}},
    )
    assert "error" in nested_res
    assert "flat dictionary exactly one level deep" in nested_res["error"]

    # Storing array -> Rejected
    array_res = memory_engine.team_memory_tool(
        org_slug="northside-health",
        action="store",
        key="invalid_array_policy",
        value={"list": [1, 2, 3]},
    )
    assert "error" in array_res
