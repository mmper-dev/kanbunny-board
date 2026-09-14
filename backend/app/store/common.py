"""Shared by every store implementation.

Id generation and the acyclic rule live here rather than in one backend, so the memory store and
the SQL store cannot drift on the behaviour the frontend depends on.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from ..errors import DependencyCycleError, SelfDependencyError


@dataclass
class User:
    id: str
    username: str
    password_hash: bytes


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


def assert_acyclic(edges: dict[str, list[str]], task_id: str, depends_on: list[str]) -> None:
    """Refuse a dependency list that would close a loop.

    `edges` maps every task id to what it currently waits on. Walks each proposed dependency
    backwards: reaching `task_id` means the new edge completes a cycle.

    A diamond (A→B, A→C, B→D, C→D) visits D by two routes but never arrives back at the task being
    edited, so it is accepted — that is the case a naive "have I seen this node" check rejects by
    mistake.
    """
    if task_id in depends_on:
        raise SelfDependencyError(f"{task_id} cannot wait on itself.", {"taskId": task_id})

    def reaches(start: str, target: str) -> bool:
        seen: set[str] = set()
        stack = [start]
        while stack:
            current = stack.pop()
            if current == target:
                return True
            if current in seen:
                continue
            seen.add(current)
            stack.extend(edges.get(current, ()))
        return False

    offenders = sorted({d for d in depends_on if reaches(d, task_id)})
    if offenders:
        names = ", ".join(offenders)
        raise DependencyCycleError(
            f"That would make a loop — {names} already waits on {task_id}.",
            {"taskId": task_id, "conflictsWith": offenders},
        )
