import asyncio
import re
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from ..core.constants import AI_SENDER_ID, utc_now_iso
from ..models.schemas import (
    Message,
    Room,
    SendMessageRequest,
    TypingStatusRequest,
    PresenceUpdateRequest,
    RequestContext,
)
from ..services.chat_store import chat_store
from ..services.gemini_service import handle_ai_invocation
from ..auth.dependencies import get_request_context
from .dependencies import require_room_member

router = APIRouter(tags=["Messages & Collaboration"])

@router.get("/rooms/{room_id}/messages", response_model=List[Message])
async def get_messages(
    room_id: str,
    limit: int = Query(50, ge=1, le=100),
    before: Optional[str] = None,
    context: RequestContext = Depends(get_request_context),
    room: Room = Security(require_room_member),
):
    # Mark read
    chat_store.mark_messages_as_read(room_id, context.org_slug, context.uid)
    return chat_store.get_messages(room_id, context.org_slug, limit=limit, before=before)

@router.post("/rooms/{room_id}/read")
async def mark_room_read(
    room_id: str,
    context: RequestContext = Depends(get_request_context),
    room: Room = Security(require_room_member),
):
    res = chat_store.mark_messages_as_read(room_id, context.org_slug, context.uid)
    return {"ok": True, "result": res}

@router.post("/rooms/{room_id}/messages", response_model=Message, status_code=status.HTTP_201_CREATED)
async def send_message(
    room_id: str,
    req: SendMessageRequest,
    context: RequestContext = Depends(get_request_context),
    room: Room = Security(require_room_member),
):
    if not req.content or not req.content.strip():
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    user = chat_store.get_user_by_id(context.uid)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session user.")

    # Clear typing for sender
    chat_store.clear_typing(user.id, room_id, context.org_slug)

    # Detect AI mention
    clean_content = req.content.strip()
    mentions_ai = bool(
        re.search(r"@(?:gemini|ai)\b", clean_content, re.IGNORECASE)
        or clean_content.startswith("/gemini")
        or clean_content.startswith("/ai")
        or clean_content.startswith("/ask")
    )

    msg_id = f"msg-{uuid.uuid4().hex}"
    user_message = Message(
        id=msg_id,
        roomId=room_id,
        orgSlug=context.org_slug,
        senderId=user.id,
        senderName=user.name,
        senderRole=user.role,
        isAi=False,
        content=clean_content,
        timestamp=utc_now_iso(),
        mentionsAi=mentions_ai,
        replyToId=req.replyToId,
        replyToSnippet=req.replyToSnippet,
        clientMessageId=req.clientMessageId,
    )

    saved_message = chat_store.add_message(user_message)

    # If AI mentioned, launch background generation
    if mentions_ai and chat_store.claim_ai_invocation(saved_message.id):
        chat_store.set_typing(AI_SENDER_ID, "Gemini AI (Thinking...)", room_id, context.org_slug)
        asyncio.create_task(
            handle_ai_invocation(
                room_id=room_id,
                org_slug=context.org_slug,
                room_name=room.name,
                trigger_message=saved_message,
                caller_user=user,
            )
        )

    return saved_message

@router.post("/rooms/{room_id}/typing")
async def set_typing_status(
    room_id: str,
    req: TypingStatusRequest,
    context: RequestContext = Depends(get_request_context),
    room: Room = Security(require_room_member),
):
    user = chat_store.get_user_by_id(context.uid)
    if user:
        if req.isTyping:
            chat_store.set_typing(user.id, user.name, room_id, context.org_slug)
        else:
            chat_store.clear_typing(user.id, room_id, context.org_slug)
    return {"ok": True}

@router.get("/presence")
async def get_presence_status(
    context: RequestContext = Depends(get_request_context),
):
    online_members = chat_store.get_online_users_in_org(context.org_slug)
    return [m.model_dump() for m in online_members]

@router.post("/presence")
async def update_presence_status(
    req: PresenceUpdateRequest,
    context: RequestContext = Depends(get_request_context),
):
    chat_store.update_presence(context.uid, context.org_slug, req.isOnline, req.currentRoomId)
    return {"ok": True}

