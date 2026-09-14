from __future__ import annotations

from fastapi.testclient import TestClient

NEW_TASK = {
    "title": "Water the carrots",
    "detail": "",
    "status": "backlog",
    "priority": "medium",
    "assignee": "",
    "points": 3,
    "projectId": "P-1",
    "dependsOn": [],
}


class TestListTasks:
    def test_returns_the_seeded_board(self, client: TestClient, auth):
        tasks = client.get("/api/tasks", headers=auth).json()
        assert len(tasks) == 9
        assert [t["id"] for t in tasks] == [f"T-{n}" for n in range(1, 10)]

    def test_uses_camel_case_on_the_wire(self, client: TestClient, auth):
        # The failure this guards against is silent in the browser: TypeScript cannot see a
        # renamed field, it just reads undefined.
        task = client.get("/api/tasks", headers=auth).json()[0]
        assert "projectId" in task and "dependsOn" in task
        assert "project_id" not in task and "depends_on" not in task

    def test_embeds_subtasks(self, client: TestClient, auth):
        tasks = {t["id"]: t for t in client.get("/api/tasks", headers=auth).json()}
        assert [s["id"] for s in tasks["T-1"]["subtasks"]] == ["S-1", "S-2"]
        assert tasks["T-2"]["subtasks"] == []


class TestCreateTask:
    def test_creates_with_a_server_assigned_id(self, client: TestClient, auth):
        response = client.post("/api/tasks", json=NEW_TASK, headers=auth)
        assert response.status_code == 201
        body = response.json()
        assert body["id"] == "T-10"
        assert body["subtasks"] == []

    def test_ids_do_not_collide(self, client: TestClient, auth):
        first = client.post("/api/tasks", json=NEW_TASK, headers=auth).json()["id"]
        second = client.post("/api/tasks", json=NEW_TASK, headers=auth).json()["id"]
        assert first != second

    def test_blank_title_becomes_untitled(self, client: TestClient, auth):
        response = client.post("/api/tasks", json={**NEW_TASK, "title": "   "}, headers=auth)
        assert response.json()["title"] == "Untitled task"

    def test_unknown_project_is_404(self, client: TestClient, auth):
        response = client.post("/api/tasks", json={**NEW_TASK, "projectId": "P-404"}, headers=auth)
        assert response.status_code == 404

    def test_drops_dependencies_that_do_not_exist(self, client: TestClient, auth):
        response = client.post(
            "/api/tasks", json={**NEW_TASK, "dependsOn": ["T-1", "ghost"]}, headers=auth
        )
        assert response.json()["dependsOn"] == ["T-1"]

    def test_rejects_negative_points(self, client: TestClient, auth):
        response = client.post("/api/tasks", json={**NEW_TASK, "points": -1}, headers=auth)
        assert response.status_code == 422
        assert response.json()["code"] == "validation_error"

    def test_rejects_an_unknown_status(self, client: TestClient, auth):
        response = client.post("/api/tasks", json={**NEW_TASK, "status": "sideways"}, headers=auth)
        assert response.status_code == 422


class TestUpdateTask:
    def test_moves_a_lane(self, client: TestClient, auth):
        response = client.patch("/api/tasks/T-8", json={"status": "doing"}, headers=auth)
        assert response.status_code == 200
        assert response.json()["status"] == "doing"

    def test_leaves_unsent_fields_alone(self, client: TestClient, auth):
        before = client.get("/api/tasks", headers=auth).json()[7]
        after = client.patch("/api/tasks/T-8", json={"status": "doing"}, headers=auth).json()
        assert after["title"] == before["title"]
        assert after["points"] == before["points"]

    def test_replaces_depends_on_wholesale(self, client: TestClient, auth):
        response = client.patch("/api/tasks/T-3", json={"dependsOn": ["T-1"]}, headers=auth)
        assert response.json()["dependsOn"] == ["T-1"]

    def test_empty_body_is_rejected(self, client: TestClient, auth):
        # minProperties: 1 — an empty patch is a mistake, not a no-op.
        assert client.patch("/api/tasks/T-8", json={}, headers=auth).status_code == 422

    def test_unknown_task_is_404(self, client: TestClient, auth):
        response = client.patch("/api/tasks/T-404", json={"points": 1}, headers=auth)
        assert response.status_code == 404
        assert response.json()["code"] == "not_found"

    def test_unknown_dependency_is_404(self, client: TestClient, auth):
        response = client.patch("/api/tasks/T-8", json={"dependsOn": ["ghost"]}, headers=auth)
        assert response.status_code == 404


class TestDependencyCycles:
    def test_direct_cycle_is_409(self, client: TestClient, auth):
        # T-2 already waits on T-1.
        response = client.patch("/api/tasks/T-1", json={"dependsOn": ["T-2"]}, headers=auth)
        assert response.status_code == 409
        body = response.json()
        assert body["code"] == "dependency_cycle"
        assert "T-2" in body["details"]["conflictsWith"]

    def test_transitive_cycle_is_409(self, client: TestClient, auth):
        # T-1 → T-2 → T-3, so T-1 waiting on T-3 closes the loop.
        response = client.patch("/api/tasks/T-1", json={"dependsOn": ["T-3"]}, headers=auth)
        assert response.status_code == 409

    def test_self_dependency_is_409(self, client: TestClient, auth):
        response = client.patch("/api/tasks/T-1", json={"dependsOn": ["T-1"]}, headers=auth)
        assert response.status_code == 409
        assert response.json()["code"] == "self_dependency"

    def test_a_diamond_is_allowed(self, client: TestClient, auth):
        # T-3 and T-4 both descend from T-1; T-6 waiting on both is a diamond, not a cycle.
        response = client.patch("/api/tasks/T-6", json={"dependsOn": ["T-3", "T-4"]}, headers=auth)
        assert response.status_code == 200

    def test_a_refused_cycle_writes_nothing(self, client: TestClient, auth):
        before = client.get("/api/tasks", headers=auth).json()
        client.patch("/api/tasks/T-1", json={"dependsOn": ["T-3"], "points": 99}, headers=auth)
        assert client.get("/api/tasks", headers=auth).json() == before

    def test_message_is_a_sentence_for_a_person(self, client: TestClient, auth):
        # The frontend puts this straight into a toast.
        message = client.patch(
            "/api/tasks/T-1", json={"dependsOn": ["T-2"]}, headers=auth
        ).json()["message"]
        assert message.endswith(".") and "T-1" in message


class TestDeleteTask:
    def test_deletes_and_returns_204(self, client: TestClient, auth):
        assert client.delete("/api/tasks/T-9", headers=auth).status_code == 204
        ids = [t["id"] for t in client.get("/api/tasks", headers=auth).json()]
        assert "T-9" not in ids

    def test_prunes_references_from_other_tasks(self, client: TestClient, auth):
        client.delete("/api/tasks/T-2", headers=auth)
        tasks = client.get("/api/tasks", headers=auth).json()
        assert all("T-2" not in t["dependsOn"] for t in tasks)

    def test_unknown_task_is_404(self, client: TestClient, auth):
        assert client.delete("/api/tasks/T-404", headers=auth).status_code == 404
