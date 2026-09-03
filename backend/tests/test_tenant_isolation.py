import pytest
from fastapi.testclient import TestClient
from backend.app.services.clinical_engine import clinical_engine
from backend.app.services.memory_engine import memory_engine

def test_patient_cross_tenant_isolation_api(client: TestClient, northside_headers, valley_headers):
    # Northside user requesting Northside patient PT-4001 -> Success
    res = client.get("/api/patients/PT-4001", headers=northside_headers)
    assert res.status_code == 200
    data = res.json()
    assert "patient" in data
    assert data["patient"]["patient_id"] == "PT-4001"
    assert data["patient"]["org_slug"] == "northside-health"

    # Northside user attempting to access Valley patient PT-4013 -> Blocked with error
    res_cross = client.get("/api/patients/PT-4013", headers=northside_headers)
    assert res_cross.status_code == 200
    data_cross = res_cross.json()
    assert "error" in data_cross
    assert "Strict Tenant Isolation Enforced" in data_cross["error"]

    # Valley user accessing Valley patient PT-4013 -> Success
    res_val = client.get("/api/patients/PT-4013", headers=valley_headers)
    assert res_val.status_code == 200
    data_val = res_val.json()
    assert "patient" in data_val
    assert data_val["patient"]["patient_id"] == "PT-4013"
    assert data_val["patient"]["org_slug"] == "valley-primary-care"

def test_room_tenant_isolation(client: TestClient, northside_headers, valley_headers):
    # Northside user gets only Northside rooms
    res = client.get("/api/rooms", headers=northside_headers)
    assert res.status_code == 200
    rooms = res.json()
    assert len(rooms) > 0
    assert all(r["orgSlug"] == "northside-health" for r in rooms)

    # Valley user gets only Valley rooms
    res_val = client.get("/api/rooms", headers=valley_headers)
    assert res_val.status_code == 200
    rooms_val = res_val.json()
    assert len(rooms_val) > 0
    assert all(r["orgSlug"] == "valley-primary-care" for r in rooms_val)

def test_shared_memory_key_isolation(client: TestClient, northside_headers, valley_headers):
    # Shared key 'q1_recapture_target' must return 92% for Northside and 85% for Valley
    res_nor = client.get("/api/memories?q=q1_recapture_target", headers=northside_headers)
    assert res_nor.status_code == 200
    data_nor = res_nor.json()
    assert len(data_nor["memories"]) >= 1
    assert data_nor["memories"][0]["value"]["target_rate"] == "92%"

    res_val = client.get("/api/memories?q=q1_recapture_target", headers=valley_headers)
    assert res_val.status_code == 200
    data_val = res_val.json()
    assert len(data_val["memories"]) >= 1
    assert data_val["memories"][0]["value"]["target_rate"] == "85%"
