"""Error types and the handlers that render them.

Every failure leaves the service in the `Error` shape from openapi.yaml: a machine-readable `code`,
a `message` written as a sentence for a person, and optional `details`. FastAPI's defaults produce
`{"detail": ...}` instead, so the handlers below replace them — including for request validation,
which would otherwise be the one response the frontend could not parse.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class BoardError(Exception):
    """Anything the API refuses, carrying the response it should become."""

    status_code = 400
    code = "internal_error"

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class NotFoundError(BoardError):
    status_code = 404
    code = "not_found"


class UnauthorizedError(BoardError):
    status_code = 401
    code = "unauthorized"


class ValidationError(BoardError):
    status_code = 422
    code = "validation_error"


class DependencyCycleError(BoardError):
    """A dependency edge that would close a loop. Nothing is written."""

    status_code = 409
    code = "dependency_cycle"


class SelfDependencyError(BoardError):
    status_code = 409
    code = "self_dependency"


def error_response(
    status_code: int, code: str, message: str, details: dict[str, Any] | None = None
) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    headers = {"WWW-Authenticate": "Bearer"} if status_code == 401 else None
    return JSONResponse(status_code=status_code, content=body, headers=headers)


def _first_validation_problem(exc: RequestValidationError) -> tuple[str, dict[str, Any] | None]:
    """Turn pydantic's error list into one sentence a person can act on."""
    errors = exc.errors()
    if not errors:
        return "That request body was not valid.", None

    first = errors[0]
    location = [str(part) for part in first.get("loc", ()) if part not in ("body", "query", "path")]
    field = ".".join(location) if location else None
    reason = first.get("msg", "is not valid")
    reason = reason.removeprefix("Value error, ")

    if field:
        message = f"{field} {reason[0].lower()}{reason[1:]}" if reason else f"{field} is not valid."
    else:
        message = reason

    if not message.endswith("."):
        message += "."
    return message, ({"field": field} if field else None)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(BoardError)
    async def _board_error(_: Request, exc: BoardError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.details)

    @app.exception_handler(RequestValidationError)
    async def _request_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        message, details = _first_validation_problem(exc)
        return error_response(422, "validation_error", message, details)

    @app.exception_handler(StarletteHTTPException)
    async def _http_exception(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        # Covers the responses Starlette raises itself — 404 for an unknown path, 405, and the
        # 403 that HTTPBearer raises when the header is missing entirely.
        code = {
            401: "unauthorized",
            403: "unauthorized",
            404: "not_found",
        }.get(exc.status_code, "internal_error")
        status = 401 if exc.status_code == 403 else exc.status_code
        message = exc.detail if isinstance(exc.detail, str) else "That request could not be served."
        if status == 401:
            message = "Sign in to see this board."
        return error_response(status, code, message)
