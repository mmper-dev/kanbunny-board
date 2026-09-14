from fastapi import APIRouter, status

from ..auth import CurrentUserDep
from ..models import ErrorBody, Project, ProjectCreate, ProjectPatch
from ..store import store

router = APIRouter(prefix="/api/projects", tags=["projects"])

ERRORS = {
    401: {"model": ErrorBody, "description": "Missing, malformed or expired bearer token."},
    404: {"model": ErrorBody, "description": "No such project, or it is not the caller's."},
    422: {"model": ErrorBody, "description": "The body did not match the schema."},
}


@router.get(
    "",
    response_model=list[Project],
    operation_id="listProjects",
    summary="List every project",
    responses={401: ERRORS[401]},
)
def list_projects(user: CurrentUserDep) -> list[Project]:
    return store.list_projects(user.id)


@router.post(
    "",
    response_model=Project,
    status_code=status.HTTP_201_CREATED,
    operation_id="createProject",
    summary="Create a project",
    responses={401: ERRORS[401], 422: ERRORS[422]},
)
def create_project(body: ProjectCreate, user: CurrentUserDep) -> Project:
    """`hue` is assigned here, not by the client — the UI has no colour picker."""
    return store.create_project(user.id, body.name)


@router.patch(
    "/{project_id}",
    response_model=Project,
    operation_id="updateProject",
    summary="Update a project",
    responses=ERRORS,
)
def update_project(project_id: str, body: ProjectPatch, user: CurrentUserDep) -> Project:
    return store.update_project(user.id, project_id, body.changes())


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteProject",
    summary="Delete a project and its tasks",
    responses={401: ERRORS[401], 404: ERRORS[404]},
)
def delete_project(project_id: str, user: CurrentUserDep) -> None:
    """Cascades: the project's tasks go, and references to them are pruned from survivors."""
    store.delete_project(user.id, project_id)
