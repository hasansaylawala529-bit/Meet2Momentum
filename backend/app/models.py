from datetime import datetime, timezone
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator


class ActionItemCategory(str, Enum):
    COMMITMENT = "commitment"
    SUGGESTION = "suggestion"
    UNRESOLVED_QUESTION = "unresolved_question"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ExecutionStatus(str, Enum):
    NOT_EXPORTED = "not_exported"
    EXPORTED = "exported"
    FAILED = "failed"
    INTEGRATED = "integrated"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


# --- Meeting Schemas ---

class MeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Title of the meeting")
    transcript: str = Field(..., description="Raw meeting transcript or notes")
    meeting_date: Optional[str] = Field(None, max_length=50, description="Optional meeting date string")

    @field_validator("title")
    @classmethod
    def validate_title_not_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Meeting title cannot be empty or whitespace only")
        return stripped

    @field_validator("transcript")
    @classmethod
    def validate_transcript_not_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Transcript text cannot be empty or whitespace only")
        return stripped


class MeetingResponse(BaseModel):
    meeting_id: str
    title: str
    transcript: str
    meeting_date: Optional[str] = None
    created_at: str


# --- Persisted Domain Models ---

class Decision(BaseModel):
    decision_id: str
    meeting_id: str
    title: str
    description: Optional[str] = None
    rationale: Optional[str] = None
    source_text: Optional[str] = None
    evidence_verified: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ActionItem(BaseModel):
    task_id: str
    meeting_id: str
    title: str
    description: Optional[str] = None
    category: ActionItemCategory
    commitment_status: ActionItemCategory = Field(
        ...,
        description="Must be one of 'commitment', 'suggestion', 'unresolved_question'"
    )
    owner: Optional[str] = None
    due_date: Optional[str] = None
    source_text: Optional[str] = None
    clarification_required: bool = False
    clarification_note: Optional[str] = None
    duplicate_of: Optional[str] = None
    duplicate_note: Optional[str] = None
    conflict_flag: bool = False
    conflict_note: Optional[str] = None
    evidence_verified: bool = True
    meeting_date: Optional[str] = None
    meeting_title: Optional[str] = None
    external_url: Optional[str] = None
    integration_service: Optional[str] = None
    external_id: Optional[str] = None
    approval_status: ApprovalStatus = ApprovalStatus.PENDING
    execution_status: ExecutionStatus = ExecutionStatus.NOT_EXPORTED
    task_status: TaskStatus = TaskStatus.PENDING
    exported_at: Optional[str] = None
    completed_at: Optional[str] = None
    is_overdue: bool = False
    schedule_status: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# --- Gemini Structured Extraction Schema ---

class ExtractedDecisionRaw(BaseModel):
    title: str = Field(..., description="Concise statement of the confirmed decision")
    rationale: Optional[str] = Field(None, description="Supporting rationale only if explicitly provided in transcript")
    source_text: str = Field(..., description="Exact verbatim excerpt from the transcript supporting this decision")


class ExtractedActionItemRaw(BaseModel):
    title: str = Field(..., description="Concise description of the task, suggestion, or question")
    description: Optional[str] = Field(None, description="Additional context or details from the discussion")
    category: ActionItemCategory = Field(
        ...,
        description="'commitment' for confirmed responsibilities, 'suggestion' for exploratory proposals, 'unresolved_question' for open questions"
    )
    owner: Optional[str] = Field(None, description="Explicit owner assigned in the conversation, or null if unassigned/ambiguous")
    due_date: Optional[str] = Field(None, description="Explicit deadline or timeframe mentioned, or null if unspecified")
    source_text: str = Field(..., description="Exact verbatim excerpt from the transcript supporting this item")
    clarification_required: bool = Field(False, description="True if owner, deadline, or scope is ambiguous or missing")
    clarification_note: Optional[str] = Field(None, description="Explanation of what detail is missing or ambiguous")


class MeetingExtractionRaw(BaseModel):
    decisions: List[ExtractedDecisionRaw] = Field(default_factory=list, description="List of confirmed decisions with supporting quotes")
    action_items: List[ExtractedActionItemRaw] = Field(default_factory=list, description="List of action items, suggestions, and unresolved questions")


