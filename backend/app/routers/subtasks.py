"""Subtask routes.

Every one of these returns the **parent task**, not the subtask, so the client can replace the task
in its state without merging a partial result. Subtasks are never addressable on their own.
"""

from fastapi import APIRouter, status

from ..auth import CurrentUserDep
from ..models import ErrorBody, SubtaskInput, SubtaskPatch, Task
from ..store import get_board_store

router = APIRouter(prefix="/api/tasks/{task_id}/subtasks", tags=["subtasks"])

ERRORS = {
    401: {"model": ErrorBody, "description": "Missing, malformed or expired bearer token."},
    404: {"model": ErrorBody, "description": "No such task or subtask."},
    422: {"model": ErrorBody, "description": "The body did not match the schema."},
}


@router.post(
    "",
    response_model=Task,
    status_code=status.HTTP_201_CREATED,
    operation_id="createSubtask",
    summary="Add a subtask",
    responses=ERRORS,
)
def create_subtask(task_id: str, body: SubtaskInput, user: CurrentUserDep) -> Task:
    return get_board_store().create_subtask(user.id, task_id, body.model_dump(by_alias=False))


@router.patch(
    "/{subtask_id}",
    response_model=Task,
    operation_id="updateSubtask",
    summary="Update a subtask",
    responses=ERRORS,
)
def update_subtask(
    task_id: str, subtask_id: str, body: SubtaskPatch, user: CurrentUserDep
) -> Task:
    return get_board_store().update_subtask(user.id, task_id, subtask_id, body.changes())


@router.delete(
    "/{subtask_id}",
    response_model=Task,
    operation_id="deleteSubtask",
    summary="Delete a subtask",
    responses={401: ERRORS[401], 404: ERRORS[404]},
)
def delete_subtask(task_id: str, subtask_id: str, user: CurrentUserDep) -> Task:
    """Returns the parent task rather than 204 — the client replaces the task from the response."""
    return get_board_store().delete_subtask(user.id, task_id, subtask_id)
