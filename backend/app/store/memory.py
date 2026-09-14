"""In-memory implementation — the demo mode.

Selected with `KANBUNNY_STORE=memory`. Needs no database, holds everything in process, and loses
it all on restart. This is also what the test suite runs alongside the SQL store, so both
implementations are held to the same behaviour.

Access is guarded by a re-entrant lock: FastAPI serves `def` endpoints from a threadpool, so more
than one request really can touch these lists at once.
"""

from __future__ import annotations

import threading
from copy import deepcopy
from typing import Any

from ..errors import NotFoundError, UnauthorizedError
from ..models import Project, Subtask, Task
from ..security import hash_password, verify_password
from .common import User, assert_acyclic, next_id


class MemoryUserStore:
    def __init__(self) -> None:
        self._users: dict[str, User] = {}
        self._lock = threading.RLock()

    def create(self, username: str, password: str) -> User:
        with self._lock:
            key = username.lower()
            if key in self._users:
                raise ValueError(f"User {username} already exists")
            user = User(
                id=next_id("U", (u.id for u in self._users.values())),
                username=username,
                password_hash=hash_password(password),
            )
            self._users[key] = user
            return user

    def by_username(self, username: str) -> User | None:
        with self._lock:
            return self._users.get(username.lower())

    def by_id(self, user_id: str) -> User | None:
        with self._lock:
            return next((u for u in self._users.values() if u.id == user_id), None)

    def authenticate(self, username: str, password: str) -> User:
        user = self.by_username(username)
        if user is None:
            # Hash anyway so a missing account costs the same as a wrong password.
            hash_password(password)
            raise UnauthorizedError("That username and password do not match.")
        if not verify_password(password, user.password_hash):
            raise UnauthorizedError("That username and password do not match.")
        return user

    def clear(self) -> None:
        with self._lock:
            self._users.clear()


class _Board:
    def __init__(self) -> None:
        self.tasks: list[Task] = []
        self.projects: list[Project] = []


