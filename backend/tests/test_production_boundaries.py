from backend.app.auth import dependencies
from backend.app.config import settings
from backend.app.main import app
from fastapi.testclient import TestClient


def test_firebase_mode_rejects_demo_tokens(monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(dependencies, "verify_firebase_token", lambda _token: None)

    assert dependencies.resolve_user_from_token("usr-sarah") is None


def test_firebase_claim_requires_tenant(monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(
        dependencies,
        "verify_firebase_token",
        lambda _token: {"uid": "firebase-sarah", "email": "sarah@northside-health.test"},
    )

    assert dependencies.resolve_user_from_token("firebase-token") is None


def test_firebase_claim_must_match_provisioned_tenant(monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_PROJECT_ID", "test-project")
    monkeypatch.setattr(
        dependencies,
        "verify_firebase_token",
        lambda _token: {
            "uid": "firebase-sarah",
            "email": "sarah@northside-health.test",
            "orgId": "valley-primary-care",
        },
    )

    assert dependencies.resolve_user_from_token("firebase-token") is None


def test_org_metadata_requires_authentication(client):
    response = client.get("/api/orgs")
    assert response.status_code == 401


def test_org_metadata_is_tenant_scoped(client, northside_headers):
    response = client.get("/api/orgs", headers=northside_headers)
    assert response.status_code == 200
    assert [org["slug"] for org in response.json()] == ["northside-health"]


def test_health_exposes_runtime_modes(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["authMode"] == "demo"
    assert body["storageBackend"] == "memory"
    assert body["dataset_version"] == settings.VERSION
