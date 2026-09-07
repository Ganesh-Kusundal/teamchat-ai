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
