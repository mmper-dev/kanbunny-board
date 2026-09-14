from __future__ import annotations

from fastapi.testclient import TestClient

SUBTASK = {"title": "Draft ERD", "status": "todo", "assignee": "Mila"}


class TestProjects:
    def test_lists_the_seeded_projects(self, client: TestClient, auth):
        projects = client.get("/api/projects", headers=auth).json()
        assert [p["id"] for p in projects] == ["P-1", "P-2"]
        assert projects[0]["hue"] == 24

    def test_creates_with_a_server_assigned_hue(self, client: TestClient, auth):
        response = client.post("/api/projects", json={"name": "Warren Infra"}, headers=auth)
        assert response.status_code == 201
        body = response.json()
        assert body["id"] == "P-3"
        assert 0 <= body["hue"] <= 359

    def test_client_cannot_choose_the_hue(self, client: TestClient, auth):
        # extra="forbid": sending an unknown field is a mistake worth surfacing.
        response = client.post(
            "/api/projects", json={"name": "Warren Infra", "hue": 200}, headers=auth
        )
        assert response.status_code == 422

    def test_renames(self, client: TestClient, auth):
        response = client.patch("/api/projects/P-1", json={"name": "Carrot Operations"}, headers=auth)
        assert response.json()["name"] == "Carrot Operations"

    def test_rejects_a_blank_name(self, client: TestClient, auth):
        assert client.post("/api/projects", json={"name": ""}, headers=auth).status_code == 422

    def test_unknown_project_is_404(self, client: TestClient, auth):
        assert client.patch("/api/projects/P-404", json={"name": "x"}, headers=auth).status_code == 404

    def test_delete_cascades_to_tasks(self, client: TestClient, auth):
        assert client.delete("/api/projects/P-1", headers=auth).status_code == 204
        tasks = client.get("/api/tasks", headers=auth).json()
        assert all(t["projectId"] != "P-1" for t in tasks)
        assert len(tasks) == 4  # P-2 keeps T-4, T-5, T-6, T-8

    def test_delete_prunes_links_to_the_deleted_tasks(self, client: TestClient, auth):
        # T-6 waits on T-3, which belongs to P-1 and goes with it.
        client.delete("/api/projects/P-1", headers=auth)
        tasks = {t["id"]: t for t in client.get("/api/tasks", headers=auth).json()}
        assert "T-3" not in tasks["T-6"]["dependsOn"]


class TestSubtasks:
    def test_create_returns_the_parent_task(self, client: TestClient, auth):
        response = client.post("/api/tasks/T-2/subtasks", json=SUBTASK, headers=auth)
        assert response.status_code == 201
        body = response.json()
        assert body["id"] == "T-2"
        assert [s["title"] for s in body["subtasks"]] == ["Draft ERD"]

    def test_ids_are_unique_board_wide(self, client: TestClient, auth):
        client.post("/api/tasks/T-2/subtasks", json=SUBTASK, headers=auth)
        client.post("/api/tasks/T-8/subtasks", json=SUBTASK, headers=auth)
        tasks = client.get("/api/tasks", headers=auth).json()
        ids = [s["id"] for t in tasks for s in t["subtasks"]]
        assert len(ids) == len(set(ids))

    def test_consecutive_adds_do_not_collide(self, client: TestClient, auth):
        client.post("/api/tasks/T-2/subtasks", json=SUBTASK, headers=auth)
        body = client.post("/api/tasks/T-2/subtasks", json=SUBTASK, headers=auth).json()
        ids = [s["id"] for s in body["subtasks"]]
        assert ids == ["S-6", "S-7"]

    def test_update_returns_the_parent_task(self, client: TestClient, auth):
        response = client.patch(
            "/api/tasks/T-1/subtasks/S-2", json={"status": "todo"}, headers=auth
        )
        assert response.status_code == 200
        body = response.json()
        assert body["id"] == "T-1"
        assert body["subtasks"][1]["status"] == "todo"

    def test_delete_returns_the_parent_task(self, client: TestClient, auth):
        response = client.delete("/api/tasks/T-1/subtasks/S-1", headers=auth)
        assert response.status_code == 200
        assert [s["id"] for s in response.json()["subtasks"]] == ["S-2"]

    def test_unknown_subtask_is_404(self, client: TestClient, auth):
        response = client.patch(
            "/api/tasks/T-1/subtasks/S-404", json={"status": "done"}, headers=auth
        )
        assert response.status_code == 404

    def test_unknown_parent_task_is_404(self, client: TestClient, auth):
        assert client.post("/api/tasks/T-404/subtasks", json=SUBTASK, headers=auth).status_code == 404

    def test_empty_patch_is_rejected(self, client: TestClient, auth):
        assert client.patch("/api/tasks/T-1/subtasks/S-1", json={}, headers=auth).status_code == 422


class TestErrorShape:
    def test_every_error_uses_the_contract_shape(self, client: TestClient, auth):
        responses = [
            client.get("/api/tasks"),
            client.get("/api/tasks/../nope", headers=auth),
            client.patch("/api/tasks/T-404", json={"points": 1}, headers=auth),
            client.patch("/api/tasks/T-1", json={"dependsOn": ["T-1"]}, headers=auth),
            client.post("/api/tasks", json={"title": "x"}, headers=auth),
        ]
        for response in responses:
            assert response.status_code >= 400
            body = response.json()
            assert isinstance(body.get("code"), str), body
            assert isinstance(body.get("message"), str) and body["message"], body
            assert "detail" not in body, "FastAPI's default error shape leaked through"
