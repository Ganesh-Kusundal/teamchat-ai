import pytest
from backend.app.services.clinical_engine import clinical_engine

def test_raf_calculation_exact_order():
    # Test 75yo female non-dual with Heart Failure I50.32 (HCC 226) and Diabetes E11.22 (HCC 36)
    result = clinical_engine.calculate_risk_score(
        org_slug="northside-health",
        icd10_codes=["I50.32", "E11.22"],
        sex="F",
        age=75,
        model_segment="community_nondual_aged",
        base_rate=12000.0,
    )

    assert "raf_total" in result
    assert result["dataset_version"] == "teamchat-seed-2026.1"
    assert result["demographic_coefficient"] == 0.508  # Female 75-79 non-dual from demographic_coefficients.csv
    assert len(result["mapped_conditions"]) == 2
    assert result["hcc_coefficient_sum"] > 0
    assert result["estimated_annual_payment"] == round(result["raf_total"] * 12000.0)

def test_raf_hierarchy_supersession():
    # HCC 36 (Diabetes with Chronic Complications, E11.22) supersedes HCC 37 (Unspecified Diabetes, E11.9)
    result = clinical_engine.calculate_risk_score(
        org_slug="northside-health",
        icd10_codes=["E11.22", "E11.9"],
        sex="F",
        age=75,
        model_segment="community_nondual_aged",
        base_rate=12000.0,
    )

    mapped = result["mapped_conditions"]
    # HCC 36 must be active with positive coefficient
    hcc36 = next((m for m in mapped if m["hcc_code"] == "36"), None)
    assert hcc36 is not None
    assert not hcc36["is_superseded"]
    assert hcc36["final_coefficient"] == 0.166

    # HCC 37 must be superseded and have 0.0 final coefficient
    hcc37 = next((m for m in mapped if m["hcc_code"] == "37"), None)
    assert hcc37 is not None
    assert hcc37["is_superseded"] is True
    assert hcc37["final_coefficient"] == 0.0
    assert "HCC 36" in hcc37["superseded_by"]

def test_unmapped_condition_codes():
    # I10 (Essential hypertension) does not map to CMS-HCC V28
    result = clinical_engine.calculate_risk_score(
        org_slug="northside-health",
        icd10_codes=["I10", "E78.5"],
        sex="F",
        age=75,
        model_segment="community_nondual_aged",
        base_rate=12000.0,
    )

    assert len(result["mapped_conditions"]) == 0
    assert len(result["unmapped_conditions"]) == 2
    assert result["hcc_coefficient_sum"] == 0.0
    assert result["raf_total"] == result["demographic_coefficient"]
