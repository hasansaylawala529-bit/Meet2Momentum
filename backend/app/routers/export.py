from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response

from app.models import (
    ActionItem,
    ExportJsonResponse,
    ExportDispatchBatchRequest,
    ExportDispatchResult,
    ExportSummary,
)
from app.services.exporter import (
    build_export_records,
    generate_commitments_csv,
    generate_commitments_json,
    dispatch_export_batch,
    export_single_action_item,
    get_export_summary_service,
)
from app.services.firewall import FirewallValidationError, ItemNotFoundError

router = APIRouter(prefix="/api/export", tags=["Export & Execution"])


@router.get(
    "/csv",
    summary="Download approved commitments as CSV",
    description="Generates an RFC-compliant CSV containing verified and approved commitments ready for downstream execution.",
)
def export_csv_endpoint(
    meeting_id: Optional[str] = Query(None, description="Optional meeting ID filter"),
    only_eligible: bool = Query(True, description="Strictly enforce Commitment Firewall (exclude unapproved/blocked items)"),
):
    try:
        records = build_export_records(meeting_id=meeting_id, only_eligible=only_eligible)
        csv_data = generate_commitments_csv(records)
        filename = f"meet2momentum_commitments_{meeting_id}.csv" if meeting_id else "meet2momentum_commitments.csv"

        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "text/csv; charset=utf-8",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate CSV export: {str(e)}")


@router.get(
    "/json",
    response_model=ExportJsonResponse,
    summary="Export approved commitments as structured JSON",
    description="Returns structured export records with full transcript citation and approval metadata.",
)
def export_json_endpoint(
    meeting_id: Optional[str] = Query(None, description="Optional meeting ID filter"),
    only_eligible: bool = Query(True, description="Strictly enforce Commitment Firewall"),
):
    try:
        records = build_export_records(meeting_id=meeting_id, only_eligible=only_eligible)
        return generate_commitments_json(records)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate JSON export: {str(e)}")


@router.get(
    "/summary",
    response_model=ExportSummary,
    summary="Get execution and export summary metrics",
    description="Provides real-time counts for eligible, exported, pending, and blocked commitments across the workspace.",
)
def export_summary_endpoint():
    try:
        return get_export_summary_service()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve export summary: {str(e)}")


@router.post(
    "/dispatch",
    response_model=ExportDispatchResult,
    summary="Dispatch export batch and update execution statuses",
    description="Evaluates each candidate through the Commitment Firewall, marks eligible items as exported, and records blocked items.",
)
def dispatch_export_endpoint(request: Optional[ExportDispatchBatchRequest] = None):
    try:
        task_ids = request.task_ids if request else None
        return dispatch_export_batch(task_ids=task_ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export dispatch failed: {str(e)}")


# Router for action-items export endpoint
action_export_router = APIRouter(prefix="/api/action-items", tags=["Action Items Execution"])


@action_export_router.post(
    "/{task_id}/export",
    response_model=ActionItem,
    summary="Export single action item",
    description="Deterministically validates eligibility through the Commitment Firewall and transitions execution_status to 'exported'.",
)
def export_single_item_endpoint(task_id: str):
    try:
        return export_single_action_item(task_id)
    except ItemNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FirewallValidationError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export action item: {str(e)}")
