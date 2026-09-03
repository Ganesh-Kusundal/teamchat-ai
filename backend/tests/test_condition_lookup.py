import pytest
from backend.app.services.clinical_engine import clinical_engine

def test_dotted_and_undotted_lookup():
    # Dotted
    res_dotted = clinical_engine.lookup_condition_code("I50.32")
    assert "code" in res_dotted
    assert res_dotted["code"] == "I50.32"
    assert res_dotted["maps_to_hcc"] is True
    assert res_dotted["hcc_v28_code"] == "226"

    # Undotted
    res_undotted = clinical_engine.lookup_condition_code("I5032")
    assert "code" in res_undotted
    assert res_undotted["code"] == "I50.32"
    assert res_undotted["maps_to_hcc"] is True

def test_unmapped_code_reported_explicitly():
    # I10 is in dataset and explicitly does NOT map to an HCC
    res_i10 = clinical_engine.lookup_condition_code("I10")
    assert "code" in res_i10
    assert res_i10["code"] == "I10"
    assert res_i10["maps_to_hcc"] is False
    assert res_i10["hcc_v28_code"] is None
    assert "Does not map" in res_i10["hcc_v28_label"]

def test_keyword_fuzzy_search():
    res_search = clinical_engine.lookup_condition_code("heart failure")
    assert res_search.get("matched_count", 0) > 0
    assert len(res_search["results"]) > 0
