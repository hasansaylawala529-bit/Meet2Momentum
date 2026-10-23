from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.models import (
    ActionItem,
    TaskStatusUpdateRequest,
    TaskHistoryEntry,
    TrackingDashboardResponse,
)
from app.database import get_task_history, list_all_history, get_action_item, update_action_item_progress
from app.services.tracker import (
    get_tracking_dashboard_service,
    enrich_action_item_schedule,
)

tracking_router = APIRouter(prefix="/api/tracking", tags=["Tracking & Accountability"])
action_tracking_router = APIRouter(prefix="/api/action-items", tags=["Action Items Progress & History"])


@tracking_router.get(
    "/dashboard",
    response_model=TrackingDashboardResponse,
    summary="Get tracking and accountability dashboard metrics",
    description="Calculates real-time completion rates, progress counts, overdue alerts, unassigned tasks, and recent audit history."
)
def get_tracking_dashboard():
    try:
        return get_tracking_dashboard_service()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate tracking dashboard: {str(e)}"
        )


@tracking_router.get(
    "/audit-log",
    response_model=List[TaskHistoryEntry],
    summary="Get workspace-wide audit log",
    description="Returns recent audit events for all action items across the workspace."
)
def get_workspace_audit_log(limit: int = Query(50, ge=1, le=200, description="Max audit entries to return")):
    try:
        records = list_all_history(limit=limit)
        return [TaskHistoryEntry(**r) for r in records]
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve audit log: {str(e)}"
        )


@action_tracking_router.get(
    "/{task_id}/history",
    response_model=List[TaskHistoryEntry],
    summary="Get single task audit history",
    description="Returns the complete chronological lifecycle event log for a specific action item."
)
def get_task_audit_history(task_id: str):
    item = get_action_item(task_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action item with ID '{task_id}' not found."
        )
    records = get_task_history(task_id)
    return [TaskHistoryEntry(**r) for r in records]


@action_tracking_router.patch(
    "/{task_id}/status",
    response_model=ActionItem,
    summary="Update task execution progress status",
    description="Updates task_status (pending, in_progress, completed) and logs the transition in the audit history."
)
def update_task_status_endpoint(task_id: str, payload: TaskStatusUpdateRequest):
    target_status = payload.task_status.value
    updated = update_action_item_progress(task_id, target_status, note=payload.note)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action item with ID '{task_id}' not found."
        )
    return ActionItem(**enrich_action_item_schedule(updated))
