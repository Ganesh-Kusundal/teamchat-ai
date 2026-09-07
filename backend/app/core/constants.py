"""Single source for cross-cutting values. Nothing outside this file may define them."""
import time

from ..config import settings

DEFAULT_BASE_RATE = 12000.0
DATASET_VERSION = settings.VERSION
AI_SENDER_ID = "gemini-ai"
AI_SENDER_NAME = "Gemini AI"
DEMO_PASSWORD = "password123"
GEMINI_KEY_PLACEHOLDER = "MY_GEMINI_API_KEY"
TYPING_TTL_SECONDS = 3.0
SSE_OFFLINE_GRACE_SECONDS = 4.0
ROOM_SNIPPET_MAX_CHARS = 45


def utc_now_iso() -> str:
    # ponytail: string timestamps, not datetime — compared lexicographically in chat_store.get_messages
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