# --- API Response Schemas ---

class ExtractionResponse(BaseModel):
    meeting_id: str
    decisions: List[Decision]
    action_items: List[ActionItem]
    total_decisions: int
    total_action_items: int
    commitments_count: int
    suggestions_count: int
    unresolved_questions_count: int
    extracted_at: str


# --- Phase 3: Approval and Firewall Models ---

class ActionItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500, description="Updated task or question description")
    description: Optional[str] = Field(None, description="Updated context or notes")
    owner: Optional[str] = Field(None, max_length=100, description="Assigned owner, or null if unassigned")
    due_date: Optional[str] = Field(None, max_length=100, description="Target deadline or timeframe, or null if unassigned")
    clarification_note: Optional[str] = Field(None, description="Optional clarification details")

    @field_validator("title")
    @classmethod
    def validate_title_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            stripped = v.strip()
            if not stripped:
                raise ValueError("Action item title cannot be empty or whitespace only")
            return stripped
        return v


class ApprovalActionRequest(BaseModel):
    note: Optional[str] = Field(None, max_length=500, description="Optional human reviewer note or rationale")


class FirewallEvaluationResult(BaseModel):
    task_id: str
    meeting_id: str
    title: str
    category: ActionItemCategory
    approval_status: ApprovalStatus
    eligible: bool = Field(..., description="True only if human-approved and satisfying all Commitment Firewall rules")
    firewall_status: str = Field(..., description="'eligible' if ready for execution, 'blocked' otherwise")
    block_reason: Optional[str] = Field(None, description="'approval_pending', 'item_rejected', 'missing_required_information', 'invalid_item'")
    reasons: List[str] = Field(default_factory=list, description="Descriptive list of firewall evaluation points")
    checked_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# --- Phase 4: Execution & Export Models ---

class ExportDispatchBatchRequest(BaseModel):
    task_ids: Optional[List[str]] = Field(None, description="Specific task IDs to export. If omitted, exports all currently firewall-eligible items.")


class BlockedExportItem(BaseModel):
    task_id: str
    title: str
    block_reason: str
    reasons: List[str] = Field(default_factory=list)


class ExportDispatchResult(BaseModel):
    dispatched_count: int
    blocked_count: int
    exported_task_ids: List[str]
    blocked_items: List[BlockedExportItem] = Field(default_factory=list)
    exported_at: str


class ExportSummary(BaseModel):
    total_items: int
    total_commitments: int
    approved_count: int
    firewall_eligible_count: int
    exported_count: int
    pending_export_count: int
    blocked_count: int
    last_exported_at: Optional[str] = None


class ExportRecord(BaseModel):
    task_id: str
    meeting_id: str
    meeting_title: str
    meeting_date: Optional[str] = None
    category: str
    title: str
    description: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[str] = None
    approval_status: str
    evidence_verified: bool
    source_text: Optional[str] = None
    execution_status: str
    exported_at: Optional[str] = None


class ExportJsonResponse(BaseModel):
    export_timestamp: str
    total_exported: int
    items: List[ExportRecord]


# --- Phase 5: Tracking & Accountability Schemas ---

class TaskStatusUpdateRequest(BaseModel):
    task_status: TaskStatus = Field(..., description="Target progress status: 'pending', 'in_progress', 'completed'")
    note: Optional[str] = Field(None, description="Optional transition note or rationale")


class TaskHistoryEntry(BaseModel):
    history_id: str
    task_id: str
    event_type: str = Field(..., description="'extracted', 'approved', 'rejected', 'edited', 'exported', 'status_changed'")
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    details: Optional[str] = None
    created_at: str


class TrackingDashboardResponse(BaseModel):
    total_items: int
    total_commitments: int
    completed_count: int
    in_progress_count: int
    pending_count: int
    overdue_count: int
    due_soon_count: int
    unassigned_owner_count: int
    completion_rate_percent: float
    overdue_items: List[Dict[str, Any]]
    unassigned_items: List[Dict[str, Any]]
    recent_history: List[TaskHistoryEntry]



