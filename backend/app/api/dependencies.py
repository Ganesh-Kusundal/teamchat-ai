from fastapi import HTTPException, Security
from ..auth.dependencies import get_request_context
from ..models.schemas import RequestContext, Room
from ..services.chat_store import chat_store


def require_room_member(
    room_id: str,
    context: RequestContext = Security(get_request_context),
) -> Room:
    room = chat_store.get_room_by_id(room_id, context.org_slug)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found or access denied.")
    if context.uid not in room.memberIds:
        raise HTTPException(status_code=403, detail="You are not a member of this room.")
    return room
