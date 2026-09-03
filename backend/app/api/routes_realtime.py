import json
import time
import asyncio
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, status
from fastapi.responses import StreamingResponse
from ..services.chat_store import chat_store

router = APIRouter(tags=["Real-Time Events"])

@router.get("/events")
async def events_stream(request: Request, token: Optional[str] = None, roomId: Optional[str] = None):
    # Extract token from query or header
    auth_token = token or request.headers.get("x-user-id")
    if not auth_token and request.headers.get("authorization"):
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            auth_token = auth_header[7:]

    if not auth_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token required for real-time events.")

    user = chat_store.get_user_by_id(auth_token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user session.")

    client_id = f"client-{int(time.time() * 1000)}-{user.id[-4:]}"
    if roomId:
        room = chat_store.get_room_by_id(roomId, user.orgSlug)
        if not room or user.id not in room.memberIds:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not a member of this room.")
    sse_client = chat_store.register_sse_client(client_id, user.id, user.orgSlug, roomId)

    async def event_generator():
        try:
            # 1. Initial Connection Event
            init_payload = {
                "type": "CONNECTED",
                "payload": {
                    "clientId": client_id,
                    "userId": user.id,
                    "orgSlug": user.orgSlug,
                    "serverTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
            }
            yield f"data: {json.dumps(init_payload)}\n\n"

            # 2. Main event loop with periodic 15s heartbeat
            last_heartbeat = time.time()
            while True:
                if await request.is_disconnected():
                    break

                try:
                    # Wait for next event or 2s timeout to check heartbeat
                    event = await asyncio.wait_for(sse_client.queue.get(), timeout=2.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    pass

                now = time.time()
                if now - last_heartbeat >= 15.0:
                    yield ": heartbeat\n\n"
                    last_heartbeat = now

        except asyncio.CancelledError:
            pass
        finally:
            chat_store.remove_sse_client(client_id)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
