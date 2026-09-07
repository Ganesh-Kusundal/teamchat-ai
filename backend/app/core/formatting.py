import re
import uuid

from .constants import AI_SENDER_NAME, ROOM_SNIPPET_MAX_CHARS


def room_snippet(sender_name: str, content: str, is_ai: bool) -> str:
    prefix = AI_SENDER_NAME.removesuffix(" AI") if is_ai else sender_name
    return f"{prefix}: {content[:ROOM_SNIPPET_MAX_CHARS]}..."


def slugify_room_name(name: str) -> str:
    # ponytail: one regex is the canonical rule; frontend NewRoomModal keeps its own (deferred codegen)
    return re.sub(r"[^a-z0-9_-]+", "-", name.strip().lower()).strip("-")


def make_room_id(org_slug: str) -> str:
    return f"room-{org_slug[:3]}-{uuid.uuid4().hex[:12]}"
