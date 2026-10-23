from datetime import datetime, timezone
from enum import Enum
from typing import Optional
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


# --- Decision Schema ---

class Decision(BaseModel):
    decision_id: str
    meeting_id: str
    title: str
    description: Optional[str] = None
    source_text: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# --- Action Item Schema ---

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
    duplicate_of: Optional[str] = None
    conflict_flag: bool = False
    approval_status: ApprovalStatus = ApprovalStatus.PENDING
    execution_status: ExecutionStatus = ExecutionStatus.NOT_EXPORTED
    task_status: TaskStatus = TaskStatus.PENDING
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
