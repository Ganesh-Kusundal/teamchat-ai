### Task 1: `core/constants.py` — single-source shared backend values

**Files:**
- Create: `backend/app/core/__init__.py` (empty), `backend/app/core/constants.py`
- Modify: `backend/app/config.py:12` (delete `DEFAULT_BASE_RATE`), `backend/app/models/schemas.py:38`, `backend/app/services/chat_store.py` (13× `"password123"`, 4× strftime, typing TTL, grace, baseRate ×3), `backend/app/services/firestore_store.py` (4× strftime, typing TTL), `backend/app/services/clinical_engine.py:17,168,209`, `backend/app/services/memory_engine.py:8,95`, `backend/app/services/firestore_memory.py:105`, `backend/app/services/gemini_service.py:61,104,225-226`, `backend/app/api/routes_auth.py:15`, `backend/app/api/routes_messages.py:92`, `backend/app/api/routes_realtime.py:46`, `backend/app/main.py:56,59`
- Test: existing suite + grep audit

**Interfaces:**
- Consumes: `settings.VERSION` from `backend.app.config`
- Produces (later tasks import these exact names): `DEFAULT_BASE_RATE`, `DATASET_VERSION`, `AI_SENDER_ID`, `AI_SENDER_NAME`, `DEMO_PASSWORD`, `GEMINI_KEY_PLACEHOLDER`, `TYPING_TTL_SECONDS`, `SSE_OFFLINE_GRACE_SECONDS`, `utc_now_iso() -> str`

- [ ] **Step 1: Write a failing test that pins the module's existence and values**

Create `backend/tests/test_constants.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test 2>&1 | grep test_constants`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.app.core'`

- [ ] **Step 3: Write the module**

`backend/app/core/constants.py`:

```python
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
```

`backend/app/core/__init__.py`: empty file.

- [ ] **Step 4: Replace every duplicate site (import, then swap the literal)**

In each file add the import (adjust depth: services are `..core.constants`, api are `..core.constants`, models is `..core.constants`, main is `.core.constants`):

```python
from ..core.constants import (
    AI_SENDER_ID, AI_SENDER_NAME, DATASET_VERSION, DEFAULT_BASE_RATE,
    DEMO_PASSWORD, GEMINI_KEY_PLACEHOLDER, SSE_OFFLINE_GRACE_SECONDS,
    TYPING_TTL_SECONDS, utc_now_iso,
)
```
(only the names each file uses)

Exact replacements:
- `config.py`: delete line 12 `DEFAULT_BASE_RATE: float = 12000.0`
- `schemas.py:38`: `baseRate: Optional[float] = 12000.0` → `baseRate: Optional[float] = DEFAULT_BASE_RATE`
- `chat_store.py`: all 10 seed `passwordHash="password123"` → `passwordHash=DEMO_PASSWORD`; `:315` default `password: str = "password123"` → `password: str = DEMO_PASSWORD`; `:318` `or password == "password123"` → `or password == DEMO_PASSWORD`; 4× `time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())` → `utc_now_iso()`; `:577` `> 3.0` → `> TYPING_TTL_SECONDS`; `:616` `await asyncio.sleep(4.0)` → `await asyncio.sleep(SSE_OFFLINE_GRACE_SECONDS)`; `:26/:35/:44` `baseRate=12000.0` → `baseRate=DEFAULT_BASE_RATE`; `:346/:348` `[:45]` → `[:ROOM_SNIPPET_MAX_CHARS]`
- `firestore_store.py`: 4× strftime → `utc_now_iso()`; `:361` `<= 3` → `<= TYPING_TTL_SECONDS`
- `clinical_engine.py`: `:17` `DATASET_VERSION = settings.VERSION` → import from constants (delete local def); `:168` `base_rate: float = 12000.0` → `base_rate: float = DEFAULT_BASE_RATE`; `:209` `reason="Unknown ICD-10 code in teamchat-seed-2026.1"` → `reason=f"Unknown ICD-10 code in {DATASET_VERSION}"`
- `memory_engine.py`: `:8` delete local `DATASET_VERSION = settings.VERSION`, import from constants; `:95` strftime → `utc_now_iso()`
- `firestore_memory.py`: `:105` strftime → `utc_now_iso()`
- `gemini_service.py`: `:61` `"MY_GEMINI_API_KEY"` → `GEMINI_KEY_PLACEHOLDER`; `:104` `float(args.get("base_rate", 12000.0))` → `float(args.get("base_rate", DEFAULT_BASE_RATE))`; `:225-226` → `senderId=AI_SENDER_ID, senderName=AI_SENDER_NAME`
- `routes_auth.py:15`: `password: str = "password123"` → `password: str = DEMO_PASSWORD`
- `routes_messages.py:92`: strftime → `utc_now_iso()`
- `routes_realtime.py:46`: strftime → `utc_now_iso()`
- `main.py`: `:56` sentinel → `GEMINI_KEY_PLACEHOLDER`; `:59` strftime → `utc_now_iso()`

- [ ] **Step 5: Run tests + grep audit**

Run: `npm test`
Expected: 19 passed (17 baseline + 2 new)

Run: `grep -rn '12000\|password123\|%Y-%m-%dT%H\|gemini-ai\|MY_GEMINI_API_KEY' backend/app | grep -v core/constants.py`
Expected: empty output (frontend literals stay — deferred ceiling)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor: single-source shared constants in backend/app/core" && git push origin dev
```

---

