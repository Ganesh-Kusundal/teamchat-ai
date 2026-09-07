import time
import asyncio
import re
from typing import List, Dict, Any, Optional, Set
from ..config import settings
from ..core.constants import (
    DEFAULT_BASE_RATE, DEMO_PASSWORD,
    SSE_OFFLINE_GRACE_SECONDS, TYPING_TTL_SECONDS, utc_now_iso,
)
from ..core.events import EventType, event
from ..core.formatting import make_room_id, room_snippet, slugify_room_name
from ..models.schemas import (
    Organization,
    UserProfile,
    Room,
    Message,
    MessageReadReceipt,
    PresenceRecord,
    TypingIndicator,
    TypingUser,
    ToolCallRecord,
)

SEED_ORGANIZATIONS = [
    Organization(
        id="org-northside",
        slug="northside-health",
        name="Northside Health System",
        description="Regional integrated delivery network with 4 hospitals and 28 clinics",
        memberCount=4,
        logoColor="emerald",
        baseRate=DEFAULT_BASE_RATE,
    ),
    Organization(
        id="org-valley",
        slug="valley-primary-care",
        name="Valley Primary Care Network",
        description="Value-based accountable care organization serving 45,000 Medicare Advantage lives",
        memberCount=3,
        logoColor="indigo",
        baseRate=DEFAULT_BASE_RATE,
    ),
    Organization(
        id="org-metro",
        slug="metro-cardiology",
        name="Metro Cardiology Partners",
        description="Specialty cardiovascular network focusing on congestive heart failure and vascular care",
        memberCount=1,
        logoColor="rose",
        baseRate=DEFAULT_BASE_RATE,
    ),
]

SEED_USERS = [
    # Northside Health
    UserProfile(
        id="usr-sarah",
        email="sarah@northside-health.test",
        name="Sarah Chen",
        role="admin",
        orgSlug="northside-health",
        title="Lead Clinician & Informaticist",
        statusText="Reviewing Q1 RAF gaps",
        isOnline=False,
        avatar="SC",
        passwordHash=DEMO_PASSWORD,
    ),
    UserProfile(
        id="usr-mike",
        email="mike@northside-health.test",
        name="Mike Ross",
        role="member",
        orgSlug="northside-health",
        title="Senior Risk Adjustment Specialist",
        statusText="Auditing CKD progression",
        isOnline=False,
        avatar="MR",
        passwordHash=DEMO_PASSWORD,
    ),
    UserProfile(
        id="usr-lisa",
        email="lisa@northside-health.test",
        name="Lisa Wong",
        role="member",
        orgSlug="northside-health",
        title="Clinical Quality Auditor",
        statusText="Cross-checking eGFR lab thresholds",
        isOnline=False,
        avatar="LW",
        passwordHash=DEMO_PASSWORD,
    ),
    UserProfile(
        id="usr-tom",
        email="tom@northside-health.test",
        name="Tom Castellanos",
        role="member",
        orgSlug="northside-health",
        title="Staff Risk Coder",
        statusText="Resolving IT-4471 EHR tickets",
        isOnline=False,
        avatar="TC",
        passwordHash=DEMO_PASSWORD,
    ),
    UserProfile(
        id="usr-marcus-vance",
        email="marcus@northside-health.test",
        name="Dr. Marcus Vance",
        role="member",
        orgSlug="northside-health",
        title="Internal Medicine Specialist",
        statusText="Reviewing chronic patient panel",
        isOnline=False,
        avatar="MV",
        passwordHash=DEMO_PASSWORD,
    ),
    # Valley Primary Care
    UserProfile(
        id="usr-elena",
        email="elena@valley-primary-care.test",
        name="Dr. Elena Sorensen",
        role="admin",
        orgSlug="valley-primary-care",
        title="Medical Director",
        statusText="Evaluating AWV scheduling policy",
        isOnline=False,
        avatar="ES",
        passwordHash=DEMO_PASSWORD,
    ),
    UserProfile(
        id="usr-david",
        email="david@valley-primary-care.test",
        name="David Park",
        role="member",
        orgSlug="valley-primary-care",
        title="Risk Adjustment Lead",
        statusText="Validating annual wellness audits",
        isOnline=False,
        avatar="DP",
        passwordHash=DEMO_PASSWORD,
    ),
    UserProfile(
        id="usr-diego",
        email="diego@valley-primary-care.test",
        name="Diego Arriaga",
        role="member",
        orgSlug="valley-primary-care",
        title="Lead Risk Coder",
        statusText="Checking cardiology fax queues",
        isOnline=False,
        avatar="DA",
        passwordHash=DEMO_PASSWORD,
    ),
    UserProfile(
        id="usr-marta",
        email="marta@valley-primary-care.test",
        name="Marta Escalante",
        role="member",
        orgSlug="valley-primary-care",
        title="Quality Assurance Manager",
        statusText="Monitoring coder SLA queue",
        isOnline=False,
        avatar="ME",
        passwordHash=DEMO_PASSWORD,
    ),
    # Metro Cardiology
    UserProfile(
        id="usr-marcus",
        email="marcus@metro-cardiology.test",
        name="Dr. Marcus Brody",
        role="admin",
        orgSlug="metro-cardiology",
        title="Chief of Cardiology",
        statusText="Evaluating HF inpatient discharges",
        isOnline=False,
        avatar="MB",
        passwordHash=DEMO_PASSWORD,
    ),
]

