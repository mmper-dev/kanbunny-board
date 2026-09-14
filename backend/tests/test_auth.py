from __future__ import annotations

import bcrypt
import pytest
from fastapi.testclient import TestClient

from app.auth import hash_password, users, verify_password
from tests.conftest import SEED_PASSWORD, SEED_USERNAME

PROTECTED = [
    ("get", "/api/tasks"),
    ("post", "/api/tasks"),
    ("patch", "/api/tasks/T-1"),
    ("delete", "/api/tasks/T-1"),
    ("get", "/api/projects"),
    ("post", "/api/projects"),
    ("patch", "/api/projects/P-1"),
    ("delete", "/api/projects/P-1"),
    ("post", "/api/tasks/T-1/subtasks"),
    ("patch", "/api/tasks/T-1/subtasks/S-1"),
    ("delete", "/api/tasks/T-1/subtasks/S-1"),
    ("get", "/api/auth/me"),
]


class TestPasswordHashing:
    def test_hash_is_not_the_password(self):
        digest = hash_password("carrots123")
        assert b"carrots123" not in digest
        assert digest.startswith(b"$2b$")

    def test_verifies_the_right_password(self):
        assert verify_password("carrots123", hash_password("carrots123"))

    def test_rejects_the_wrong_password(self):
        assert not verify_password("carrots124", hash_password("carrots123"))

    def test_salted_so_equal_passwords_hash_differently(self):
        assert hash_password("same") != hash_password("same")

    def test_a_corrupt_hash_reads_as_wrong_password(self):
        # Must not surface as a 500 to the caller.
        assert not verify_password("carrots123", b"not-a-bcrypt-hash")

    def test_stored_seed_password_is_hashed(self):
        user = users.by_username(SEED_USERNAME)
        assert user is not None
        assert user.password_hash != SEED_PASSWORD.encode()
        assert bcrypt.checkpw(SEED_PASSWORD.encode(), user.password_hash)


class TestLogin:
    def test_returns_a_bearer_token(self, client: TestClient):
        response = client.post(
            "/api/auth/login", json={"username": SEED_USERNAME, "password": SEED_PASSWORD}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["tokenType"] == "bearer"
        assert body["expiresIn"] > 0
        assert body["accessToken"].count(".") == 2  # a JWT

    def test_is_public(self, client: TestClient):
        assert client.post(
            "/api/auth/login", json={"username": SEED_USERNAME, "password": SEED_PASSWORD}
        ).status_code == 200

    def test_wrong_password_is_401(self, client: TestClient):
        response = client.post(
            "/api/auth/login", json={"username": SEED_USERNAME, "password": "wrong"}
        )
        assert response.status_code == 401
        assert response.json()["code"] == "unauthorized"

    def test_unknown_user_is_indistinguishable_from_a_wrong_password(self, client: TestClient):
        missing = client.post(
            "/api/auth/login", json={"username": "nobody", "password": "wrong"}
        )
        wrong = client.post(
            "/api/auth/login", json={"username": SEED_USERNAME, "password": "wrong"}
        )
        assert missing.status_code == wrong.status_code == 401
        assert missing.json() == wrong.json()

    def test_username_is_case_insensitive(self, client: TestClient):
        response = client.post(
            "/api/auth/login",
            json={"username": SEED_USERNAME.upper(), "password": SEED_PASSWORD},
        )
        assert response.status_code == 200


class TestProtectedEndpoints:
    @staticmethod
    def _call(client: TestClient, method: str, path: str, **kwargs):
        # TestClient.get()/.delete() take no `json`, so go through .request() uniformly.
        body = {} if method in {"post", "patch", "put"} else None
        return client.request(method.upper(), path, json=body, **kwargs)

    @pytest.mark.parametrize("method,path", PROTECTED)
    def test_rejects_a_missing_token(self, client: TestClient, method: str, path: str):
        response = self._call(client, method, path)
        assert response.status_code == 401
        body = response.json()
        assert body["code"] == "unauthorized"
        assert body["message"]

    @pytest.mark.parametrize("method,path", PROTECTED)
    def test_rejects_a_garbage_token(self, client: TestClient, method: str, path: str):
        response = self._call(
            client, method, path, headers={"Authorization": "Bearer not-a-jwt"}
        )
        assert response.status_code == 401

    def test_rejects_a_token_signed_with_another_key(self, client: TestClient):
        import jwt

        forged = jwt.encode({"sub": "U-1"}, "some-other-secret", algorithm="HS256")
        response = client.get("/api/tasks", headers={"Authorization": f"Bearer {forged}"})
        assert response.status_code == 401

    def test_rejects_an_expired_token(self, client: TestClient):
        import jwt

        from app.config import settings

        expired = jwt.encode(
            {"sub": "U-1", "exp": 1_000_000_000}, settings.secret_key, algorithm=settings.algorithm
        )
        response = client.get("/api/tasks", headers={"Authorization": f"Bearer {expired}"})
        assert response.status_code == 401
        assert "expired" in response.json()["message"].lower()

    def test_rejects_a_valid_token_for_a_deleted_account(self, client: TestClient, auth):
        users.reset()
        response = client.get("/api/tasks", headers=auth)
        assert response.status_code == 401

    def test_accepts_a_good_token(self, client: TestClient, auth):
        assert client.get("/api/tasks", headers=auth).status_code == 200

    def test_401_carries_a_www_authenticate_header(self, client: TestClient):
        response = client.get("/api/tasks")
        assert response.headers.get("WWW-Authenticate") == "Bearer"


class TestHealth:
    def test_is_public(self, client: TestClient):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


class TestCurrentUser:
    def test_reports_the_token_owner(self, client: TestClient, auth):
        response = client.get("/api/auth/me", headers=auth)
        assert response.status_code == 200
        assert response.json()["username"] == SEED_USERNAME

    def test_never_leaks_the_password_hash(self, client: TestClient, auth):
        assert set(client.get("/api/auth/me", headers=auth).json()) == {"id", "username"}


class TestDataIsolation:
    def test_one_user_cannot_see_another_board(self, client: TestClient):
        users.create("otto", "acorns123")
        response = client.post("/api/auth/login", json={"username": "otto", "password": "acorns123"})
        other = {"Authorization": f"Bearer {response.json()['accessToken']}"}

        assert client.get("/api/tasks", headers=other).json() == []

    def test_one_user_cannot_touch_another_task(self, client: TestClient):
        users.create("otto", "acorns123")
        response = client.post("/api/auth/login", json={"username": "otto", "password": "acorns123"})
        other = {"Authorization": f"Bearer {response.json()['accessToken']}"}

        # 404 rather than 403: the API must not confirm that T-1 exists to someone who cannot see it.
        assert client.patch("/api/tasks/T-1", json={"points": 1}, headers=other).status_code == 404
