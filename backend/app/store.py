"""In-memory board store.

Holds one board per user and owns everything a database would later own: id generation, cascading
deletes, and the invariant that the dependency graph stays acyclic. Routers do no data logic of
their own.

Swapping this for a real database should not change any router. That is why the store returns
copies, raises the domain errors from `errors.py`, and takes a `user_id` on every call rather than
reaching for request state.

Access is guarded by a re-entrant lock: FastAPI runs `def` endpoints in a threadpool, so more than
one request really can touch these lists at once.
"""

from __future__ import annotations

import threading
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Iterable

from .errors import DependencyCycleError, NotFoundError, SelfDependencyError
from .models import Project, Subtask, Task


def next_id(prefix: str, existing: Iterable[str]) -> str:
    """`T-7` after `T-6` — max numeric suffix + 1.

    The frontend never parses ids, so a database is free to use UUIDs instead. This only keeps the
    demo data readable.
    """
    numbers = []
    for item in existing:
        _, _, suffix = item.partition("-")
        if suffix.isdigit():
            numbers.append(int(suffix))
    return f"{prefix}-{(max(numbers) if numbers else 0) + 1}"


@dataclass
class Board:
    tasks: list[Task] = field(default_factory=list)
    projects: list[Project] = field(default_factory=list)


class BoardStore:
    def __init__(self) -> None:
        self._boards: dict[str, Board] = {}
        self._lock = threading.RLock()

    # --- internals -----------------------------------------------------------------------------

    def _board(self, user_id: str) -> Board:
        return self._boards.setdefault(user_id, Board())

    def load(self, user_id: str, board: Board) -> None:
        """Replace a user's board wholesale. Used by seeding and by tests."""
        with self._lock:
            self._boards[user_id] = board

    def reset(self) -> None:
        with self._lock:
            self._boards.clear()

    def _find_task(self, board: Board, task_id: str) -> Task:
        for task in board.tasks:
            if task.id == task_id:
                return task
        raise NotFoundError(f"No task {task_id}")

    def _find_project(self, board: Board, project_id: str) -> Project:
        for project in board.projects:
            if project.id == project_id:
                return project
        raise NotFoundError(f"No project {project_id}")

    def _assert_acyclic(self, board: Board, task_id: str, depends_on: list[str]) -> None:
        """Refuse an edge that would close a loop.

        Walks the proposed dependencies backwards; reaching `task_id` means the edge completes a
        cycle. A diamond (A→B, A→C, B→D, C→D) reaches D twice but never reaches back to the task
        being edited, so it is accepted — which is the case a naive "already seen" check gets
        wrong.
        """
        if task_id in depends_on:
            raise SelfDependencyError(
                f"{task_id} cannot wait on itself.", {"taskId": task_id}
            )

        by_id = {task.id: task for task in board.tasks}

        def reaches(start: str, target: str) -> bool:
            """Can `start` get to `target` by following dependsOn edges?"""
            seen: set[str] = set()
            stack = [start]
            while stack:
                current = stack.pop()
                if current == target:
                    return True
                if current in seen:
                    continue
                seen.add(current)
                node = by_id.get(current)
                if node is not None:
                    stack.extend(node.depends_on)
            return False

        offenders = sorted({d for d in depends_on if reaches(d, task_id)})
        if offenders:
            names = ", ".join(offenders)
            raise DependencyCycleError(
                f"That would make a loop — {names} already waits on {task_id}.",
                {"taskId": task_id, "conflictsWith": offenders},
            )

    # --- projects ------------------------------------------------------------------------------

    def list_projects(self, user_id: str) -> list[Project]:
        with self._lock:
            return deepcopy(self._board(user_id).projects)

    def create_project(self, user_id: str, name: str) -> Project:
        with self._lock:
            board = self._board(user_id)
            project = Project(
                id=next_id("P", (p.id for p in board.projects)),
                name=name.strip() or "Untitled project",
                # Spread the wheel so adjacent projects stay distinguishable.
                hue=(len(board.projects) * 67 + 24) % 360,
            )
            board.projects.append(project)
            return deepcopy(project)

    def update_project(self, user_id: str, project_id: str, changes: dict[str, Any]) -> Project:
        with self._lock:
            board = self._board(user_id)
            project = self._find_project(board, project_id)
            for key, value in changes.items():
                setattr(project, key, value)
            return deepcopy(project)

    def delete_project(self, user_id: str, project_id: str) -> None:
        """Cascades: the project's tasks go, and every reference to them is pruned."""
        with self._lock:
            board = self._board(user_id)
            self._find_project(board, project_id)
            orphaned = {t.id for t in board.tasks if t.project_id == project_id}
            board.projects = [p for p in board.projects if p.id != project_id]
            board.tasks = [t for t in board.tasks if t.project_id != project_id]
            for task in board.tasks:
                task.depends_on = [d for d in task.depends_on if d not in orphaned]

    # --- tasks ---------------------------------------------------------------------------------

    def list_tasks(self, user_id: str) -> list[Task]:
        with self._lock:
            return deepcopy(self._board(user_id).tasks)

    def create_task(self, user_id: str, data: dict[str, Any]) -> Task:
        with self._lock:
            board = self._board(user_id)
            self._find_project(board, data["project_id"])

            known = {t.id for t in board.tasks}
            # A task that does not exist yet cannot be depended upon, so the only way it can cycle
            # is through ids that are not real. Drop those rather than failing the create.
            depends_on = [d for d in data.get("depends_on", []) if d in known]

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
                depends_on=depends_on,
            )
            board.tasks.append(task)
            return deepcopy(task)

    def update_task(self, user_id: str, task_id: str, changes: dict[str, Any]) -> Task:
        with self._lock:
            board = self._board(user_id)
            task = self._find_task(board, task_id)

            if "project_id" in changes:
                self._find_project(board, changes["project_id"])

            if "depends_on" in changes:
                depends_on = list(changes["depends_on"])
                known = {t.id for t in board.tasks}
                missing = [d for d in depends_on if d not in known]
                if missing:
                    raise NotFoundError(f"No task {missing[0]}")
                self._assert_acyclic(board, task_id, depends_on)
                changes["depends_on"] = depends_on

            if "title" in changes:
                changes["title"] = changes["title"].strip() or "Untitled task"

            for key, value in changes.items():
                setattr(task, key, value)
            return deepcopy(task)

    def delete_task(self, user_id: str, task_id: str) -> None:
        """Cascades: no dangling reference to the deleted task survives."""
        with self._lock:
            board = self._board(user_id)
            self._find_task(board, task_id)
            board.tasks = [t for t in board.tasks if t.id != task_id]
            for task in board.tasks:
                task.depends_on = [d for d in task.depends_on if d != task_id]

    # --- subtasks ------------------------------------------------------------------------------

    def create_subtask(self, user_id: str, task_id: str, data: dict[str, Any]) -> Task:
        with self._lock:
            board = self._board(user_id)
            task = self._find_task(board, task_id)
            # Subtask ids are unique board-wide, not per task, matching the frontend model.
            all_ids = [s.id for t in board.tasks for s in t.subtasks]
            task.subtasks.append(Subtask(id=next_id("S", all_ids), **data))
            return deepcopy(task)

    def update_subtask(
        self, user_id: str, task_id: str, subtask_id: str, changes: dict[str, Any]
    ) -> Task:
        with self._lock:
            board = self._board(user_id)
            task = self._find_task(board, task_id)
            for subtask in task.subtasks:
                if subtask.id == subtask_id:
                    for key, value in changes.items():
                        setattr(subtask, key, value)
                    return deepcopy(task)
            raise NotFoundError(f"No subtask {subtask_id} on {task_id}")

    def delete_subtask(self, user_id: str, task_id: str, subtask_id: str) -> Task:
        with self._lock:
            board = self._board(user_id)
            task = self._find_task(board, task_id)
            remaining = [s for s in task.subtasks if s.id != subtask_id]
            if len(remaining) == len(task.subtasks):
                raise NotFoundError(f"No subtask {subtask_id} on {task_id}")
            task.subtasks = remaining
            return deepcopy(task)


store = BoardStore()