SEED_ROOMS = [
    Room(
        id="room-nor-001",
        orgSlug="northside-health",
        name="coding-huddle",
        description="Daily clinical review and CMS-HCC V28 coding alignment",
        isPrivate=False,
        memberIds=["usr-sarah", "usr-mike", "usr-lisa", "usr-tom", "usr-marcus-vance"],
        createdAt="2026-02-01T08:00:00Z",
        createdBy="usr-sarah",
    ),
    Room(
        id="room-nor-002",
        orgSlug="northside-health",
        name="care-gaps",
        description="Suspected chronic condition recapture and documentation audits",
        isPrivate=False,
        memberIds=["usr-sarah", "usr-mike", "usr-lisa", "usr-tom", "usr-marcus-vance"],
        createdAt="2026-02-01T08:00:00Z",
        createdBy="usr-sarah",
    ),
    Room(
        id="room-nor-003",
        orgSlug="northside-health",
        name="general",
        description="General team discussion and administrative announcements",
        isPrivate=False,
        memberIds=["usr-sarah", "usr-mike", "usr-lisa", "usr-tom", "usr-marcus-vance"],
        createdAt="2026-02-01T08:00:00Z",
        createdBy="usr-sarah",
    ),
    Room(
        id="room-val-001",
        orgSlug="valley-primary-care",
        name="risk-adjustment",
        description="Medicare Advantage value-based contract management and AWV review",
        isPrivate=False,
        memberIds=["usr-elena", "usr-diego", "usr-marta", "usr-david"],
        createdAt="2026-02-01T08:00:00Z",
        createdBy="usr-elena",
    ),
    Room(
        id="room-val-002",
        orgSlug="valley-primary-care",
        name="care-gaps",
        description="Cardiology records reconciliation and chronic gap closure",
        isPrivate=False,
        memberIds=["usr-elena", "usr-diego", "usr-marta", "usr-david"],
        createdAt="2026-02-01T08:00:00Z",
        createdBy="usr-elena",
    ),
]

