from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from app.models import (
    Decision,
    ActionItem,
    ActionItemUpdate,
    ApprovalActionRequest,
    FirewallEvaluationResult,
)
from app.database import list_decisions, list_action_items, get_action_item
from app.services.firewall import (
    approve_action_item,
    reject_action_item,
    edit_action_item,
    evaluate_commitment_firewall,
    FirewallValidationError,
    ItemNotFoundError,
)

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
    category: Optional[str] = Query(None, description="Optional category filter"),
    approval_status: Optional[str] = Query(None, description="Optional approval status filter (pending, approved, rejected)")
) -> List[ActionItem]:
    """Retrieve all persisted action items across the workspace, optionally filtered."""
    try:
        items = list_action_items(
            meeting_id=meeting_id,
            category=category,
            approval_status=approval_status
        )
        return [ActionItem(**i) for i in items]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve action items: {str(e)}"
        )


@action_items_router.get("/firewall/evaluations", response_model=List[FirewallEvaluationResult])
def evaluate_all_action_items_firewall(
    meeting_id: Optional[str] = Query(None, description="Optional meeting ID filter")
) -> List[FirewallEvaluationResult]:
    """
    Evaluate Commitment Firewall eligibility across action items.
    Returns deterministic server-evaluated eligibility results.
    """
    try:
        items = list_action_items(meeting_id=meeting_id)
        results = [evaluate_commitment_firewall(item) for item in items]
        return results
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Firewall evaluation failed: {str(e)}"
        )


@action_items_router.get("/{task_id}", response_model=ActionItem)
def get_single_action_item(task_id: str) -> ActionItem:
    """Retrieve a single action item by its unique identifier."""
    item = get_action_item(task_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action item with ID '{task_id}' not found."
        )
    return ActionItem(**item)


@action_items_router.patch("/{task_id}", response_model=ActionItem)
def update_action_item_endpoint(task_id: str, payload: ActionItemUpdate) -> ActionItem:
    """
    Edit proposed action item fields (title, description, owner, due_date).
    Enforces review rule: If an approved item is materially edited, it returns to 'pending'.
    Does not allow arbitrary approval_status manipulation.
    """
    try:
        updated = edit_action_item(task_id, payload)
        return updated
    except ItemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except FirewallValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update action item: {str(e)}"
        )


@action_items_router.post("/{task_id}/approve", response_model=ActionItem)
def approve_action_item_endpoint(
    task_id: str,
    payload: Optional[ApprovalActionRequest] = None
) -> ActionItem:
    """
    Explicitly approve a pending action item.
    Enforces review workflow: only pending items can be approved.
    """
    try:
        note = payload.note if payload else None
        approved = approve_action_item(task_id, note=note)
        return approved
    except ItemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except FirewallValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve action item: {str(e)}"
        )


@action_items_router.post("/{task_id}/reject", response_model=ActionItem)
def reject_action_item_endpoint(
    task_id: str,
    payload: Optional[ApprovalActionRequest] = None
) -> ActionItem:
    """
    Explicitly reject a pending action item.
    Enforces review workflow: only pending items can be rejected.
    """
    try:
        note = payload.note if payload else None
        rejected = reject_action_item(task_id, note=note)
        return rejected
    except ItemNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except FirewallValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject action item: {str(e)}"
        )


@action_items_router.get("/{task_id}/firewall", response_model=FirewallEvaluationResult)
def evaluate_single_action_item_firewall(task_id: str) -> FirewallEvaluationResult:
    """
    Evaluate Commitment Firewall eligibility for a single action item.
    Returns deterministic server-side evaluation.
    """
    result = evaluate_commitment_firewall(task_id)
    if result.block_reason == "invalid_item":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action item with ID '{task_id}' not found."
        )
    return result

