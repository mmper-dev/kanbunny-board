"""SQLAlchemy engine and ORM tables.

Deliberately database-agnostic: no dialect-specific column types, no JSON columns, no server-side
defaults, and cascades performed in code rather than relying on `ON DELETE` (SQLite does not
enforce foreign keys unless asked, and enforcement differs between engines). Moving to PostgreSQL
should be a change of `DATABASE_URL` and a driver install, nothing more.

Ordering is explicit. `position` columns exist because a board has an order the user can see —
relational rows have none, and "whatever the database returns" changes between engines.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import (
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker


class Base(DeclarativeBase):
    pass


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(120), nullable=False)
    #: Lower-cased, so sign-in is case-insensitive on every engine rather than depending on the
    #: collation the database happens to use.
    username_key: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    password_hash: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


class ProjectRow(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    hue: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class TaskRow(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), ForeignKey("users.id"), index=True)
    project_id: Mapped[str] = mapped_column(String(64), ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    detail: Mapped[str] = mapped_column(String(2000), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    priority: Mapped[str] = mapped_column(String(16), nullable=False)
    assignee: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    points: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    subtasks: Mapped[list["SubtaskRow"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        order_by="SubtaskRow.position",
        lazy="selectin",
    )
    dependencies: Mapped[list["TaskDependencyRow"]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
        foreign_keys="TaskDependencyRow.task_id",
        order_by="TaskDependencyRow.position",
        lazy="selectin",
    )


class SubtaskRow(Base):
    __tablename__ = "subtasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    assignee: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    task: Mapped[TaskRow] = relationship(back_populates="subtasks")


class TaskDependencyRow(Base):
    """`task_id` waits on `depends_on_id`. A join table rather than an array column, because array
    types are not portable and this is a plain many-to-many."""

    __tablename__ = "task_dependencies"
    __table_args__ = (UniqueConstraint("task_id", "depends_on_id", name="uq_task_dependency"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), index=True)
    depends_on_id: Mapped[str] = mapped_column(String(64), ForeignKey("tasks.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    task: Mapped[TaskRow] = relationship(back_populates="dependencies", foreign_keys=[task_id])


def create_database_engine(url: str, echo: bool = False) -> Engine:
    """One place where a dialect quirk is allowed, and it is confined to SQLite."""
    connect_args: dict[str, object] = {}
    kwargs: dict[str, object] = {}

    if url.startswith("sqlite"):
        # FastAPI serves `def` endpoints from a threadpool, so a connection really does get used
        # from more than one thread. Other drivers handle this themselves.
        connect_args["check_same_thread"] = False
        if ":memory:" in url or url in ("sqlite://", "sqlite:///:memory:"):
            # Without a shared pool every connection gets its own blank in-memory database, and
            # data written by one request is invisible to the next.
            from sqlalchemy.pool import StaticPool

            kwargs["poolclass"] = StaticPool

    engine = create_engine(url, echo=echo, connect_args=connect_args, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _enforce_foreign_keys(dbapi_connection, _record):  # pragma: no cover - driver glue
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    """A transaction: commit on success, roll back on any error.

    This is what makes a refused write leave nothing behind — a cycle rejected halfway through a
    dependency rewrite must not leave the first half committed.
    """
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
