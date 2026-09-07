from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Security, status
from ..models.schemas import Room, CreateRoomRequest, AddMemberRequest, RequestContext
from ..services.chat_store import chat_store
from ..auth.dependencies import get_request_context, require_admin
from .dependencies import require_room_member

router = APIRouter(prefix="/rooms", tags=["Rooms & Membership"])

@router.get("", response_model=List[Room])
async def get_rooms(context: RequestContext = Depends(get_request_context)):
    rooms = chat_store.get_rooms_by_org(context.org_slug, user_id=context.uid)
    return [room for room in rooms if context.uid in room.memberIds]

@router.post("", response_model=Room, status_code=status.HTTP_201_CREATED)
async def create_room(
    req: CreateRoomRequest,
    context: RequestContext = Depends(get_request_context),
):
    if not req.name or not req.name.strip():
        raise HTTPException(status_code=400, detail="Room name is required.")

    if context.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required to create rooms.")
    requested_members = req.memberIds or []
    org_user_ids = {user.id for user in chat_store.get_users_by_org(context.org_slug)}
    if any(user_id not in org_user_ids for user_id in requested_members):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All room members must belong to your organization.")
    member_ids = list(dict.fromkeys([context.uid, *requested_members]))
    new_room = chat_store.create_room(
        org_slug=context.org_slug,
        name=req.name,
        description=req.description or "",
        created_by=context.uid,
        is_private=bool(req.isPrivate),
        member_ids=member_ids or None,
    )
    return new_room

@router.get("/{room_id}", response_model=Room)
async def get_room_details(
    room_id: str,
    context: RequestContext = Depends(get_request_context),
    room: Room = Security(require_room_member),
):
    return room

@router.get("/{room_id}/members")
async def get_room_members(
    room_id: str,
    context: RequestContext = Depends(get_request_context),
    room: Room = Security(require_room_member),
):
    members = [chat_store.get_user_by_id(uid) for uid in room.memberIds]
    return [m.to_public() for m in members if m]

@router.post("/{room_id}/members")
async def add_room_member(
    room_id: str,
    req: AddMemberRequest,
    context: RequestContext = Depends(get_request_context),
):
    if context.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required to manage room members.")
    success = chat_store.add_room_member(room_id, context.org_slug, req.userId)
    if not success:
        raise HTTPException(status_code=400, detail="Could not add user to room (invalid room or user).")
    return {"ok": True, "message": f"User {req.userId} added to room {room_id}."}

@router.delete("/{room_id}/members/{user_id}")
async def remove_room_member(
    room_id: str,
    user_id: str,
    context: RequestContext = Depends(get_request_context),
):
    if context.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required to manage room members.")
    if user_id == context.uid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot remove yourself from a room.")
    success = chat_store.remove_room_member(room_id, context.org_slug, user_id)
    if not success:
        raise HTTPException(status_code=400, detail="Could not remove user from room.")
    return {"ok": True, "message": f"User {user_id} removed from room {room_id}."}
