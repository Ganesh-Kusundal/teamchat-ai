# Task 5 Report: auth boundary fixes — no private imports, no engine reach-through

**Status:** NEEDS_CONTEXT (all implementation + verification done; **not committed** — see Blocker)
**Commit:** none — changes verified in working tree, ready to commit with the brief's exact message
**Tests:** 32 passed, 1 hangs forever (`test_realtime_stream_accepts_bearer`) — brief's Step-4 count (32/33 passed) unattainable with that test as specified

---

## Blocker (the one thing needing a decision)

The brief's third test hangs indefinitely instead of passing:

```python
def test_realtime_stream_accepts_bearer(client: TestClient, northside_headers):
    with client.stream("GET", "/api/events", headers=northside_headers) as res:
        assert res.status_code == 200
```

**Exact behavior (not papered over, test left verbatim):**

- `test_bearer_wins_over_everything` / `test_x_user_id_then_query` PASS.
- `test_realtime_stream_accepts_bearer` blocks **inside `client.stream(...).__enter__`** — the `assert res.status_code == 200` on line 25 is never reached. `npm test` never terminates (no pytest-timeout installed; venv: pytest 9.1.1, starlette 1.6.0, httpx 0.28.1). Killed externally after 30s.
- pytest's built-in faulthandler dump at 15s pins it precisely: main thread in `httpx/_client.py:868 stream` → `starlette/testclient.py:351 handle_request` → `anyio.from_thread.py:340 call` → `result.wait()`; portal thread running the asyncio loop (the app).
- **Root cause:** starlette 1.6.0's `TestClient` transport runs the ASGI app **to completion** (`portal.call(self.app, ...)`) and buffers the whole body into an `io.BytesIO` before returning any response. `/api/events` is an infinite generator (2s queue timeout loop + 15s heartbeats; the transport's `receive()` only yields `http.disconnect` after a `more_body: False` chunk, which never comes, so `request.is_disconnected()` never fires). The app never completes → `handle_request` never returns → hang. This is a TestClient-buffering artifact, not an app or auth regression.
- **Proof the implementation is correct** (raw-ASGI probe against the real app, Bearer header, no TestClient):
  ```
  response.start status: 200
  media_type header: text/event-stream; charset=utf-8
  first body chunk: b'data: {"type": "CONNECTED", "payload": {"clientId": "client-c98ed58605fb41a7aedb'
  more_body on first chunk: True
  chat_store sse clients after probe: []
  ```
  i.e. the SSE endpoint starts (200) with Bearer auth and cleans up its SSE client on disconnect — exactly what the brief's test wants to assert.
- Reproduced standalone with a minimal infinite-SSE app on this venv → identical hang → behavior is starlette-1.6.0-TestClient-vs-infinite-stream, independent of this codebase.

**Options for the orchestrator:**

1. **Raw-ASGI variant** of the third test (open app directly, capture `http.response.start`, assert 200, send disconnect) — proven to work by the probe above; keeps the coverage ("realtime accepts Bearer") without the broken pattern.
2. **httpx2** (2.12.0, on the index; starlette 1.6.0's TestClient emits "install `httpx2` instead" deprecation warning) — possibly streams incrementally; unverified here, adds a dependency (outside this task's mandate).
3. Commit as-is and accept that every `npm test` hangs forever — breaks Tasks 6+ and all future baseline runs.
4. Drop the third test — loses the auth-order coverage this task exists to add.

Everything else is done and green. One word back and I commit in seconds.

---

## Per-file changes

### Created

**`backend/tests/test_token_extraction.py`** (new, 27 lines, 3 tests) — verbatim from the brief:
- `test_bearer_wins_over_everything` — `Authorization: Bearer abc` + `x-user-id` + `?token=q` → `"abc"` (order enforced).
- `test_x_user_id_then_query` — `x-user-id` → `"usr-1"`; `?token=q` → `"q"`; none → `None`.
- `test_realtime_stream_accepts_bearer` — see Blocker.

### Modified

