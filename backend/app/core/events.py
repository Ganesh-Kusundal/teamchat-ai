"""The ONLY place SSE event names and envelopes are defined."""
from enum import Enum
from typing import Any, Dict, Optional


class EventType(str, Enum):
    CONNECTED = "CONNECTED"
    NEW_MESSAGE = "NEW_MESSAGE"
    MESSAGES_READ = "MESSAGES_READ"
    STREAM_CHUNK = "STREAM_CHUNK"
    TYPING_UPDATE = "TYPING_UPDATE"
    PRESENCE_SYNC = "PRESENCE_SYNC"
    PRESENCE_UPDATE = "PRESENCE_UPDATE"
    ROOM_CREATED = "ROOM_CREATED"
    MEMBER_ADDED = "MEMBER_ADDED"
    MEMBER_REMOVED = "MEMBER_REMOVED"


def event(ev: EventType, payload: Any, org_slug: str = "", target_user_id: Optional[str] = None) -> Dict[str, Any]:
    e: Dict[str, Any] = {"type": ev.value, "payload": payload}
    if org_slug:
        e["orgSlug"] = org_slug
    if target_user_id:
        e["targetUserId"] = target_user_id
    return e
