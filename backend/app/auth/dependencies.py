"""
Request context resolution with dual-mode authentication.

Mode 1 — Firebase Auth (production):
  Active when FIREBASE_PROJECT_ID env var is set.
  Verifies the incoming Bearer token as a Firebase ID token.
  org_slug is derived from custom claims on the token (set during user creation).
  Never falls back to demo-token lookup when Firebase mode is enabled.

Mode 2 — Demo token (local evaluation):
  Active when FIREBASE_PROJECT_ID is not set (default).
  Bearer token == user.id (the seed user identifier).
  org_slug is always derived from the authenticated user record on the server,
  never trusted from client payload or LLM tool arguments.
"""
from typing import Optional
from fastapi import Request, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.concurrency import run_in_threadpool
from ..models.schemas import RequestContext, UserProfile
from ..services.chat_store import chat_store
from ..config import settings
from .firebase import verify_firebase_token

security = HTTPBearer(auto_error=False)


def resolve_user_from_token(token: str) -> Optional[UserProfile]:
    """
    Resolve a UserProfile from a bearer token.

    1. If FIREBASE_PROJECT_ID is set, verify the Firebase ID token and map its
       email or UID to the server-side organization user record.
    2. Otherwise resolve the local demo token (token == user.id).
    """
    # --- Mode 1: Firebase Auth ---
    if settings.FIREBASE_PROJECT_ID:
        claims = verify_firebase_token(token)
        if claims:
            uid = claims.get("uid", "")
            email = claims.get("email", "")
            claimed_org = claims.get("orgId")
            # Match by email first (works even if UIDs differ between Firebase projects),
            # but require the provisioned server record to agree with the custom claim.
            if email:
                user = chat_store.get_user_by_email(email)
                if user and claimed_org and user.orgSlug == claimed_org:
                    return user
            # Fall back to UID match
            user = chat_store.get_user_by_id(uid)
            if user and claimed_org and user.orgSlug == claimed_org:
                return user
            # Firebase token is valid but user not in our seed — reject.
            return None
        # Production authentication must never fall through to demo tokens.
        return None

    # --- Mode 2: Demo token (user.id as Bearer) ---
    return chat_store.get_user_by_id(token)


def token_from_request(request: Request, query_token: Optional[str] = None) -> Optional[str]:
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    if "x-user-id" in request.headers:
        return request.headers.get("x-user-id")
    return query_token


async def get_request_context(
    request: Request,
    auth: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> RequestContext:
    token = None
    if auth and auth.credentials:
        token = auth.credentials
    if not token:
        token = token_from_request(request)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHENTICATED", "message": "Missing authentication token."}},
        )

    user = await run_in_threadpool(resolve_user_from_token, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "UNAUTHENTICATED", "message": "Invalid or expired session token."}},
        )

    # org_slug is ALWAYS derived from the authenticated server-side user record.
    # It is never read from client headers, query params, or LLM tool arguments.
    return RequestContext(
        uid=user.id,
        email=user.email,
        org_id=user.orgSlug,
        org_slug=user.orgSlug,
        role=user.role,
    )


def require_admin(context: RequestContext = Security(get_request_context)) -> RequestContext:
    if context.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Admin privileges required for this action."}},
        )
    return context