**`backend/app/auth/dependencies.py`**
- `:28` — renamed `def _resolve_user_from_token` → `def resolve_user_from_token` (public API); body untouched.
- `:80` → now `:87` — call site updated to `run_in_threadpool(resolve_user_from_token, token)`.
- Added `token_from_request(request, query_token=None)` above `get_request_context` — verbatim from the brief: Bearer (`auth_header[7:]`) > `x-user-id` header > `query_token`.
- `get_request_context` token block (`:66-73` old) replaced with the brief's exact snippet:
  ```python
  token = None
  if auth and auth.credentials:
      token = auth.credentials
  if not token:
      token = token_from_request(request)
  ```
  (The `token: Optional[str] = None` annotation became plain `token = None` per the brief's verbatim snippet.)

**`backend/app/api/routes_realtime.py`**
- Import `:10` — `from ..auth.dependencies import _resolve_user_from_token` → `from ..auth.dependencies import resolve_user_from_token, token_from_request` (private import gone).
- `:16-28` — manual query-then-header parsing (incl. the `# Extract token from query or header` comment) replaced with the brief's exact block: `auth_token = token_from_request(request, token)`; same 401 `detail="Token required for real-time events."`; `user = await run_in_threadpool(resolve_user_from_token, auth_token)`. The trailing `if not user: 401 "Invalid user session."` and everything after are unchanged.

**`backend/app/services/clinical_engine.py`**
- Added `get_patients_for_org(self, org_slug: str) -> List[Patient]` directly after `lookup_condition_code` (before `calculate_risk_score`), verbatim from the brief. `List`/`Patient` were already imported.

**`backend/app/api/routes_tools.py`**
- `:26` — `clinical_engine.patients` reach-through → `clinical_engine.get_patients_for_org(context.org_slug)`. Output identical (same filter, now encapsulated).

**`backend/tests/test_production_boundaries.py`**
- 3× `dependencies._resolve_user_from_token` → `dependencies.resolve_user_from_token` (`:11`, `:22`, `:37`). Nothing else touched.

---

## Red / Green evidence

**RED (Step 2)** — after writing the test file, before implementing:

```
E   ImportError: cannot import name 'token_from_request' from 'backend.app.auth.dependencies' (/Users/apple/Downloads/teamchat-ai/backend/app/auth/dependencies.py)
=========================== short test summary info ============================
ERROR backend/tests/test_token_extraction.py
!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
========================= 2 warnings, 1 error in 0.13s =========================
```

Matches the brief's expected failure exactly.

**GREEN (Step 4)** — full suite (`PYTHONPATH=. ./.venv/bin/pytest backend/tests/ -v`, the `npm test` command) reaches **32 passed, then hangs on the 33rd** (alphabetically last file); killed externally after 25s. Test tail verbatim:

```
backend/tests/test_tenant_isolation.py::test_room_tenant_isolation PASSED [ 87%]
backend/tests/test_tenant_isolation.py::test_shared_memory_key_isolation PASSED [ 90%]
backend/tests/test_token_extraction.py::test_bearer_wins_over_everything PASSED [ 93%]
backend/tests/test_token_extraction.py::test_x_user_id_then_query PASSED [ 96%]
backend/tests/test_token_extraction.py::test_realtime_stream_accepts_bearer Timeout (0:00:10)!
Thread 0x0000... (most recent call first):
  ...httpx/_client.py:868 in stream
  ...starlette/testclient.py:351 in handle_request
  ...anyio/from_thread.py:340 in call
  backend/tests/test_token_extraction.py:25 in test_realtime_stream_accepts_bearer
```

Breakdown: 30 pre-existing (incl. the 3 renamed `test_production_boundaries` tests and `test_tenant_isolation` covering the `/api/patients` change — all green) + 2 of 3 new. The 33rd hangs per the Blocker section. Baseline before this task: 30 passed (matches the orchestrator's stated baseline).

**Functional parity probe** (raw ASGI, real app): `/api/events` + Bearer → 200, `text/event-stream`, CONNECTED first chunk, SSE client cleaned up on disconnect — see Blocker.

---

## Greps

**Brief Step 4 grep** — `grep -rn "_resolve_user_from_token\|clinical_engine.patients" backend/app backend/tests` → **empty** over source (exit 1 with `--include="*.py"`). Note: a bare grep also matched `backend/tests/__pycache__/test_production_boundaries.cpython-313.pyc` — stale bytecode, gitignored/untracked, regenerated on next run; not source.

**Single-source header parsing** — `grep -rn "x-user-id" backend/app` → only `dependencies.py:66-67` (inside `token_from_request`). No other module parses auth headers manually anymore.

**Query-token consumers (behavior-delta check)** — `token=` in `src/` → only `ChatContext.tsx:232` SSE URL (`/api/events?token=...`), which the realtime route still honors via `token_from_request(request, token)`. `?token=` in `backend/tests` → none. So the brief-defined get_request_context change (query token no longer accepted on regular routes) breaks no test and no frontend call path.

---

## Self-review

- All four auth surfaces now use the one shared extractor; extraction order is **Bearer > x-user-id > query** everywhere (SSE route passes its `token` query param as `query_token`; regular routes pass none). The old realtime order was query > x-user-id > Bearer — the flip is the brief's mandated global constraint.
- **Deliberate behavior deltas (both brief-defined, documented):**
  1. Regular routes (`get_request_context`) no longer accept `?token=` query auth — the brief's snippet calls `token_from_request(request)` with no `query_token`. Frontend regular calls use Bearer; only SSE used query tokens and it still works. No test pinned the old behavior.
  2. SSE route: a request carrying both a Bearer header and `?token=` now authenticates as the Bearer identity (was: query wins).
- No HTTP status codes or error strings changed anywhere: realtime keeps `401` + `"Token required for real-time events."` / `"Invalid user session."`; dependencies' UNAUTHENTICATED/FORBIDDEN payloads untouched (diff-verified byte-identical).
- Comment hygiene: zero comments added; the one dead comment died with its code block. Pre-existing comments (`# Strictly scoped by caller's org_slug!`, docstrings, firebase-mode markers) untouched.
- No comments beyond code removal; no `# ponytail:` markers were specified for this task, none added.
- `chat_store.py` / `gemini_service.py` untouched (in-flight AI-thinking WIP preserved) — `git diff --stat` shows exactly the 5 intended files.
- Import hygiene: routes_realtime still uses `Request`/`status`/`run_in_threadpool` (all referenced); dependencies' `Optional` still used by signatures. Nothing orphaned.
- `require_room_member` (Task 4, `backend/app/api/dependencies.py`) untouched, per instructions.
- Nothing staged, nothing committed. Frontend WIP (`src/*`) and `.superpowers/` artifacts untouched/unstaged. The brief's `git add -A` was deliberately NOT run (would stage frontend WIP; and the commit is held anyway per the Blocker).

---

## Test tail (for the record)

Best achievable green tail with the brief's test file verbatim (suite does not terminate; this is the 32-passed state before the hang, captured with external watchdog + pytest `faulthandler_timeout`):

```
backend/tests/test_token_extraction.py::test_bearer_wins_over_everything PASSED [ 93%]
backend/tests/test_token_extraction.py::test_x_user_id_then_query PASSED [ 96%]
backend/tests/test_token_extraction.py::test_realtime_stream_accepts_bearer Timeout (0:00:10)!
<thread dump: main thread parked in httpx stream -> starlette testclient handle_request:351 -> portal result.wait()>
(killed externally at +25s; suite never printed a summary line)
```

---

## Final status (post-decision)

**Orchestrator decision:** Option 1 — raw-ASGI variant. No httpx2, test not dropped, hanging variant never committed.

**Committed:** `99b82ae` — `refactor: public token-resolution API; realtime uses shared extraction; engine encapsulation` (pushed to `origin/dev`, 6 files exactly as instructed; `src/*` WIP and `.superpowers/` artifacts never staged).

**Tests:** **33 passed, 2 warnings in 0.30s** (30 baseline + 3 new).

**Third test as committed** (`test_realtime_stream_accepts_bearer` in `backend/tests/test_token_extraction.py`):
- Drives the ASGI app directly per the probe: scope with `authorization: Bearer usr-sarah`; `receive()` sleeps 0.2s then returns `{"type": "http.disconnect"}` (the probe's exact sequencing — lets the stream emit `http.response.start` + first chunks, then disconnects; note the decision sketch's `yield_done` receive would have re-hung, since it never yields a disconnect, so the probe mechanics were used as instructed); `send()` records `http.response.start`'s status; app awaited under `anyio.move_on_after(2.0)` so worst case the test fails fast instead of hanging.
- Asserts `anyio.run(_sse_start_status) == 200`.
- Carries the orchestrator-specified comment verbatim; the now-unused `from starlette.testclient import TestClient` import was removed (orphaned by the fixture-less test, per repo import-hygiene convention); first two tests untouched.

**Flakiness evidence — 3 consecutive runs of the file:**

```
======================== 3 passed, 2 warnings in 0.23s =========================
======================== 3 passed, 2 warnings in 0.22s =========================
======================== 3 passed, 2 warnings in 0.22s =========================
```

**Full-suite tail (Step 4, `npm test`):**

```
======================== 33 passed, 2 warnings in 0.30s ========================
```

**Task 5: DONE.** Red (ImportError) → green (33 passed) per brief; Step-4 grep empty over source; no HTTP status/error-string changes; extraction order Bearer > x-user-id > query everywhere.

## Fix follow-up: query-token parity

**Issue:** Task 5's `get_request_context` fallback `token_from_request(request)` dropped `?token=` input on regular routes (original code accepted it; only `/api/events` passes a query token) — auth INPUT regression.

**Fix:** `backend/app/auth/dependencies.py` fallback line → `token = token_from_request(request, request.query_params.get("token"))`. Precedence unchanged: Bearer > x-user-id > query.

**Test:** appended `test_query_token_still_authenticates_regular_routes` (verbatim from orchestrator: `client.get("/api/orgs", params={"token": "usr-sarah"})` → 200) to `backend/tests/test_token_extraction.py`; `TestClient` import restored at top.

**Evidence:** `npm test` → `34 passed, 2 warnings in 0.31s` (33 + 1 new). Standalone rerun: `4 passed, 2 warnings in 0.23s`, new test PASSED.

**Committed:** `657e530` — `fix: preserve query-token auth input on regular routes` (pushed to `origin/dev`; only the two instructed files staged, frontend WIP untouched).
