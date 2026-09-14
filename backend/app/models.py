"""Wire models.

Field names on the wire are camelCase, matching the TypeScript model in
`frontend/src/lib/board-data.ts` exactly. Python keeps snake_case internally; `to_camel` plus
`populate_by_name` bridges the two. Getting this wrong fails silently in the browser — TypeScript
cannot see a renamed field, it just reads `undefined` — so it is enforced in one base class rather
than per model.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class WireModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        use_enum_values=True,
    )


class Status(str, Enum):
    BACKLOG = "backlog"
    TODO = "todo"
    DOING = "doing"
    DONE = "done"


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


Title = Annotated[str, Field(min_length=1, max_length=200)]
Assignee = Annotated[str, Field(max_length=120)]
Detail = Annotated[str, Field(max_length=2000)]
Points = Annotated[int, Field(ge=0)]
ProjectName = Annotated[str, Field(min_length=1, max_length=120)]


class PatchModel(WireModel):
    """A partial update. `minProperties: 1` in the contract — an empty body is a mistake, not a
    no-op, so it is rejected rather than silently doing nothing."""

    @model_validator(mode="after")
    def _at_least_one_field(self):
        if not self.model_fields_set:
            raise ValueError("Send at least one field to change.")
        return self

    def changes(self) -> dict[str, Any]:
        """Only the fields the caller actually sent."""
        return self.model_dump(exclude_unset=True, by_alias=False)


# --- subtasks ----------------------------------------------------------------------------------


class Subtask(WireModel):
    id: str
    title: Title
    status: Status
    assignee: Assignee


class SubtaskInput(WireModel):
    title: Title
    status: Status
    assignee: Assignee


class SubtaskPatch(PatchModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: Status | None = None
    assignee: str | None = Field(default=None, max_length=120)


# --- tasks -------------------------------------------------------------------------------------


class Task(WireModel):
    id: str
    title: Title
    detail: Detail
    status: Status
    priority: Priority
    assignee: Assignee
    points: Points
    project_id: str
    subtasks: list[Subtask]
    depends_on: list[str]


class TaskInput(WireModel):
    """Creating a task. `id` and `subtasks` are the server's to assign."""

    # The contract allows an empty title here: the UI saves a blank form as "Untitled task", and
    # that defaulting is the server's job, not a validation error.
    title: Annotated[str, Field(max_length=200)]
    detail: Detail
    status: Status
    priority: Priority
    assignee: Assignee
    points: Points
    project_id: str
    depends_on: list[str]


class TaskPatch(PatchModel):
    title: str | None = Field(default=None, max_length=200)
    detail: str | None = Field(default=None, max_length=2000)
    status: Status | None = None
    priority: Priority | None = None
    assignee: str | None = Field(default=None, max_length=120)
    points: int | None = Field(default=None, ge=0)
    project_id: str | None = None
    depends_on: list[str] | None = None


# --- projects ----------------------------------------------------------------------------------


class Project(WireModel):
    id: str
    name: ProjectName
    hue: Annotated[int, Field(ge=0, le=359)]


class ProjectCreate(WireModel):
    name: ProjectName


class ProjectPatch(PatchModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


# --- auth --------------------------------------------------------------------------------------


class LoginRequest(WireModel):
    username: Annotated[str, Field(min_length=1, max_length=120)]
    password: Annotated[str, Field(min_length=1, max_length=256)]


class TokenResponse(WireModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = Field(description="Seconds until the token expires.")


class CurrentUser(WireModel):
    id: str
    username: str


# --- errors ------------------------------------------------------------------------------------


class ErrorBody(WireModel):
    """Every non-2xx response. `message` is user-facing prose — the frontend puts it straight into
    a toast — and `code` is what client code branches on."""

    code: str
    message: str
    details: dict[str, Any] | None = None


class HealthResponse(WireModel):
    status: str = "ok"
