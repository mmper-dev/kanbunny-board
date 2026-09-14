"""Test fixtures.

Every behaviour test runs **twice**: once against the in-memory store and once against SQLite. The
two implementations have to agree, and running the same assertions over both is what enforces
"database-agnostic" rather than just claiming it.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import STORE_DATABASE, STORE_MEMORY, Settings
from app.main import create_app
from app.seed import seed_demo_user
from app.store import configure

SEED_USERNAME = "mila"
SEED_PASSWORD = "carrots123"


@pytest.fixture(params=[STORE_MEMORY, STORE_DATABASE], ids=["memory", "sqlite"])
def store_mode(request) -> str:
    return request.param


@pytest.fixture(autouse=True)
def fresh_state(store_mode: str):
    """A clean board per test.

    SQLite runs in memory with a shared pool, so each test gets its own empty database rather than
    a file that accumulates state between runs.
    """
    # Only the storage fields matter here — token signing reads the process-wide settings.
    settings = Settings(
        store=store_mode,
        database_url="sqlite://",
        secret_key="test-secret-key-that-is-long-enough-32",
        seed_demo=True,
    )
    stores = configure(settings)
    seed_demo_user(SEED_USERNAME, SEED_PASSWORD)
    yield
    stores.boards.clear()
    stores.users.clear()


@pytest.fixture
def client() -> TestClient:
    # raise_server_exceptions=False so an unhandled error surfaces as a 500 response, the way a
    # real client would see it, rather than blowing up inside the test.
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
