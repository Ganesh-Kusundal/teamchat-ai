from backend.app.core.constants import (
    DEFAULT_BASE_RATE, DATASET_VERSION, AI_SENDER_ID, AI_SENDER_NAME,
    DEMO_PASSWORD, utc_now_iso,
)
from backend.app.config import settings


def test_constants_single_source():
    assert DEFAULT_BASE_RATE == 12000.0
    assert DATASET_VERSION == settings.VERSION
    assert AI_SENDER_ID == "gemini-ai"
    assert AI_SENDER_NAME == "Gemini AI"
    assert DEMO_PASSWORD == "password123"


def test_utc_now_iso_format_is_sortable():
    ts = utc_now_iso()
    assert len(ts) == 20 and ts.endswith("Z") and ts[10] == "T"
    assert "2026-" in ts  # ponytail: format is load-bearing for lexicographic ordering


def test_streaming_completion_strips_tool_code_tags():
    import asyncio

    from backend.app.services.chat_store import chat_store
    from backend.app.models.schemas import Message

    msg = Message(id="m-t", roomId="room-nor-001", orgSlug="northside-health", senderId="gemini-ai",
                  senderName="Gemini AI", isAi=True, content="before <tool_code>x</tool_code>",
                  timestamp="2026-01-01T00:00:00Z", isStreaming=True)
    chat_store.messages.append(msg)

    async def _run():
        chat_store.update_streaming_message("m-t", "room-nor-001", "northside-health", "", True, [])
        await asyncio.sleep(0)

    asyncio.run(_run())
    assert chat_store.messages[-1].content == "before x"
