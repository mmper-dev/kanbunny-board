"""SQLAlchemy implementation.

Selected with `KANBUNNY_STORE=database` (the default) and pointed at `DATABASE_URL`. Nothing here
is SQLite-specific — the only dialect branch in the whole backend is in `db.py`, around connection
arguments. PostgreSQL needs a driver and a different URL, no code change.

Each method is one transaction (`session_scope`), so a refused write leaves nothing behind: a
dependency rewrite rejected as a cycle rolls back, rather than committing half of itself.
"""

from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, sessionmaker

from ..db import ProjectRow, SubtaskRow, TaskDependencyRow, TaskRow, UserRow, session_scope
from ..errors import NotFoundError, UnauthorizedError
from ..models import Project, Subtask, Task
from ..security import hash_password, verify_password
from .common import User, assert_acyclic, next_id


class SqlUserStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._sessions = session_factory

    @staticmethod
    def _to_user(row: UserRow) -> User:
        return User(id=row.id, username=row.username, password_hash=row.password_hash)

    def create(self, username: str, password: str) -> User:
        with session_scope(self._sessions) as session:
            key = username.lower()
            if session.scalar(select(UserRow).where(UserRow.username_key == key)) is not None:
                raise ValueError(f"User {username} already exists")
            existing_ids = session.scalars(select(UserRow.id)).all()
            row = UserRow(
                id=next_id("U", existing_ids),
                username=username,
                username_key=key,
                password_hash=hash_password(password),
            )
            session.add(row)
            session.flush()
            return self._to_user(row)

    def by_username(self, username: str) -> User | None:
        with session_scope(self._sessions) as session:
            row = session.scalar(
                select(UserRow).where(UserRow.username_key == username.lower())
            )
            return self._to_user(row) if row else None

    def by_id(self, user_id: str) -> User | None:
        with session_scope(self._sessions) as session:
            row = session.get(UserRow, user_id)
            return self._to_user(row) if row else None

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
        """Remove every user, and everything that belongs to them.

        Boards are keyed by user, so leaving them behind would both violate the foreign key and
        orphan rows nothing can reach. Tests and demo resets only.
        """
        with session_scope(self._sessions) as session:
            session.execute(delete(TaskDependencyRow))
            session.execute(delete(SubtaskRow))
            session.execute(delete(TaskRow))
            session.execute(delete(ProjectRow))
            session.execute(delete(UserRow))


