# SDD Progress Ledger — dev refactor plan (2026-09-07)
Task 1: complete (commits a615645..2eb0441, review clean)
Task 2: complete (commits 2eb0441..34e894f incl. import-re fix, review clean)
  Minor (final review): firestore_store.py param name `event` shadows imported event() in _publish_relay/_emit_org/_receive_remote_event
  Minor (final review): _emit_room mutates caller's event dict (safe today, all callers pass fresh dicts)
  Minor (final review): test_constants streaming test leaks a message into the global singleton (no teardown)
Task 3: complete (commits 34e894f..756d314, review clean)
  Minor (final review): membership predicate duplicated in routes_rooms.py:13 get_rooms filter — consider is_member helper or push filter into store
Task 4: complete (commits 756d314..8270966, review clean)
  Minor (final review): firestore_memory.py unused hashlib import (pre-existing)
  Minor (final review): memory_query.py bool in isinstance tuple redundant (verbatim from plan)
  Note: Firestore idempotency docs keyed under old senderId-key have no migration; they re-dedupe under new key (accepted plan-level)
Task 5: complete (commits 8270966..657e530 incl. query-token parity fix, review clean)
  Minor (final review): Bearer checked twice in get_request_context (harmless)
  Minor (final review): raw-ASGI SSE test fixed 0.2s disconnect — worst case spurious fail-fast on very slow CI
Task 6: complete (commits 657e530..2781eda, review clean; strip_tool_tags kwarg adjudicated correct)
User decision: commit frontend AI-Thinking WIP as its own wip: commit before Task 7.
Task 7: complete (commits cde48e4..7f4cc8a, review clean; useLayoutEffect + explicit-token deviations validated)
  Minor (final review): AuthContext re-login sends stale Authorization on /api/auth/login (endpoint has no auth dep — harmless)
  Minor (final review): api.ts skips Content-Type for empty-string bodies (unused pattern)
  Open: manual smoke checklist (live SSE/streaming) deferred to final verification with user
Task 8: complete (commits 7f4cc8a..b426c4e, review clean)
  Minor (final review): LoginPage useEffect fetch lacks abort/cleanup (login page, harmless)
  Minor (final review): no test exercises the Firebase-mode 404 branch of /demo/accounts
Task 9: complete (commits b426c4e..ebbd9d7, review clean)
Final review: 2 pre-merge fixes (AI-thinking card clear, slash-command regex) — fixed in a95f8cd
All 9 tasks + final review complete. Merging dev -> main per user choice.
