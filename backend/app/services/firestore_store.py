"""Firestore-backed implementation of the chat repository.

All application documents are nested below an organization document.  The backend
still performs authorization before calling this repository; the nested paths add a
second tenant boundary and make accidental cross-organization queries impossible.
"""
from __future__ import annotations

import asyncio
import hashlib
import time
from typing import Any, Dict, List, Optional

from ..config import settings
from ..models.schemas import (
    Message,
    MessageReadReceipt,
    Organization,
    PresenceRecord,
    Room,
    TypingIndicator,
    UserProfile,
)
from .chat_store import ChatStore, SEED_MESSAGES, SEED_ORGANIZATIONS, SEED_ROOMS, SEED_USERS
from .event_broker import FirestoreEventBroker
from ..core.constants import TYPING_TTL_SECONDS, utc_now_iso
from ..core.events import EventType, event
from ..core.formatting import make_room_id, room_snippet, slugify_room_name


class FirestoreChatStore(ChatStore):
    """Synchronous Firestore repository used by FastAPI's production process."""

    def __init__(self):
        try:
            from google.cloud import firestore
        except ImportError as exc:
            raise RuntimeError(
                "google-cloud-firestore is required when STORAGE_BACKEND=firestore"
            ) from exc
        self._firestore = firestore
        if not settings.GOOGLE_CLOUD_PROJECT:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is required when STORAGE_BACKEND=firestore")
        self.db = firestore.Client(
            project=settings.GOOGLE_CLOUD_PROJECT or None,
            database=settings.FIRESTORE_DATABASE,
        )
        self.sse_clients = {}
        self.presence = {}
        self.typing = {}
        self.processed_client_message_ids = set()
        self.organizations = []
        self.users = []
        self.rooms = []
        self.messages = []
        self._broker = FirestoreEventBroker(self.db, self._receive_remote_event)
        self._load_cached_identity()

    def _org_ref(self, org_slug: str):
        return self.db.collection("organizations").document(org_slug)

    def _users_ref(self, org_slug: str):
        return self._org_ref(org_slug).collection("users")

    def _rooms_ref(self, org_slug: str):
        return self._org_ref(org_slug).collection("rooms")

    def _messages_ref(self, org_slug: str, room_id: str):
        return self._rooms_ref(org_slug).document(room_id).collection("messages")

    def _presence_ref(self, org_slug: str, user_id: str):
        return self._org_ref(org_slug).collection("presence").document(user_id)

    def _typing_ref(self, org_slug: str, room_id: str, user_id: str):
        return self._rooms_ref(org_slug).document(room_id).collection("typing").document(user_id)

    @staticmethod
    def _model_data(model: Any) -> dict:
        return model.model_dump(exclude_none=False)

    def _load_cached_identity(self) -> None:
        """Load only identity metadata needed by auth and tool execution."""
        self.organizations = [Organization(**d.to_dict()) for d in self.db.collection("organizations").stream()]
        for org in self.organizations:
            self.users.extend(
                UserProfile(**d.to_dict())
                for d in self._users_ref(org.slug).stream()
            )

    def _refresh_user(self, user_id: str = "", email: str = "") -> Optional[UserProfile]:
        if email:
            for user in self.users:
                if user.email.lower() == email.strip().lower():
                    return user
            for org in self.organizations:
                docs = self._users_ref(org.slug).where("email", "==", email.strip().lower()).limit(1).stream()
                doc = next(iter(docs), None)
                if doc:
                    user = UserProfile(**doc.to_dict())
                    self.users.append(user)
                    return user
        if user_id:
            for user in self.users:
                if user.id == user_id:
                    return user
            for org in self.organizations:
                doc = self._users_ref(org.slug).document(user_id).get()
                if doc.exists:
                    user = UserProfile(**doc.to_dict())
                    self.users.append(user)
                    return user
        return None

    def get_organizations(self) -> List[Organization]:
        self.organizations = [Organization(**d.to_dict()) for d in self.db.collection("organizations").stream()]
        return self.organizations

    def get_organization_by_slug(self, slug: str) -> Optional[Organization]:
        doc = self._org_ref(slug).get()
        return Organization(**doc.to_dict()) if doc.exists else None

    def get_user_by_id(self, user_id: str) -> Optional[UserProfile]:
        return self._refresh_user(user_id=user_id)

    def get_user_by_email(self, email: str) -> Optional[UserProfile]:
        return self._refresh_user(email=email)

    def get_users_by_org(self, org_slug: str) -> List[UserProfile]:
        return [UserProfile(**d.to_dict()) for d in self._users_ref(org_slug).stream()]

    def authenticate_user(self, email: str, password: str = "") -> Optional[UserProfile]:
        # Password verification belongs to Firebase Auth in production.
        return None

    def _room_from_doc(self, doc) -> Room:
        data = doc.to_dict()
        data["id"] = doc.id
        return Room(**data)

    def get_rooms_by_org(self, org_slug: str, user_id: Optional[str] = None) -> List[Room]:
        rooms = [self._room_from_doc(d) for d in self._rooms_ref(org_slug).stream()]
        if user_id:
            rooms = [r for r in rooms if user_id in r.memberIds]
        for room in rooms:
            messages = self.get_messages(room.id, org_slug, limit=1)
            if messages:
                last = messages[-1]
                room.lastMessage = room_snippet(last.senderName, last.content, last.isAi)
                room.lastMessageTimestamp = last.timestamp
            else:
                room.lastMessageTimestamp = room.createdAt
        return rooms

    def get_room_by_id(self, room_id: str, org_slug: str) -> Optional[Room]:
        doc = self._rooms_ref(org_slug).document(room_id).get()
        return self._room_from_doc(doc) if doc.exists else None

    def create_room(self, org_slug: str, name: str, description: str, created_by: str,
                    is_private: bool = False, member_ids: Optional[List[str]] = None) -> Room:
        room = Room(
            id=make_room_id(org_slug),
            orgSlug=org_slug,
            name=slugify_room_name(name),
            description=description.strip(),
            isPrivate=is_private,
            memberIds=member_ids or [u.id for u in self.get_users_by_org(org_slug)],
            createdAt=utc_now_iso(),
            createdBy=created_by,
        )
        room_ref = self._rooms_ref(org_slug).document(room.id)
        batch = self.db.batch()
        batch.set(room_ref, self._model_data(room))
        for member_id in room.memberIds:
            batch.set(room_ref.collection("members").document(member_id), {
                "uid": member_id,
                "orgId": org_slug,
                "roomId": room.id,
                "joinedAt": room.createdAt,
                "addedBy": created_by,
            })
        batch.commit()
        self._emit_room(room.id, org_slug, event(EventType.ROOM_CREATED, self._model_data(room), org_slug))
        return room

    def add_room_member(self, room_id: str, org_slug: str, user_id: str) -> bool:
        room = self.get_room_by_id(room_id, org_slug)
        user = self.get_user_by_id(user_id)
        if not room or not user or user.orgSlug != org_slug:
            return False
        if user_id not in room.memberIds:
            room.memberIds.append(user_id)
            room_ref = self._rooms_ref(org_slug).document(room_id)
            batch = self.db.batch()
            batch.update(room_ref, {"memberIds": room.memberIds})
            batch.set(room_ref.collection("members").document(user_id), {
                "uid": user_id,
                "orgId": org_slug,
                "roomId": room_id,
                "joinedAt": utc_now_iso(),
                "addedBy": room.createdBy,
            })
            batch.commit()
            self._emit_room(room_id, org_slug, event(EventType.MEMBER_ADDED, {
                "roomId": room_id, "userId": user_id, "userName": user.name,
            }, org_slug))
        return True

    def remove_room_member(self, room_id: str, org_slug: str, user_id: str) -> bool:
        room = self.get_room_by_id(room_id, org_slug)
        if not room or user_id not in room.memberIds:
            return False
        room.memberIds.remove(user_id)
        room_ref = self._rooms_ref(org_slug).document(room_id)
        batch = self.db.batch()
        batch.update(room_ref, {"memberIds": room.memberIds})
        batch.delete(room_ref.collection("members").document(user_id))
        batch.commit()
        self._emit_room(
            room_id, org_slug,
            event(EventType.MEMBER_REMOVED, {"roomId": room_id, "userId": user_id}, org_slug, target_user_id=user_id),
            target_user_id=user_id,
        )

        return True

    def claim_ai_invocation(self, trigger_message_id: str) -> bool:
        claim_ref = self._rooms_ref("__global__").document("ai_claims").collection("claims").document(trigger_message_id)
        # Claims are stored outside tenant data only as an implementation marker; the
        # trigger ID is a random server-generated message ID and carries no tenant input.
        transaction = self.db.transaction()
        try:
            transaction.create(claim_ref, {"triggerMessageId": trigger_message_id, "claimedAt": time.time()})
            transaction.commit()
            return True
        except Exception:
            return False

    def _message_from_doc(self, doc) -> Message:
        data = doc.to_dict()
        data["id"] = doc.id
        return Message(**data)

    def get_messages(self, room_id: str, org_slug: str, limit: int = 50, before: Optional[str] = None) -> List[Message]:
        query = self._messages_ref(org_slug, room_id).order_by("timestamp")
        if before:
            query = query.where("timestamp", "<", before)
        # Return the newest page in chronological order. limit() alone returns
        # the oldest page and breaks history pagination after the first request.
        docs = list(query.limit_to_last(max(1, limit)).stream())
        return [self._message_from_doc(d) for d in docs]

    def add_message(self, message: Message) -> Message:
        messages_ref = self._messages_ref(message.orgSlug, message.roomId)
        if message.clientMessageId:
            key = hashlib.sha256(
                f"{message.orgSlug}:{message.roomId}:{message.clientMessageId}".encode("utf-8")
            ).hexdigest()  # ponytail: room-scoped to match in-memory chat_store key
            dedupe_ref = self._rooms_ref(message.orgSlug).document(message.roomId).collection("message_idempotency").document(key)
            existing = dedupe_ref.get()
            if existing.exists:
                existing_id = existing.to_dict().get("messageId")
                saved = messages_ref.document(existing_id).get() if existing_id else None
                if saved and saved.exists:
                    return self._message_from_doc(saved)

            transaction = self.db.transaction()
            message_ref = messages_ref.document(message.id)
            dedupe_ref = self._rooms_ref(message.orgSlug).document(message.roomId).collection("message_idempotency").document(key)
            try:
                transaction.create(message_ref, self._model_data(message))
                transaction.create(dedupe_ref, {
                    "messageId": message.id,
                    "clientMessageId": message.clientMessageId,
                    "createdAt": message.timestamp,
                })
                transaction.commit()
            except Exception:
                existing = dedupe_ref.get()
                if existing.exists:
                    saved = messages_ref.document(existing.to_dict()["messageId"]).get()
                    if saved.exists:
                        return self._message_from_doc(saved)
                raise
        else:
            messages_ref.document(message.id).create(self._model_data(message))

        self._emit_room(message.roomId, message.orgSlug, event(
            EventType.NEW_MESSAGE, self._model_data(message), message.orgSlug,
        ))
        return message

    def mark_messages_as_read(self, room_id: str, org_slug: str, user_id: str) -> Dict[str, Any]:
        user = self.get_user_by_id(user_id)
        room = self.get_room_by_id(room_id, org_slug)
        if not user or not room:
            return {"updatedMessageIds": []}
        read_at = utc_now_iso()
        receipt = MessageReadReceipt(userId=user.id, userName=user.name, readAt=read_at)
        updated = []
        for doc in self._messages_ref(org_slug, room_id).stream():
            msg = self._message_from_doc(doc)
            reads = msg.readBy or []
            if not any(r.userId == user_id for r in reads):
                reads.append(receipt)
                doc.reference.update({"readBy": [r.model_dump() for r in reads]})
                updated.append(msg.id)
        if updated:
            self._emit_room(room_id, org_slug, event(EventType.MESSAGES_READ, {
                "roomId": room_id, "userId": user.id, "userName": user.name,
                "readAt": read_at, "messageIds": updated, "receipt": receipt.model_dump(),
            }, org_slug))
        return {"updatedMessageIds": updated, "receipt": receipt.model_dump()}

    def update_streaming_message(self, message_id: str, room_id: str, org_slug: str,
                                 content_chunk: str, is_complete: bool,
                                 tool_calls=None):
        ref = self._messages_ref(org_slug, room_id).document(message_id)
        doc = ref.get()
        if not doc.exists:
            return
        msg = self._message_from_doc(doc)
        data = {"content": msg.content + content_chunk, "isStreaming": not is_complete}
        if tool_calls is not None:
            data["toolCalls"] = [tc.model_dump() for tc in tool_calls]
        ref.update(data)
        self._emit_room(room_id, org_slug, event(EventType.STREAM_CHUNK, {
            "messageId": message_id, "roomId": room_id, "chunk": content_chunk,
            "fullContent": data["content"], "isComplete": is_complete,
            "toolCalls": data.get("toolCalls"),
        }, org_slug))

    def update_presence(self, user_id: str, org_slug: str, is_online: bool, current_room_id: Optional[str] = None):
        user = self.get_user_by_id(user_id)
        if not user:
            return
        rec = PresenceRecord(
            userId=user_id, userName=user.name, orgSlug=org_slug,
            currentRoomId=current_room_id, isOnline=is_online,
            lastActive=utc_now_iso(),
        )
        self._presence_ref(org_slug, user_id).set(self._model_data(rec))
        self._emit_org(org_slug, event(EventType.PRESENCE_UPDATE, rec.model_dump(), org_slug))

    def get_online_users_in_org(self, org_slug: str) -> List[PresenceRecord]:
        return [PresenceRecord(**d.to_dict()) for d in self._org_ref(org_slug).collection("presence").where("isOnline", "==", True).stream()]

    def set_typing(self, user_id: str, user_name: str, room_id: str, org_slug: str):
        indicator = TypingIndicator(userId=user_id, userName=user_name, roomId=room_id, orgSlug=org_slug, timestamp=time.time())
        self._typing_ref(org_slug, room_id, user_id).set(indicator.model_dump())
        self._broadcast_typing(room_id, org_slug)

    def clear_typing(self, user_id: str, room_id: str, org_slug: str):
        self._typing_ref(org_slug, room_id, user_id).delete()
        self._broadcast_typing(room_id, org_slug)

    def _broadcast_typing(self, room_id: str, org_slug: str):
        now = time.time()
        active = []
        for doc in self._rooms_ref(org_slug).document(room_id).collection("typing").stream():
            value = doc.to_dict()
            if now - float(value.get("timestamp", 0)) <= TYPING_TTL_SECONDS:
                active.append({"userId": value["userId"], "userName": value["userName"]})
            else:
                doc.reference.delete()
        self._emit_room(room_id, org_slug, event(EventType.TYPING_UPDATE, {"roomId": room_id, "typingUsers": active}, org_slug))

    def register_sse_client(self, client_id: str, user_id: str, org_slug: str, room_id: Optional[str] = None):
        client = super().register_sse_client(client_id, user_id, org_slug, room_id)
        return client

    async def _publish_relay(self, event: dict) -> None:
        try:
            await self._broker.publish(event)
        except Exception as exc:
            # Local SSE remains available even if the cross-instance relay is temporarily down.
            print(f"[Realtime] Failed to publish cross-instance event: {exc}")

    def _emit_room(self, room_id: str, org_slug: str, event_dict: dict, target_user_id: Optional[str] = None):
        payload = dict(event_dict.get("payload") or {})
        payload.setdefault("roomId", room_id)
        event_dict["payload"] = payload
        asyncio.create_task(self.broadcast_to_room(room_id, org_slug, event_dict, target_user_id=target_user_id))
        asyncio.create_task(self._publish_relay(event_dict))

    def _emit_org(self, org_slug: str, event: dict):
        asyncio.create_task(self.broadcast_to_org(org_slug, event))
        asyncio.create_task(self._publish_relay(event))

    async def _receive_remote_event(self, event: dict):
        payload = event.get("payload", {})
        room_id = payload.get("roomId")
        org_slug = event.get("orgSlug") or payload.get("orgSlug", "")
        target_user_id = event.get("targetUserId")
        if room_id:
            await self.broadcast_to_room(room_id, org_slug, event, target_user_id=target_user_id)
        else:
            for client in list(self.sse_clients.values()):
                if client.org_slug == org_slug:
                    await client.queue.put(event)

    def start_broker(self, loop):
        self._broker.start(loop)

    async def close_broker(self):
        await self._broker.close()

    def reset_to_seed(self):
        raise RuntimeError("reset_to_seed is disabled in Firestore mode; use scripts/seed_firestore.py")