class SqlBoardStore:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._sessions = session_factory

    # --- row mapping -------------------------------------------------------------------------

    @staticmethod
    def _to_project(row: ProjectRow) -> Project:
        return Project(id=row.id, name=row.name, hue=row.hue)

    @staticmethod
    def _to_task(row: TaskRow) -> Task:
        return Task(
            id=row.id,
            title=row.title,
            detail=row.detail,
            status=row.status,
            priority=row.priority,
            assignee=row.assignee,
            points=row.points,
            project_id=row.project_id,
            subtasks=[
                Subtask(id=s.id, title=s.title, status=s.status, assignee=s.assignee)
                for s in sorted(row.subtasks, key=lambda s: s.position)
            ],
            depends_on=[
                d.depends_on_id for d in sorted(row.dependencies, key=lambda d: d.position)
            ],
        )

    # --- lookups -----------------------------------------------------------------------------

    def _task_row(self, session: Session, user_id: str, task_id: str) -> TaskRow:
        row = session.scalar(
            select(TaskRow).where(TaskRow.id == task_id, TaskRow.user_id == user_id)
        )
        if row is None:
            # Scoped by user_id, so another user's task is "not found" rather than "forbidden" —
            # the API must not confirm an id exists to someone who cannot see it.
            raise NotFoundError(f"No task {task_id}")
        return row

    def _project_row(self, session: Session, user_id: str, project_id: str) -> ProjectRow:
        row = session.scalar(
            select(ProjectRow).where(
                ProjectRow.id == project_id, ProjectRow.user_id == user_id
            )
        )
        if row is None:
            raise NotFoundError(f"No project {project_id}")
        return row

    def _task_rows(self, session: Session, user_id: str) -> Sequence[TaskRow]:
        return (
            session.scalars(
                select(TaskRow).where(TaskRow.user_id == user_id).order_by(TaskRow.position)
            )
            .unique()
            .all()
        )

    def _next_position(self, session: Session, model, user_id: str) -> int:
        current = session.scalar(
            select(func.max(model.position)).where(model.user_id == user_id)
        )
        return (current or 0) + 1

    def _set_dependencies(self, session: Session, task_row: TaskRow, depends_on: list[str]) -> None:
        session.execute(delete(TaskDependencyRow).where(TaskDependencyRow.task_id == task_row.id))
        session.flush()
        for position, dependency_id in enumerate(depends_on):
            session.add(
                TaskDependencyRow(
                    task_id=task_row.id, depends_on_id=dependency_id, position=position
                )
            )
        session.flush()
        session.refresh(task_row)

    # --- projects ----------------------------------------------------------------------------

    def list_projects(self, user_id: str) -> list[Project]:
        with session_scope(self._sessions) as session:
            rows = session.scalars(
                select(ProjectRow)
                .where(ProjectRow.user_id == user_id)
                .order_by(ProjectRow.position)
            ).all()
            return [self._to_project(row) for row in rows]

    def create_project(self, user_id: str, name: str) -> Project:
        with session_scope(self._sessions) as session:
            existing = session.scalars(
                select(ProjectRow.id).where(ProjectRow.user_id == user_id)
            ).all()
            count = len(existing)
            row = ProjectRow(
                id=next_id("P", existing),
                user_id=user_id,
                name=name.strip() or "Untitled project",
                hue=(count * 67 + 24) % 360,
                position=self._next_position(session, ProjectRow, user_id),
            )
            session.add(row)
            session.flush()
            return self._to_project(row)

    def update_project(self, user_id: str, project_id: str, changes: dict[str, Any]) -> Project:
        with session_scope(self._sessions) as session:
            row = self._project_row(session, user_id, project_id)
            for key, value in changes.items():
                setattr(row, key, value)
            session.flush()
            return self._to_project(row)

    def delete_project(self, user_id: str, project_id: str) -> None:
        with session_scope(self._sessions) as session:
            self._project_row(session, user_id, project_id)
            orphaned = list(
                session.scalars(
                    select(TaskRow.id).where(
                        TaskRow.user_id == user_id, TaskRow.project_id == project_id
                    )
                ).all()
            )
            if orphaned:
                # Both directions: links from the doomed tasks, and links to them from survivors.
                session.execute(
                    delete(TaskDependencyRow).where(TaskDependencyRow.task_id.in_(orphaned))
                )
                session.execute(
                    delete(TaskDependencyRow).where(TaskDependencyRow.depends_on_id.in_(orphaned))
                )
                session.execute(delete(SubtaskRow).where(SubtaskRow.task_id.in_(orphaned)))
                session.execute(delete(TaskRow).where(TaskRow.id.in_(orphaned)))
            session.execute(delete(ProjectRow).where(ProjectRow.id == project_id))

    # --- tasks -------------------------------------------------------------------------------

    def list_tasks(self, user_id: str) -> list[Task]:
        with session_scope(self._sessions) as session:
            return [self._to_task(row) for row in self._task_rows(session, user_id)]

    def create_task(self, user_id: str, data: dict[str, Any]) -> Task:
        with session_scope(self._sessions) as session:
            self._project_row(session, user_id, data["project_id"])
            known = set(session.scalars(select(TaskRow.id).where(TaskRow.user_id == user_id)).all())

            row = TaskRow(
                id=next_id("T", known),
                user_id=user_id,
                project_id=data["project_id"],
                title=(data["title"].strip() or "Untitled task"),
                detail=data["detail"],
                status=data["status"],
                priority=data["priority"],
                assignee=data["assignee"],
                points=data["points"],
                position=self._next_position(session, TaskRow, user_id),
            )
            session.add(row)
            session.flush()

            # Unknown ids are dropped, not rejected — a brand new task cannot be depended on, so
            # the only way it could cycle is through ids that are not real.
            self._set_dependencies(
                session, row, [d for d in data.get("depends_on", []) if d in known]
            )
            return self._to_task(row)

    def update_task(self, user_id: str, task_id: str, changes: dict[str, Any]) -> Task:
        with session_scope(self._sessions) as session:
            row = self._task_row(session, user_id, task_id)

            if "project_id" in changes:
                self._project_row(session, user_id, changes["project_id"])

            depends_on = changes.pop("depends_on", None)
            if depends_on is not None:
                depends_on = list(depends_on)
                all_rows = self._task_rows(session, user_id)
                known = {t.id for t in all_rows}
                missing = [d for d in depends_on if d not in known]
                if missing:
                    raise NotFoundError(f"No task {missing[0]}")

                edges = {
                    t.id: [d.depends_on_id for d in t.dependencies] for t in all_rows
                }
                # Raises before anything is written; session_scope rolls the transaction back.
                assert_acyclic(edges, task_id, depends_on)

            if "title" in changes:
                changes["title"] = changes["title"].strip() or "Untitled task"

            for key, value in changes.items():
                setattr(row, key, value)
            session.flush()

            if depends_on is not None:
                self._set_dependencies(session, row, depends_on)

            session.refresh(row)
            return self._to_task(row)

    def delete_task(self, user_id: str, task_id: str) -> None:
        with session_scope(self._sessions) as session:
            self._task_row(session, user_id, task_id)
            session.execute(
                delete(TaskDependencyRow).where(
                    (TaskDependencyRow.task_id == task_id)
                    | (TaskDependencyRow.depends_on_id == task_id)
                )
            )
            session.execute(delete(SubtaskRow).where(SubtaskRow.task_id == task_id))
            session.execute(delete(TaskRow).where(TaskRow.id == task_id))

    # --- subtasks ----------------------------------------------------------------------------

    def create_subtask(self, user_id: str, task_id: str, data: dict[str, Any]) -> Task:
        with session_scope(self._sessions) as session:
            row = self._task_row(session, user_id, task_id)
            # Unique board-wide, not per task, matching the frontend model.
            existing = session.scalars(
                select(SubtaskRow.id)
                .join(TaskRow, SubtaskRow.task_id == TaskRow.id)
                .where(TaskRow.user_id == user_id)
            ).all()
            position = (
                session.scalar(
                    select(func.max(SubtaskRow.position)).where(SubtaskRow.task_id == task_id)
                )
                or 0
            ) + 1
            session.add(
                SubtaskRow(
                    id=next_id("S", existing),
                    task_id=task_id,
                    title=data["title"],
                    status=data["status"],
                    assignee=data["assignee"],
                    position=position,
                )
            )
            session.flush()
            session.refresh(row)
            return self._to_task(row)

    def update_subtask(
        self, user_id: str, task_id: str, subtask_id: str, changes: dict[str, Any]
    ) -> Task:
        with session_scope(self._sessions) as session:
            row = self._task_row(session, user_id, task_id)
            subtask = session.scalar(
                select(SubtaskRow).where(
                    SubtaskRow.id == subtask_id, SubtaskRow.task_id == task_id
                )
            )
            if subtask is None:
                raise NotFoundError(f"No subtask {subtask_id} on {task_id}")
            for key, value in changes.items():
                setattr(subtask, key, value)
            session.flush()
            session.refresh(row)
            return self._to_task(row)

    def delete_subtask(self, user_id: str, task_id: str, subtask_id: str) -> Task:
        with session_scope(self._sessions) as session:
            row = self._task_row(session, user_id, task_id)
            subtask = session.scalar(
                select(SubtaskRow).where(
                    SubtaskRow.id == subtask_id, SubtaskRow.task_id == task_id
                )
            )
            if subtask is None:
                raise NotFoundError(f"No subtask {subtask_id} on {task_id}")
            session.delete(subtask)
            session.flush()
            session.refresh(row)
            return self._to_task(row)

    # --- bulk --------------------------------------------------------------------------------

    def replace_board(self, user_id: str, projects: list[Project], tasks: list[Task]) -> None:
        with session_scope(self._sessions) as session:
            owned = list(
                session.scalars(select(TaskRow.id).where(TaskRow.user_id == user_id)).all()
            )
            if owned:
                session.execute(
                    delete(TaskDependencyRow).where(TaskDependencyRow.task_id.in_(owned))
                )
                session.execute(delete(SubtaskRow).where(SubtaskRow.task_id.in_(owned)))
            session.execute(delete(TaskRow).where(TaskRow.user_id == user_id))
            session.execute(delete(ProjectRow).where(ProjectRow.user_id == user_id))
            session.flush()

            for position, project in enumerate(projects):
                session.add(
                    ProjectRow(
                        id=project.id,
                        user_id=user_id,
                        name=project.name,
                        hue=project.hue,
                        position=position,
                    )
                )
            for position, task in enumerate(tasks):
                session.add(
                    TaskRow(
                        id=task.id,
                        user_id=user_id,
                        project_id=task.project_id,
                        title=task.title,
                        detail=task.detail,
                        status=task.status,
                        priority=task.priority,
                        assignee=task.assignee,
                        points=task.points,
                        position=position,
                    )
                )
            session.flush()

            for task in tasks:
                for index, subtask in enumerate(task.subtasks):
                    session.add(
                        SubtaskRow(
                            id=subtask.id,
                            task_id=task.id,
                            title=subtask.title,
                            status=subtask.status,
                            assignee=subtask.assignee,
                            position=index,
                        )
                    )
                for index, dependency_id in enumerate(task.depends_on):
                    session.add(
                        TaskDependencyRow(
                            task_id=task.id, depends_on_id=dependency_id, position=index
                        )
                    )

    def is_empty(self, user_id: str) -> bool:
        with session_scope(self._sessions) as session:
            tasks = session.scalar(
                select(func.count()).select_from(TaskRow).where(TaskRow.user_id == user_id)
            )
            projects = session.scalar(
                select(func.count()).select_from(ProjectRow).where(ProjectRow.user_id == user_id)
            )
            return not tasks and not projects

    def clear(self) -> None:
        with session_scope(self._sessions) as session:
            session.execute(delete(TaskDependencyRow))
            session.execute(delete(SubtaskRow))
            session.execute(delete(TaskRow))
            session.execute(delete(ProjectRow))
