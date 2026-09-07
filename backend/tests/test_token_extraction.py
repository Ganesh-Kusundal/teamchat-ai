import anyio
from fastapi import Request
from backend.app.auth.dependencies import token_from_request
from backend.app.main import app


def _req(headers=None, query=""):
    scope = {"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
             "query_string": query.encode(), "method": "GET", "path": "/"}
    return Request(scope)


def test_bearer_wins_over_everything():
    r = _req({"authorization": "Bearer abc", "x-user-id": "usr-1"}, "token=q")
    assert token_from_request(r, "q") == "abc"


def test_x_user_id_then_query():
    assert token_from_request(_req({"x-user-id": "usr-1"})) == "usr-1"
    assert token_from_request(_req({}, "token=q"), "q") == "q"
    assert token_from_request(_req()) is None


async def _sse_start_status():
    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1", "method": "GET", "scheme": "http",
        "path": "/api/events", "raw_path": b"/api/events", "query_string": b"",
        "root_path": "", "headers": [(b"authorization", b"Bearer usr-sarah")],
        "client": ("testclient", 123), "server": ("testserver", 80),
    }
    started = {}

    async def receive():
        await anyio.sleep(0.2)
        return {"type": "http.disconnect"}

    async def send(message):
        if message["type"] == "http.response.start":
            started["status"] = message["status"]

    with anyio.move_on_after(2.0):
        await app(scope, receive, send)
    return started.get("status")


def test_realtime_stream_accepts_bearer():
    # TestClient buffers infinite SSE bodies (starlette 1.6.0), so drive the ASGI app directly.
    assert anyio.run(_sse_start_status) == 200
