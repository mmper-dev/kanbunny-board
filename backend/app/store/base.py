"""The storage contract.

Routers and `auth.py` depend on these protocols, never on a concrete implementation. Swapping
SQLite for PostgreSQL, or either for the in-memory demo store, changes which object gets
constructed in `__init__.py` and nothing else.
"""

from __future__ import annotations

from typing import Any, Protocol

from ..models import Project, Task
from .common import User


class UserStore(Protocol):
    def create(self, username: str, password: str) -> User: ...

    def by_username(self, username: str) -> User | None: ...

    def by_id(self, user_id: str) -> User | None: ...

    def authenticate(self, username: str, password: str) -> User:
        """The matching user, or `UnauthorizedError`.

        Implementations must take the same time and return the same message whether the account is
        missing or the password is wrong, so the response cannot be used to enumerate accounts.
        """
        ...

    def clear(self) -> None:
        """Remove every user. Tests and demo resets only."""
        ...


class BoardStore(Protocol):
    # --- projects ---------------------------------------------------------------------------
    def list_projects(self, user_id: str) -> list[Project]: ...

    def create_project(self, user_id: str, name: str) -> Project: ...

    def update_project(self, user_id: str, project_id: str, changes: dict[str, Any]) -> Project: ...

    def delete_project(self, user_id: str, project_id: str) -> None:
        """Cascades: the project's tasks go, and references to them are pruned from survivors."""
        ...

    # --- tasks ------------------------------------------------------------------------------
    def list_tasks(self, user_id: str) -> list[Task]: ...

    def create_task(self, user_id: str, data: dict[str, Any]) -> Task: ...

    def update_task(self, user_id: str, task_id: str, changes: dict[str, Any]) -> Task:
        """Refuses a `dependsOn` that would close a loop, writing nothing."""
        ...

    def delete_task(self, user_id: str, task_id: str) -> None:
        """Cascades: the id is pruned from every other task's dependsOn."""
        ...

    # --- subtasks ---------------------------------------------------------------------------
    def create_subtask(self, user_id: str, task_id: str, data: dict[str, Any]) -> Task: ...

    def update_subtask(
        self, user_id: str, task_id: str, subtask_id: str, changes: dict[str, Any]
    ) -> Task: ...

    def delete_subtask(self, user_id: str, task_id: str, subtask_id: str) -> Task: ...

    # --- bulk -------------------------------------------------------------------------------
    def replace_board(
        self, user_id: str, projects: list[Project], tasks: list[Task]
    ) -> None:
        """Set a user's whole board. Seeding and demo resets only."""
        ...

    def is_empty(self, user_id: str) -> bool: ...

    def clear(self) -> None:
        """Remove every board. Tests and demo resets only."""
        ...
