from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.auth import users
from app.main import create_app
from app.seed import seed_demo_user
from app.store import store

SEED_USERNAME = "mila"
SEED_PASSWORD = "carrots123"


@pytest.fixture(autouse=True)
def fresh_state():
    """The store and user directory are module-level singletons, so every test starts from a
    known board rather than inheriting whatever the last one left behind."""
    store.reset()
    users.reset()
    seed_demo_user(SEED_USERNAME, SEED_PASSWORD)
    yield
    store.reset()
    users.reset()


@pytest.fixture
def client() -> TestClient:
    # raise_server_exceptions=False so an unhandled error surfaces as a 500 response, the way a
    # real client would see it, instead of blowing up inside the test.
    return TestClient(create_app(), raise_server_exceptions=False)


@pytest.fixture
def token(client: TestClient) -> str:
    response = client.post(
        "/api/auth/login", json={"username": SEED_USERNAME, "password": SEED_PASSWORD}
    )
    assert response.status_code == 200, response.text
    return response.json()["accessToken"]


@pytest.fixture
def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
