from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from ..models.schemas import Organization, UserProfile, RequestContext
from ..services.chat_store import chat_store
from ..auth.dependencies import get_request_context

router = APIRouter(tags=["Authentication & Organizations"])

class LoginRequest(BaseModel):
    email: str
    password: str = "password123"

@router.get("/orgs", response_model=List[Organization])
async def get_organizations():
    return chat_store.get_organizations()

@router.post("/auth/login")
async def login(req: LoginRequest):
    if not req.email:
        raise HTTPException(status_code=400, detail="Email is required.")

    user = chat_store.authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please select one of the pre-seeded test accounts.",
        )

    # Update presence
    chat_store.update_presence(user.id, user.orgSlug, True)
    org = chat_store.get_organization_by_slug(user.orgSlug)

    return {
        "token": user.id,
        "user": user.to_public(),   # passwordHash excluded
        "organization": org.model_dump() if org else None,
    }

@router.get("/auth/me")
async def get_me(context: RequestContext = Depends(get_request_context)):
    user = chat_store.get_user_by_id(context.uid)
    org = chat_store.get_organization_by_slug(context.org_slug)
    online_members = chat_store.get_online_users_in_org(context.org_slug)
    return {
        "user": user.to_public() if user else None,          # passwordHash excluded
        "organization": org.model_dump() if org else None,
        "onlineMembers": [m.model_dump() for m in online_members],  # PresenceRecord has no passwordHash
    }

@router.get("/org/users")
async def get_org_users(context: RequestContext = Depends(get_request_context)):
    users = chat_store.get_users_by_org(context.org_slug)
    return [u.to_public() for u in users]  # passwordHash excluded