SEED_MESSAGES = [
    Message(
        id="msg-nor-seed-1",
        roomId="room-nor-001",
        orgSlug="northside-health",
        senderId="usr-sarah",
        senderName="Sarah Chen",
        senderRole="admin",
        isAi=False,
        content="Good morning team. We need to review patient PT-4001 for diabetic kidney disease recapture.",
        timestamp="2026-03-01T14:30:00Z",
        readBy=[MessageReadReceipt(userId="usr-sarah", userName="Sarah Chen", readAt="2026-03-01T14:30:00Z")],
    ),
    Message(
        id="msg-nor-seed-2",
        roomId="room-nor-001",
        orgSlug="northside-health",
        senderId="usr-mike",
        senderName="Mike Ross",
        senderRole="member",
        isAi=False,
        content="I checked the lab values from last month. eGFR was 42 mL/min, which qualifies for CKD Stage 3b (N18.32).",
        timestamp="2026-03-01T14:31:00Z",
        readBy=[MessageReadReceipt(userId="usr-mike", userName="Mike Ross", readAt="2026-03-01T14:31:00Z")],
    ),
    Message(
        id="msg-nor-seed-3",
        roomId="room-nor-001",
        orgSlug="northside-health",
        senderId="usr-lisa",
        senderName="Lisa Wong",
        senderRole="member",
        isAi=False,
        content="@Gemini can you calculate the RAF score impact if we document Type 2 Diabetes with CKD (E11.22) and CKD Stage 4 (N18.4)?",
        timestamp="2026-03-01T14:32:00Z",
        mentionsAi=True,
        readBy=[MessageReadReceipt(userId="usr-lisa", userName="Lisa Wong", readAt="2026-03-01T14:32:00Z")],
    ),
]

class SSEClient:
    def __init__(self, client_id: str, user_id: str, org_slug: str, room_id: Optional[str] = None):
        self.client_id = client_id
        self.user_id = user_id
        self.org_slug = org_slug
        self.room_id = room_id
        self.queue: asyncio.Queue = asyncio.Queue()

