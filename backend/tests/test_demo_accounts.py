from fastapi.testclient import TestClient


def test_demo_accounts_listed_in_demo_mode(client: TestClient):
    res = client.get("/api/demo/accounts")
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) == 10
    assert {"email", "name", "role", "orgSlug", "title"} == set(accounts[0].keys())
    assert "password" not in accounts[0]
