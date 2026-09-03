from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

# -------------------------------------------------------------
# 1. Identity, Tenant & RequestContext
# -------------------------------------------------------------
class RequestContext(BaseModel):
    uid: str
    email: str
    org_id: str
    org_slug: str
    role: Literal["admin", "member"]

class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    role: Literal["admin", "member"]
    orgSlug: str
    title: Optional[str] = None
    statusText: Optional[str] = None
    isOnline: Optional[bool] = False
    avatar: Optional[str] = None
    # passwordHash is intentionally excluded from API responses via UserPublic
    passwordHash: Optional[str] = Field(default=None, exclude=True, repr=False)

    def to_public(self) -> dict:
        """Return safe dict for API responses — excludes passwordHash."""
        return self.model_dump(exclude={"passwordHash"})

class Organization(BaseModel):
    id: str
    slug: str
    name: str
    description: str
    memberCount: int
    logoColor: str
    baseRate: Optional[float] = 12000.0

# -------------------------------------------------------------
# 2. Rooms & Memberships
# -------------------------------------------------------------
class RoomMember(BaseModel):
    uid: str
    orgId: str
    roomId: str
    joinedAt: str
    addedBy: str

class Room(BaseModel):
    id: str
    orgSlug: str
    name: str
    description: Optional[str] = ""
    isPrivate: Optional[bool] = False
    memberIds: List[str] = Field(default_factory=list)
    createdAt: str
    createdBy: str
    lastMessage: Optional[str] = None
    lastMessageTimestamp: Optional[str] = None
    unreadCount: Optional[int] = 0
    aiPersona: Optional[str] = None

class CreateRoomRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    isPrivate: Optional[bool] = False
    memberIds: Optional[List[str]] = None

class AddMemberRequest(BaseModel):
    userId: str

# -------------------------------------------------------------
# 3. Messages, Read Receipts & Tool Calls
# -------------------------------------------------------------
class ToolCallRecord(BaseModel):
    id: str
    toolName: str
    args: Dict[str, Any]
    result: Optional[Any] = None
    status: Literal["running", "completed", "error"]
    error: Optional[str] = None

class MessageReadReceipt(BaseModel):
    userId: str
    userName: str
    readAt: str

class Message(BaseModel):
    id: str
    roomId: str
    orgSlug: str
    senderId: str
    senderName: str
    senderRole: Optional[Literal["admin", "member"]] = "member"
    isAi: bool = False
    content: str
    timestamp: str
    mentionsAi: Optional[bool] = False
    isStreaming: Optional[bool] = False
    toolCalls: Optional[List[ToolCallRecord]] = Field(default_factory=list)
    replyToId: Optional[str] = None
    replyToSnippet: Optional[str] = None
    readBy: Optional[List[MessageReadReceipt]] = Field(default_factory=list)
    clientMessageId: Optional[str] = None

class SendMessageRequest(BaseModel):
    content: str
    replyToId: Optional[str] = None
    replyToSnippet: Optional[str] = None
    clientMessageId: Optional[str] = None

# -------------------------------------------------------------
# 4. Presence & Typing
# -------------------------------------------------------------
class TypingUser(BaseModel):
    userId: str
    userName: str

class TypingIndicator(BaseModel):
    userId: str
    userName: str
    roomId: str
    orgSlug: str
    timestamp: float

class TypingStatusRequest(BaseModel):
    isTyping: bool

class PresenceRecord(BaseModel):
    userId: str
    userName: str
    orgSlug: str
    currentRoomId: Optional[str] = None
    isOnline: bool
    lastActive: str

class PresenceUpdateRequest(BaseModel):
    isOnline: bool
    currentRoomId: Optional[str] = None

# -------------------------------------------------------------
# 5. Clinical Seed Models & RAF Scoring
# -------------------------------------------------------------
class ConditionCode(BaseModel):
    icd10_code: str
    description: str
    code_family: str
    chapter: str
    chronic: bool
    specificity: Literal["specified", "unspecified"]
    hcc_v28_code: Optional[str] = None
    hcc_v28_label: Optional[str] = None

class HCCFactor(BaseModel):
    hcc_v28_code: str
    hcc_v28_label: str
    coeff_community_nondual_aged: float
    coeff_community_fbdual_aged: float
    hierarchy_supersedes: List[str] = Field(default_factory=list)

class DemographicFactor(BaseModel):
    sex: Literal["M", "F"]
    age_band: str
    coeff_community_nondual_aged: float
    coeff_community_fbdual_aged: float

class PatientCondition(BaseModel):
    icd10_code: str
    description: str
    hcc_v28_code: Optional[str] = None
    last_documented: str
    encounter_id: Optional[str] = None
    evidence: Optional[str] = None

class PatientEnrollment(BaseModel):
    model_segment: Literal["community_nondual_aged", "community_fbdual_aged"]
    medicaid_dual: bool
    plan: str

class Patient(BaseModel):
    patient_id: str
    org_slug: str
    name: str
    age: int
    sex: Literal["M", "F"]
    enrollment: PatientEnrollment
    last_visit: str
    attending_provider: str
    documented_conditions_2026: List[PatientCondition] = Field(default_factory=list)
    suspected_conditions: List[PatientCondition] = Field(default_factory=list)

class TeamMemory(BaseModel):
    memory_id: str
    org_slug: str
    key: str
    value: Dict[str, Any]
    created_by: str
    created_at: str
    room: str

class MappedConditionResult(BaseModel):
    icd10_code: str
    description: str
    hcc_code: str
    hcc_label: str
    raw_coefficient: float
    is_superseded: bool
    superseded_by: Optional[str] = None
    final_coefficient: float

class UnmappedConditionResult(BaseModel):
    icd10_code: str
    description: str
    reason: str

class DemographicFactorResult(BaseModel):
    sex: Literal["M", "F"]
    age_band: str
    coefficient: float

class RAFCalculationResult(BaseModel):
    patient_id: Optional[str] = None
    org_slug: str
    dataset_version: str
    model_segment: str
    demographic_factor: DemographicFactorResult
    mapped_conditions: List[MappedConditionResult]
    unmapped_conditions: List[UnmappedConditionResult]
    demographic_coefficient: float
    hcc_coefficient_sum: float
    raf_total: float
    base_rate: float
    estimated_annual_payment: int

class GroundingRecord(BaseModel):
    id: str
    requestId: str
    sourceType: Literal["patient", "condition", "risk", "memory"]
    sourceId: str
    toolName: str
    datasetVersion: str = "teamchat-seed-2026.1"
    createdAt: str