class ChatStore:
    def __init__(self):
        self.organizations: List[Organization] = []
        self.users: List[UserProfile] = []
        self.rooms: List[Room] = []
        self.messages: List[Message] = []
        self.presence: Dict[str, PresenceRecord] = {}
        self.typing: Dict[str, TypingIndicator] = {}
        self.sse_clients: Dict[str, SSEClient] = {}
        self.processed_client_message_ids: Set[tuple[str, str, str]] = set()
        self.claimed_ai_invocations: Set[str] = set()
        self.reset_to_seed()

    def reset_to_seed(self):
        self.organizations = [o.model_copy() for o in SEED_ORGANIZATIONS]
        self.users = [u.model_copy() for u in SEED_USERS]
        self.rooms = [r.model_copy() for r in SEED_ROOMS]
        self.messages = [m.model_copy() for m in SEED_MESSAGES]
        self.presence.clear()
        self.typing.clear()
        self.processed_client_message_ids.clear()
        self.claimed_ai_invocations.clear()

        for u in self.users:
            self.presence[u.id] = PresenceRecord(
                userId=u.id,
                userName=u.name,
                orgSlug=u.orgSlug,
                isOnline=False,
                lastActive=utc_now_iso(),
            )

    # --- Organizations ---
    def get_organizations(self) -> List[Organization]:
        return self.organizations

    def get_organization_by_slug(self, slug: str) -> Optional[Organization]:
        return next((o for o in self.organizations if o.slug == slug), None)

    # --- Users & Authentication ---
    def authenticate_user(self, email: str, password: str = DEMO_PASSWORD) -> Optional[UserProfile]:
        clean_email = email.strip().lower()
        user = next(
            (u for u in self.users if u.email.lower() == clean_email and (u.passwordHash == password or password == DEMO_PASSWORD)),
            None,
        )
        return user

    def get_user_by_id(self, user_id: str) -> Optional[UserProfile]:
        return next((u for u in self.users if u.id == user_id), None)

    def get_user_by_email(self, email: str) -> Optional[UserProfile]:
        clean_email = email.strip().lower()
        return next((u for u in self.users if u.email.lower() == clean_email), None)

    def get_users_by_org(self, org_slug: str) -> List[UserProfile]:
        return [u for u in self.users if u.orgSlug == org_slug]

    def get_all_users(self) -> List[UserProfile]:
        return self.users

    # --- Rooms ---
    def get_rooms_by_org(self, org_slug: str, user_id: Optional[str] = None) -> List[Room]:
        org_rooms = [r for r in self.rooms if r.orgSlug == org_slug]
        
        # Filter private rooms if user_id is provided
        if user_id:
            org_rooms = [r for r in org_rooms if not r.isPrivate or user_id in r.memberIds]

        results = []
        for room in org_rooms:
            room_msgs = [m for m in self.messages if m.roomId == room.id]
            last_msg = room_msgs[-1] if room_msgs else None
            r_copy = room.model_copy()
            r_copy.lastMessage = room_snippet(last_msg.senderName, last_msg.content, last_msg.isAi) if last_msg else None
            r_copy.lastMessageTimestamp = last_msg.timestamp if last_msg else room.createdAt
            results.append(r_copy)
        return results

    def get_room_by_id(self, room_id: str, org_slug: str) -> Optional[Room]:
        return next((r for r in self.rooms if r.id == room_id and r.orgSlug == org_slug), None)

    def create_room(
        self,
        org_slug: str,
        name: str,
        description: str,
        created_by: str,
        is_private: bool = False,
        member_ids: Optional[List[str]] = None,
    ) -> Room:
        clean_name = slugify_room_name(name)
        members = member_ids or [u.id for u in self.get_users_by_org(org_slug)]
        new_room = Room(
            id=make_room_id(org_slug),
            orgSlug=org_slug,
            name=clean_name,
            description=description.strip(),
            isPrivate=is_private,
            memberIds=members,
            createdAt=utc_now_iso(),
            createdBy=created_by,
        )
        self.rooms.append(new_room)
        asyncio.create_task(
            self.broadcast_to_room(new_room.id, org_slug, event(EventType.ROOM_CREATED, new_room.model_dump(), org_slug))
        )
        return new_room

    def add_room_member(self, room_id: str, org_slug: str, user_id: str) -> bool:
        room = self.get_room_by_id(room_id, org_slug)
        user = self.get_user_by_id(user_id)
        if not room or not user or user.orgSlug != org_slug:
            return False
        if user_id not in room.memberIds:
            room.memberIds.append(user_id)
            asyncio.create_task(
                self.broadcast_to_room(room_id, org_slug, event(EventType.MEMBER_ADDED, {"roomId": room_id, "userId": user_id, "userName": user.name}, org_slug))
            )
        return True

    def remove_room_member(self, room_id: str, org_slug: str, user_id: str) -> bool:
        room = self.get_room_by_id(room_id, org_slug)
        if not room or user_id not in room.memberIds:
            return False
        room.memberIds.remove(user_id)
        asyncio.create_task(
            self.broadcast_to_room(room_id, org_slug, event(EventType.MEMBER_REMOVED, {"roomId": room_id, "userId": user_id}, org_slug, target_user_id=user_id), target_user_id=user_id)
        )
        return True

    # --- Messages ---
    def claim_ai_invocation(self, trigger_message_id: str) -> bool:
        if trigger_message_id in self.claimed_ai_invocations:
            return False
        self.claimed_ai_invocations.add(trigger_message_id)
        return True

    def get_messages(self, room_id: str, org_slug: str, limit: int = 50, before: Optional[str] = None) -> List[Message]:
        room = self.get_room_by_id(room_id, org_slug)
        if not room:
            return []

        room_msgs = [m for m in self.messages if m.roomId == room_id and m.orgSlug == org_slug]
        if before:
            room_msgs = [m for m in room_msgs if m.timestamp < before]
        return room_msgs[-limit:]

    def add_message(self, message: Message) -> Message:
        if not message.readBy:
            message.readBy = [
                MessageReadReceipt(
                    userId=message.senderId,
                    userName=message.senderName,
                    readAt=message.timestamp,
                )
            ]

        # Check client message ID deduplication
        if message.clientMessageId:
            dedupe_key = (message.orgSlug, message.roomId, message.clientMessageId)
            if dedupe_key in self.processed_client_message_ids:
                existing = next((m for m in self.messages if m.orgSlug == message.orgSlug and m.roomId == message.roomId and m.clientMessageId == message.clientMessageId), None)
                if existing:
                    return existing
            self.processed_client_message_ids.add(dedupe_key)

        self.messages.append(message)
        asyncio.create_task(
            self.broadcast_to_room(message.roomId, message.orgSlug, event(EventType.NEW_MESSAGE, message.model_dump(), message.orgSlug))
        )
        return message

    def mark_messages_as_read(self, room_id: str, org_slug: str, user_id: str) -> Dict[str, Any]:
        user = self.get_user_by_id(user_id)
        room = self.get_room_by_id(room_id, org_slug)
        if not user or not room:
            return {"updatedMessageIds": []}

        receipt = MessageReadReceipt(
            userId=user.id,
            userName=user.name,
            readAt=utc_now_iso(),
        )
        updated_ids = []

        for msg in self.messages:
            if msg.roomId == room_id and msg.orgSlug == org_slug:
                if not msg.readBy:
                    msg.readBy = []
                if not any(r.userId == user_id for r in msg.readBy):
                    msg.readBy.append(receipt)
                    updated_ids.append(msg.id)

        if updated_ids:
            asyncio.create_task(
                self.broadcast_to_room(
                    room_id,
                    org_slug,
                    event(
                        EventType.MESSAGES_READ,
                        {
                            "roomId": room_id,
                            "userId": user.id,
                            "userName": user.name,
                            "readAt": receipt.readAt,
                            "messageIds": updated_ids,
                            "receipt": receipt.model_dump(),
                        },
                        org_slug,
                    ),
                )
            )

        return {"updatedMessageIds": updated_ids, "receipt": receipt.model_dump()}

    def update_streaming_message(
        self,
        message_id: str,
        room_id: str,
        org_slug: str,
        content_chunk: str,
        is_complete: bool,
        tool_calls: Optional[List[ToolCallRecord]] = None,
    ):
        msg = next((m for m in self.messages if m.id == message_id), None)
        if msg:
            msg.content += content_chunk
            if is_complete:
                msg.content = re.sub(r"<\/?tool_code>", "", msg.content)
                msg.content = re.sub(r"\|\s*\|\s*", "|\n|", msg.content)
            msg.isStreaming = not is_complete
            if tool_calls is not None:
                msg.toolCalls = tool_calls

        asyncio.create_task(
            self.broadcast_to_room(
                room_id,
                org_slug,
                event(
                    EventType.STREAM_CHUNK,
                    {
                        "messageId": message_id,
                        "roomId": room_id,
                        "chunk": content_chunk,
                        "fullContent": msg.content if msg else None,
                        "isComplete": is_complete,
                        "toolCalls": [tc.model_dump() for tc in tool_calls] if tool_calls else None,
                    },
                    org_slug,
                ),
            )
        )

    # --- Presence ---
    def update_presence(self, user_id: str, org_slug: str, is_online: bool, current_room_id: Optional[str] = None):
        user = self.get_user_by_id(user_id)
        if not user:
            return

        user.isOnline = is_online
        rec = PresenceRecord(
            userId=user_id,
            userName=user.name,
            orgSlug=org_slug,
            currentRoomId=current_room_id,
            isOnline=is_online,
            lastActive=utc_now_iso(),
        )
        self.presence[user_id] = rec
        asyncio.create_task(
            self.broadcast_to_org(org_slug, event(EventType.PRESENCE_UPDATE, rec.model_dump(), org_slug))
        )

    def get_online_users_in_org(self, org_slug: str) -> List[PresenceRecord]:
        active_sse_user_ids = {c.user_id for c in self.sse_clients.values() if c.org_slug == org_slug}
        results = []
        for p in self.presence.values():
            if p.orgSlug == org_slug:
                # Online if actively connected via SSE or explicitly flagged online
                if p.userId in active_sse_user_ids or p.isOnline:
                    results.append(p)
        return results

    # --- Typing ---
    def set_typing(self, user_id: str, user_name: str, room_id: str, org_slug: str):
        key = f"{room_id}_{user_id}"
        self.typing[key] = TypingIndicator(
            userId=user_id,
            userName=user_name,
            roomId=room_id,
            orgSlug=org_slug,
            timestamp=time.time(),
        )
        self._broadcast_typing(room_id, org_slug)

    def clear_typing(self, user_id: str, room_id: str, org_slug: str):
        key = f"{room_id}_{user_id}"
        if key in self.typing:
            del self.typing[key]
        self._broadcast_typing(room_id, org_slug)

    def _broadcast_typing(self, room_id: str, org_slug: str):
        now = time.time()
        # Prune stale typers > 3s
        stale_keys = [k for k, v in self.typing.items() if now - v.timestamp > TYPING_TTL_SECONDS]
        for k in stale_keys:
            del self.typing[k]

        active = [
            {"userId": v.userId, "userName": v.userName}
            for v in self.typing.values()
            if v.roomId == room_id and v.orgSlug == org_slug
        ]

        asyncio.create_task(
            self.broadcast_to_room(
                room_id,
                org_slug,
                event(
                    EventType.TYPING_UPDATE,
                    {"roomId": room_id, "typingUsers": active},
                    org_slug,
                ),
            )
        )

    # --- SSE Connection Engine ---
    def register_sse_client(self, client_id: str, user_id: str, org_slug: str, room_id: Optional[str] = None) -> SSEClient:
        client = SSEClient(client_id, user_id, org_slug, room_id)
        self.sse_clients[client_id] = client
        self.update_presence(user_id, org_slug, True, room_id)
        return client

    def remove_sse_client(self, client_id: str):
        client = self.sse_clients.pop(client_id, None)
        if client:
            # If no other client active for this user, apply short grace period before marking offline
            # This prevents flickering during page reloads or room switches.
            has_other = any(c.user_id == client.user_id for c in self.sse_clients.values())
            if not has_other:
                async def _delayed_offline(u_id: str, o_slug: str):
                    await asyncio.sleep(SSE_OFFLINE_GRACE_SECONDS)
                    if not any(c.user_id == u_id for c in self.sse_clients.values()):
                        self.update_presence(u_id, o_slug, False)
                try:
                    asyncio.create_task(_delayed_offline(client.user_id, client.org_slug))
                except Exception:
                    self.update_presence(client.user_id, client.org_slug, False)


    async def broadcast_to_room(self, room_id: str, org_slug: str, event: Dict[str, Any], target_user_id: Optional[str] = None):
        for client in list(self.sse_clients.values()):
            if client.org_slug == org_slug and (not client.room_id or client.room_id == room_id):
                room = self.get_room_by_id(room_id, org_slug)
                if room and client.user_id not in room.memberIds and client.user_id != target_user_id:
                    continue
                try:
                    await client.queue.put(event)
                except Exception:
                    pass

    async def broadcast_to_org(self, org_slug: str, event: Dict[str, Any]):
        for client in list(self.sse_clients.values()):
            if client.org_slug == org_slug:
                try:
                    await client.queue.put(event)
                except Exception:
                    pass

if settings.STORAGE_BACKEND == "firestore":
    from .firestore_store import FirestoreChatStore
    chat_store = FirestoreChatStore()
else:
    chat_store = ChatStore()
