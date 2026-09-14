"""Token issuance.

openapi.yaml originally left this out of scope, on the grounds that it belongs to whatever auth
provider gets chosen. This service needs *something* to hand out tokens, so it implements the
smallest thing that works — username and password against an in-memory directory — and the
contract has been updated to match. Registration, refresh, password reset and account recovery are
still out of scope.
"""

from fastapi import APIRouter, status

from ..auth import CurrentUserDep, issue_token, users
from ..models import CurrentUser, ErrorBody, LoginRequest, TokenResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=TokenResponse,
    operation_id="login",
    summary="Exchange a username and password for a bearer token",
    status_code=status.HTTP_200_OK,
    responses={
        401: {"model": ErrorBody, "description": "The username and password do not match."},
        422: {"model": ErrorBody, "description": "The body did not match the schema."},
    },
)
def login(body: LoginRequest) -> TokenResponse:
    """Public.

    A wrong username and a wrong password give the same message and take the same time, so the
    response does not reveal which accounts exist.
    """
    user = users.authenticate(body.username, body.password)
    token, expires_in = issue_token(user)
    return TokenResponse(access_token=token, token_type="bearer", expires_in=expires_in)


@router.get(
    "/me",
    response_model=CurrentUser,
    operation_id="getCurrentUser",
    summary="Who the current token belongs to",
    responses={401: {"model": ErrorBody, "description": "Missing, malformed or expired token."}},
)
def get_current_user(user: CurrentUserDep) -> CurrentUser:
    """Lets a client check a stored token is still good without fetching the whole board."""
    return CurrentUser(id=user.id, username=user.username)
