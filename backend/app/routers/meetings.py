from typing import List, Optional
from fastapi import APIRouter, HTTPException, status
from app.models import (
    MeetingCreate,
    MeetingResponse,
    Decision,
    ActionItem,
    ExtractionResponse,
)
from app.database import (
    insert_meeting,
    list_meetings,
    get_meeting,
    list_decisions,
    list_action_items,
)

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.post("", response_model=MeetingResponse, status_code=status.HTTP_201_CREATED)
def create_meeting(payload: MeetingCreate) -> MeetingResponse:
    """Ingest a new meeting transcript, validate, and persist to SQLite."""
    try:
        saved = insert_meeting(
            title=payload.title,
            transcript=payload.transcript,
            meeting_date=payload.meeting_date
        )
        return MeetingResponse(**saved)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist meeting record: {str(e)}"
        )


@router.get("", response_model=List[MeetingResponse])
def get_all_meetings() -> List[MeetingResponse]:
    """Retrieve all persisted meetings."""
    try:
        meetings = list_meetings()
        return [MeetingResponse(**m) for m in meetings]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve meetings: {str(e)}"
        )


@router.get("/{meeting_id}", response_model=MeetingResponse)
def get_meeting_by_id(meeting_id: str) -> MeetingResponse:
    """Retrieve a single meeting record by its unique identifier."""
    meeting = get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID '{meeting_id}' not found."
        )
    return MeetingResponse(**meeting)


@router.post("/{meeting_id}/extract", response_model=ExtractionResponse)
def extract_meeting(meeting_id: str) -> ExtractionResponse:
    """
    Extract decisions, commitments, suggestions, and unresolved questions
    from a saved meeting transcript using Google Gemini AI.
    """
    meeting = get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID '{meeting_id}' not found."
        )

    transcript = meeting.get("transcript")
    if not transcript or not transcript.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The meeting does not have a valid transcript to extract outcomes from."
        )

    try:
        from app.services.extractor import extract_meeting_outcomes
        result = extract_meeting_outcomes(
            meeting_id=meeting_id,
            title=meeting.get("title", "Untitled Meeting"),
            transcript=transcript,
            meeting_date=meeting.get("meeting_date"),
        )
        return result
    except ValueError as e:
        # Configuration error or invalid input/transcript
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except RuntimeError as e:
        # Upstream AI service failure or sanitized API authentication failure
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected extraction failure: {str(e)}"
        )


@router.get("/{meeting_id}/decisions", response_model=List[Decision])
def get_meeting_decisions(meeting_id: str) -> List[Decision]:
    """Retrieve all decisions extracted for a specific meeting."""
    meeting = get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID '{meeting_id}' not found."
        )
    decisions = list_decisions(meeting_id=meeting_id)
    return [Decision(**d) for d in decisions]


@router.get("/{meeting_id}/action-items", response_model=List[ActionItem])
def get_meeting_action_items(
    meeting_id: str,
    approval_status: Optional[str] = None
) -> List[ActionItem]:
    """Retrieve all action items extracted for a specific meeting, optionally filtered by approval_status."""
    meeting = get_meeting(meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Meeting with ID '{meeting_id}' not found."
        )
    items = list_action_items(meeting_id=meeting_id, approval_status=approval_status)
    return [ActionItem(**i) for i in items]

