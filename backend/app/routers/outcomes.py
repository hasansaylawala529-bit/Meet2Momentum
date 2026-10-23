from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from app.models import Decision, ActionItem
from app.database import list_decisions, list_action_items

decisions_router = APIRouter(prefix="/api/decisions", tags=["decisions"])
action_items_router = APIRouter(prefix="/api/action-items", tags=["action_items"])


@decisions_router.get("", response_model=List[Decision])
def get_all_decisions(meeting_id: Optional[str] = Query(None, description="Optional meeting ID filter")) -> List[Decision]:
    """Retrieve all persisted decisions across the workspace or filtered by meeting."""
    try:
        decisions = list_decisions(meeting_id=meeting_id)
        return [Decision(**d) for d in decisions]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve decisions: {str(e)}"
        )


@action_items_router.get("", response_model=List[ActionItem])
def get_all_action_items(
    meeting_id: Optional[str] = Query(None, description="Optional meeting ID filter"),
    category: Optional[str] = Query(None, description="Optional category filter")
) -> List[ActionItem]:
    """Retrieve all persisted action items across the workspace, optionally filtered."""
    try:
        items = list_action_items(meeting_id=meeting_id, category=category)
        return [ActionItem(**i) for i in items]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve action items: {str(e)}"
        )