class MemoryBoardStore:
    def __init__(self) -> None:
        self._boards: dict[str, _Board] = {}
        self._lock = threading.RLock()

    # --- internals ---------------------------------------------------------------------------

    def _board(self, user_id: str) -> _Board:
        return self._boards.setdefault(user_id, _Board())

    def _task(self, board: _Board, task_id: str) -> Task:
        for task in board.tasks:
            if task.id == task_id:
                return task
        raise NotFoundError(f"No task {task_id}")

    def _project(self, board: _Board, project_id: str) -> Project:
        for project in board.projects:
            if project.id == project_id:
                return project
        raise NotFoundError(f"No project {project_id}")

    # --- projects ----------------------------------------------------------------------------

    def list_projects(self, user_id: str) -> list[Project]:
        with self._lock:
            return deepcopy(self._board(user_id).projects)

    def create_project(self, user_id: str, name: str) -> Project:
        with self._lock:
            board = self._board(user_id)
            project = Project(
                id=next_id("P", (p.id for p in board.projects)),
                name=name.strip() or "Untitled project",
                hue=(len(board.projects) * 67 + 24) % 360,
            )
            board.projects.append(project)
            return deepcopy(project)

    def update_project(self, user_id: str, project_id: str, changes: dict[str, Any]) -> Project:
        with self._lock:
            project = self._project(self._board(user_id), project_id)
            for key, value in changes.items():
                setattr(project, key, value)
            return deepcopy(project)

    def delete_project(self, user_id: str, project_id: str) -> None:
        with self._lock:
            board = self._board(user_id)
            self._project(board, project_id)
            orphaned = {t.id for t in board.tasks if t.project_id == project_id}
            board.projects = [p for p in board.projects if p.id != project_id]
            board.tasks = [t for t in board.tasks if t.project_id != project_id]
            for task in board.tasks:
                task.depends_on = [d for d in task.depends_on if d not in orphaned]

    # --- tasks -------------------------------------------------------------------------------

    def list_tasks(self, user_id: str) -> list[Task]:
        with self._lock:
            return deepcopy(self._board(user_id).tasks)

    def create_task(self, user_id: str, data: dict[str, Any]) -> Task:
        with self._lock:
            board = self._board(user_id)
            self._project(board, data["project_id"])
            known = {t.id for t in board.tasks}
            task = Task(
                id=next_id("T", known),
                title=(data["title"].strip() or "Untitled task"),
                detail=data["detail"],
                status=data["status"],
                priority=data["priority"],
                assignee=data["assignee"],
                points=data["points"],
                project_id=data["project_id"],
                subtasks=[],
                # A task that does not exist yet cannot be depended on, so the only way it could
                # cycle is via ids that are not real. Drop those rather than failing the create.
                depends_on=[d for d in data.get("depends_on", []) if d in known],
            )
            board.tasks.append(task)
            return deepcopy(task)

    def update_task(self, user_id: str, task_id: str, changes: dict[str, Any]) -> Task:
        with self._lock:
            board = self._board(user_id)
            task = self._task(board, task_id)

            if "project_id" in changes:
                self._project(board, changes["project_id"])

            if "depends_on" in changes:
                depends_on = list(changes["depends_on"])
                known = {t.id for t in board.tasks}
                missing = [d for d in depends_on if d not in known]
                if missing:
                    raise NotFoundError(f"No task {missing[0]}")
                assert_acyclic({t.id: t.depends_on for t in board.tasks}, task_id, depends_on)
                changes["depends_on"] = depends_on

            if "title" in changes:
                changes["title"] = changes["title"].strip() or "Untitled task"

            for key, value in changes.items():
                setattr(task, key, value)
            return deepcopy(task)

    def delete_task(self, user_id: str, task_id: str) -> None:
        with self._lock:
            board = self._board(user_id)
            self._task(board, task_id)
            board.tasks = [t for t in board.tasks if t.id != task_id]
            for task in board.tasks:
                task.depends_on = [d for d in task.depends_on if d != task_id]

    # --- subtasks ----------------------------------------------------------------------------

    def create_subtask(self, user_id: str, task_id: str, data: dict[str, Any]) -> Task:
        with self._lock:
            board = self._board(user_id)
            task = self._task(board, task_id)
            # Subtask ids are unique board-wide, not per task, matching the frontend model.
            all_ids = [s.id for t in board.tasks for s in t.subtasks]
            task.subtasks.append(Subtask(id=next_id("S", all_ids), **data))
            return deepcopy(task)

    def update_subtask(
        self, user_id: str, task_id: str, subtask_id: str, changes: dict[str, Any]
    ) -> Task:
        with self._lock:
            task = self._task(self._board(user_id), task_id)
            for subtask in task.subtasks:
                if subtask.id == subtask_id:
                    for key, value in changes.items():
                        setattr(subtask, key, value)
                    return deepcopy(task)
            raise NotFoundError(f"No subtask {subtask_id} on {task_id}")

    def delete_subtask(self, user_id: str, task_id: str, subtask_id: str) -> Task:
        with self._lock:
            task = self._task(self._board(user_id), task_id)
            remaining = [s for s in task.subtasks if s.id != subtask_id]
            if len(remaining) == len(task.subtasks):
                raise NotFoundError(f"No subtask {subtask_id} on {task_id}")
            task.subtasks = remaining
            return deepcopy(task)

    # --- bulk --------------------------------------------------------------------------------

    def replace_board(self, user_id: str, projects: list[Project], tasks: list[Task]) -> None:
        with self._lock:
            board = _Board()
            board.projects = deepcopy(projects)
            board.tasks = deepcopy(tasks)
            self._boards[user_id] = board

    def is_empty(self, user_id: str) -> bool:
        with self._lock:
            board = self._board(user_id)
            return not board.tasks and not board.projects

    def clear(self) -> None:
        with self._lock:
            self._boards.clear()
