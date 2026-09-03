import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.chat_store import chat_store
from backend.app.services.memory_engine import memory_engine

@pytest.fixture(autouse=True)
def reset_store_state():
    chat_store.reset_to_seed()
    memory_engine.reset_to_seed()
    yield

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def northside_headers():
    return {"Authorization": "Bearer usr-sarah"}

@pytest.fixture
def valley_headers():
    return {"Authorization": "Bearer usr-elena"}
