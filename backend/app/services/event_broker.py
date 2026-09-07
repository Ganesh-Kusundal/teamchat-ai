"""Cross-instance realtime relay for the server-controlled SSE layer.

Each Cloud Run instance keeps its own SSE connections, so a process-local queue is
not enough. Events are written to a short-lived Firestore log; every instance polls
that log with its own cursor and forwards events to its local clients. This avoids
Firestore listeners in the browser and avoids Pub/Sub subscription load-balancing,
which would deliver an event to only one Cloud Run instance.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections import deque
from typing import Awaitable, Callable, Optional

from ..config import settings

logger = logging.getLogger(__name__)


class FirestoreEventBroker:
    def __init__(self, db, on_event: Callable[[dict], Awaitable[None]]):
        self.db = db
        self.on_event = on_event
        self._task: Optional[asyncio.Task] = None
        self._closed = False
        self._cursor = time.time()
        self._seen_ids: set[str] = set()
        self._seen_order = deque(maxlen=10000)

    @property
    def _events(self):
        return self.db.collection("realtime_events")

    async def publish(self, event: dict) -> None:
        payload = dict(event)
        org_slug = payload.get("orgSlug") or payload.get("payload", {}).get("orgSlug")
        if not org_slug:
            return
        record = {
            "eventId": uuid.uuid4().hex,
            "source": settings.INSTANCE_ID,
            "orgSlug": org_slug,
            "event": payload,
            "createdAt": time.time(),
            # Configure a Firestore TTL policy on expiresAt in production.
            "expiresAt": time.time() + 3600,
        }
        await asyncio.to_thread(self._events.document(record["eventId"]).set, record)

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        if self._task is None:
            self._closed = False
            self._task = loop.create_task(self._poll())

    async def _poll(self) -> None:
        while not self._closed:
            try:
                docs = await asyncio.to_thread(
                    lambda: list(
                        self._events.where("createdAt", ">=", self._cursor)
                        .order_by("createdAt")
                        .stream()
                    )
                )
                for doc in docs:
                    data = doc.to_dict()
                    event_id = str(data.get("eventId", doc.id))
                    self._cursor = max(self._cursor, float(data.get("createdAt", self._cursor)))
                    if event_id in self._seen_ids:
                        continue
                    if len(self._seen_order) == self._seen_order.maxlen:
                        self._seen_ids.discard(self._seen_order.popleft())
                    self._seen_ids.add(event_id)
                    self._seen_order.append(event_id)
                    if data.get("source") != settings.INSTANCE_ID:
                        await self.on_event(data.get("event", {}))
            except Exception as exc:
                # A transient Firestore/network failure should not kill SSE forever.
                logger.warning(f"Firestore event relay poll failed: {exc}")
            await asyncio.sleep(0.5)

    async def close(self) -> None:
        self._closed = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
