from fastapi import APIRouter, status

from ..auth import CurrentUserDep
from ..models import ErrorBody, Task, TaskInput, TaskPatch
from ..store import get_board_store

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

ERRORS = {
    401: {"model": ErrorBody, "description": "Missing, malformed or expired bearer token."},
    404: {"model": ErrorBody, "description": "No such task, or it is not the caller's."},
    409: {"model": ErrorBody, "description": "The edge would break the dependency graph."},
    422: {"model": ErrorBody, "description": "The body did not match the schema."},
}


@router.get(
    "",
    response_model=list[Task],
    operation_id="listTasks",
    summary="List every task",
    responses={401: ERRORS[401]},
)
def list_tasks(user: CurrentUserDep) -> list[Task]:
    """The whole board: subtasks embedded, dependency ids included.

    No filtering by project or status — the UI filters client-side, and the dependency graph needs
    the complete set to compute its layers and the critical path.
    """
    return get_board_store().list_tasks(user.id)


@router.post(
    "",
    response_model=Task,
    status_code=status.HTTP_201_CREATED,
    operation_id="createTask",
    summary="Create a task",
    responses={401: ERRORS[401], 404: ERRORS[404], 422: ERRORS[422]},
)
def create_task(body: TaskInput, user: CurrentUserDep) -> Task:
    return get_board_store().create_task(user.id, body.model_dump(by_alias=False))


@router.patch(
    "/{task_id}",
    response_model=Task,
    operation_id="updateTask",
    summary="Update a task",
    responses=ERRORS,
)
def update_task(task_id: str, body: TaskPatch, user: CurrentUserDep) -> Task:
    """Partial update. Dragging a card between lanes sends `{"status": "doing"}` and nothing else.

    A `dependsOn` that would close a loop is refused with 409 and writes nothing. The client runs
    the same check before sending, but this is the enforcement — a diamond is not a loop and is
    accepted.
    """
    return get_board_store().update_task(user.id, task_id, body.changes())


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteTask",
    summary="Delete a task",
    responses={401: ERRORS[401], 404: ERRORS[404]},
)
def delete_task(task_id: str, user: CurrentUserDep) -> None:
    """Cascades: the id is pruned from every other task's dependsOn, so nothing dangles."""
    get_board_store().delete_task(user.id, task_id)
