"""Demo data.

Mirrors `frontend/src/api/seed.ts` exactly, so pointing the UI at this service shows the same board
it shows against its own mock. If you change one, change the other.
"""

from __future__ import annotations

from .auth import users
from .config import settings
from .models import Project, Subtask, Task
from .store import Board, store


def _projects() -> list[Project]:
    return [
        Project(id="P-1", name="Carrot Ops", hue=24),
        Project(id="P-2", name="Meadow Platform", hue=142),
    ]


def _tasks() -> list[Task]:
    return [
        Task(
            id="T-1",
            title="Define carrot schema",
            detail="Shape the core data model for crops, plots and harvest cycles.",
            status="done",
            priority="high",
            assignee="Mila",
            points=5,
            project_id="P-1",
            subtasks=[
                Subtask(id="S-1", title="Draft ERD", status="done", assignee="Mila"),
                Subtask(id="S-2", title="Review with Otto", status="done", assignee="Otto"),
            ],
            depends_on=[],
        ),
        Task(
            id="T-2",
            title="Seed sample plots",
            detail="Fill the demo board with realistic plots so the graph has depth.",
            status="done",
            priority="medium",
            assignee="Otto",
            points=3,
            project_id="P-1",
            subtasks=[],
            depends_on=["T-1"],
        ),
        Task(
            id="T-3",
            title="Plot detail drawer",
            detail="Side panel with owner, notes and blocking relationships.",
            status="doing",
            priority="high",
            assignee="Mila",
            points=8,
            project_id="P-1",
            subtasks=[
                Subtask(id="S-3", title="Layout pass", status="done", assignee="Mila"),
                Subtask(id="S-4", title="Blocker list", status="doing", assignee="Mila"),
            ],
            depends_on=["T-1", "T-2"],
        ),
        Task(
            id="T-4",
            title="Dependency graph view",
            detail="Layered graph that shows what blocks what across the board.",
            status="doing",
            priority="high",
            assignee="Ines",
            points=8,
            project_id="P-2",
            subtasks=[Subtask(id="S-5", title="Edge routing", status="doing", assignee="Ines")],
            depends_on=["T-2"],
        ),
        Task(
            id="T-5",
            title="Critical path highlight",
            detail="Trace the longest blocking chain and mark it on the graph.",
            status="todo",
            priority="medium",
            assignee="Ines",
            points=5,
            project_id="P-2",
            subtasks=[],
            depends_on=["T-4"],
        ),
        Task(
            id="T-6",
            title="Kanbunny answers",
            detail="Let the bunny search tasks and explain blockers in plain words.",
            status="todo",
            priority="high",
            assignee="Otto",
            points=8,
            project_id="P-2",
            subtasks=[],
            depends_on=["T-3", "T-4"],
        ),
        Task(
            id="T-7",
            title="Weekly harvest digest",
            detail="Summarise moved cards and newly unblocked work every Friday.",
            status="backlog",
            priority="low",
            assignee="Mila",
            points=3,
            project_id="P-1",
            subtasks=[],
            depends_on=["T-6"],
        ),
        Task(
            id="T-8",
            title="Board keyboard shortcuts",
            detail="Hop between columns and cards without touching the mouse.",
            status="backlog",
            priority="low",
            assignee="Ines",
            points=2,
            project_id="P-2",
            subtasks=[],
            depends_on=[],
        ),
        Task(
            id="T-9",
            title="Burrow analytics",
            detail="Throughput, cycle time and blocked-time per lane.",
            status="backlog",
            priority="medium",
            assignee="Otto",
            points=5,
            project_id="P-1",
            subtasks=[],
            depends_on=["T-5", "T-7"],
        ),
    ]


def demo_board() -> Board:
    return Board(tasks=_tasks(), projects=_projects())


def seed_demo_user(username: str | None = None, password: str | None = None) -> str:
    """Create the demo account and give it the demo board. Returns the user id."""
    username = username or settings.seed_username
    password = password or settings.seed_password

    existing = users.by_username(username)
    user = existing if existing is not None else users.create(username, password)
    store.load(user.id, demo_board())
    return user.id
