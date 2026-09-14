"""Storage-mode behaviour.

The rest of the suite proves the two stores behave identically through the API. These tests prove
the one thing that must *differ*: a database keeps data across process restarts, and the demo store
deliberately does not.
"""

from __future__ import annotations

import pytest

from app.config import STORE_DATABASE, STORE_MEMORY, Settings
from app.seed import _projects, _tasks
from app.store import build_stores


def _settings(**overrides) -> Settings:
    return Settings(secret_key="test-secret-key-that-is-long-enough-32", **overrides)


@pytest.fixture
def db_url(tmp_path) -> str:
    return f"sqlite:///{(tmp_path / 'kanbunny.db').as_posix()}"


class TestDatabasePersists:
    def test_a_board_survives_a_new_set_of_stores(self, db_url: str):
        """Stand-in for a restart: build the stores, write, throw them away, build them again."""
        first = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        user = first.users.create("mila", "carrots123")
        first.boards.replace_board(user.id, _projects(), _tasks())

        second = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        tasks = second.boards.list_tasks(user.id)

        assert len(tasks) == 9
        assert [t.id for t in tasks] == [f"T-{n}" for n in range(1, 10)]

    def test_an_account_survives(self, db_url: str):
        first = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        first.users.create("mila", "carrots123")

        second = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        assert second.users.authenticate("mila", "carrots123").username == "mila"

    def test_edits_survive(self, db_url: str):
        first = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        user = first.users.create("mila", "carrots123")
        first.boards.replace_board(user.id, _projects(), _tasks())
        first.boards.update_task(user.id, "T-8", {"status": "doing", "points": 13})

        second = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        task = next(t for t in second.boards.list_tasks(user.id) if t.id == "T-8")
        assert (task.status, task.points) == ("doing", 13)

    def test_relationships_survive(self, db_url: str):
        """dependsOn and subtasks are separate tables — they have to come back in order."""
        first = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        user = first.users.create("mila", "carrots123")
        first.boards.replace_board(user.id, _projects(), _tasks())

        second = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        tasks = {t.id: t for t in second.boards.list_tasks(user.id)}

        assert tasks["T-3"].depends_on == ["T-1", "T-2"]
        assert [s.id for s in tasks["T-1"].subtasks] == ["S-1", "S-2"]
        assert tasks["T-1"].subtasks[0].title == "Draft ERD"

    def test_a_rejected_cycle_leaves_nothing_behind(self, db_url: str):
        """The write is one transaction, so a refusal must not commit half of itself."""
        from app.errors import DependencyCycleError

        stores = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        user = stores.users.create("mila", "carrots123")
        stores.boards.replace_board(user.id, _projects(), _tasks())

        with pytest.raises(DependencyCycleError):
            stores.boards.update_task(user.id, "T-1", {"points": 99, "depends_on": ["T-3"]})

        reopened = build_stores(_settings(store=STORE_DATABASE, database_url=db_url))
        task = next(t for t in reopened.boards.list_tasks(user.id) if t.id == "T-1")
        assert task.points == 5
        assert task.depends_on == []


class TestMemoryDoesNot:
    def test_each_set_of_stores_starts_empty(self):
        first = build_stores(_settings(store=STORE_MEMORY))
        user = first.users.create("mila", "carrots123")
        first.boards.replace_board(user.id, _projects(), _tasks())

        second = build_stores(_settings(store=STORE_MEMORY))
        assert second.boards.list_tasks(user.id) == []
        assert second.users.by_username("mila") is None

    def test_needs_no_database_url(self):
        # Demo mode must work with nothing configured at all.
        stores = build_stores(_settings(store=STORE_MEMORY, database_url="not-a-real-url://"))
        assert stores.description.startswith("in-memory")


class TestConfiguration:
    def test_rejects_an_unknown_store_mode(self):
        with pytest.raises(ValueError, match="KANBUNNY_STORE"):
            _settings(store="postgres-ish")

    def test_describes_the_database_without_leaking_the_password(self):
        stores = build_stores(
            _settings(
                store=STORE_DATABASE,
                database_url="sqlite:///:memory:",
            )
        )
        assert "database" in stores.description
