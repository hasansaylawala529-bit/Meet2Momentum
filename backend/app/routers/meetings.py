from typing import List
from fastapi import APIRouter, HTTPException, status
from app.models import MeetingCreate, MeetingResponse
from app.database import insert_meeting, list_meetings, get_meeting

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
