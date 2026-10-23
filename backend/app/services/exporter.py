import csv
import io
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from app.config import DATABASE_PATH
from app.database import (
    get_db_connection,
    get_action_item,
    list_action_items,
    get_meeting,
    list_meetings,
    mark_action_item_exported,
    get_export_summary as db_get_export_summary,
)
from app.models import (
    ActionItem,
    ExportRecord,
    ExportJsonResponse,
    ExportDispatchResult,
    BlockedExportItem,
    ExportSummary,
)
from app.services.firewall import (
    evaluate_commitment_firewall,
    FirewallValidationError,
    ItemNotFoundError,
)


def build_export_records(
    meeting_id: Optional[str] = None,
    only_eligible: bool = True,
    db_path: Optional[str] = None
) -> List[ExportRecord]:
    """
    Construct fully enriched export records for commitments and action items.
    Enforces Commitment Firewall: if only_eligible=True, strictly excludes blocked items.
    """
    path = db_path or DATABASE_PATH
    meetings = list_meetings(db_path=path)
    meeting_map = {m["meeting_id"]: m for m in meetings}

    items = list_action_items(meeting_id=meeting_id, db_path=path)
    records: List[ExportRecord] = []

    for item in items:
        # Evaluate firewall eligibility server-side
        firewall_res = evaluate_commitment_firewall(item, db_path=path)

        # Enforce Commitment Firewall gate
        if only_eligible and not firewall_res.eligible:
            continue

        meeting_info = meeting_map.get(item["meeting_id"], {})
        meeting_title = meeting_info.get("title", item["meeting_id"])
        meeting_date = meeting_info.get("meeting_date")

        record = ExportRecord(
            task_id=item["task_id"],
            meeting_id=item["meeting_id"],
            meeting_title=meeting_title,
            meeting_date=meeting_date,
            category=item["category"],
            title=item["title"],
            description=item.get("description"),
            owner=item.get("owner"),
            due_date=item.get("due_date"),
            approval_status=item.get("approval_status", "pending"),
            evidence_verified=bool(item.get("evidence_verified", True)),
            source_text=item.get("source_text"),
            execution_status=item.get("execution_status", "not_exported"),
            exported_at=item.get("exported_at"),
        )
        records.append(record)

    return records


def generate_commitments_csv(records: List[ExportRecord]) -> str:
    """Generate RFC 4180 compliant CSV from export records."""
    output = io.StringIO()
    writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")

    # CSV Header Row
    writer.writerow([
        "Task ID",
        "Meeting ID",
        "Meeting Title",
        "Meeting Date",
        "Category",
        "Title",
        "Description",
        "Assigned Owner",
        "Deadline",
        "Approval Status",
        "Evidence Grounded",
        "Verbatim Evidence Excerpt",
        "Execution Status",
        "Exported At",
    ])

    for r in records:
        writer.writerow([
            r.task_id,
            r.meeting_id,
            r.meeting_title,
            r.meeting_date or "N/A",
            r.category,
            r.title,
            r.description or "",
            r.owner or "Unassigned",
            r.due_date or "Unspecified",
            r.approval_status,
            "Yes" if r.evidence_verified else "No",
            r.source_text or "",
            r.execution_status,
            r.exported_at or "Not Exported",
        ])

    return output.getvalue()


def generate_commitments_json(records: List[ExportRecord]) -> ExportJsonResponse:
    """Generate structured JSON representation of exported commitments."""
    return ExportJsonResponse(
        export_timestamp=datetime.now(timezone.utc).isoformat(),
        total_exported=len(records),
        items=records,
    )


def dispatch_export_batch(
    task_ids: Optional[List[str]] = None,
    db_path: Optional[str] = None
) -> ExportDispatchResult:
    """
    Dispatch export for candidate items while deterministically enforcing the Commitment Firewall.
    Updates execution_status to 'exported' and records exported_at timestamp.
    """
    path = db_path or DATABASE_PATH
    now_iso = datetime.now(timezone.utc).isoformat()

    candidate_items: List[Dict[str, Any]] = []

    if task_ids is not None:
        for tid in task_ids:
            item = get_action_item(tid, db_path=path)
            if item:
                candidate_items.append(item)
            else:
                candidate_items.append({
                    "task_id": tid,
                    "title": "Unknown Item",
                    "missing": True
                })
    else:
        # Default: all currently approved items across the workspace
        all_items = list_action_items(db_path=path)
        candidate_items = [i for i in all_items if i.get("approval_status") == "approved"]

    dispatched_task_ids: List[str] = []
    blocked_items: List[BlockedExportItem] = []

    for item in candidate_items:
        tid = item["task_id"]
        if item.get("missing"):
            blocked_items.append(BlockedExportItem(
                task_id=tid,
                title="Unknown Item",
                block_reason="invalid_item",
                reasons=[f"Action item '{tid}' does not exist in the database."]
            ))
            continue

        firewall_res = evaluate_commitment_firewall(item, db_path=path)

        if firewall_res.eligible:
            updated = mark_action_item_exported(tid, exported_at=now_iso, db_path=path)
            if updated:
                dispatched_task_ids.append(tid)
            else:
                blocked_items.append(BlockedExportItem(
                    task_id=tid,
                    title=item.get("title", ""),
                    block_reason="database_write_error",
                    reasons=["Failed to update database record."]
                ))
        else:
            blocked_items.append(BlockedExportItem(
                task_id=tid,
                title=item.get("title", ""),
                block_reason=firewall_res.block_reason or "firewall_blocked",
                reasons=firewall_res.reasons,
            ))

    return ExportDispatchResult(
        dispatched_count=len(dispatched_task_ids),
        blocked_count=len(blocked_items),
        exported_task_ids=dispatched_task_ids,
        blocked_items=blocked_items,
        exported_at=now_iso,
    )


def export_single_action_item(
    task_id: str,
    db_path: Optional[str] = None
) -> ActionItem:
    """
    Export single action item with deterministic Commitment Firewall gate.
    Raises FirewallValidationError if the item is not eligible for execution.
    """
    path = db_path or DATABASE_PATH
    item = get_action_item(task_id, db_path=path)
    if not item:
        raise ItemNotFoundError(task_id)

    firewall_res = evaluate_commitment_firewall(item, db_path=path)
    if not firewall_res.eligible:
        reason_desc = firewall_res.block_reason or "firewall_blocked"
        reasons_text = "; ".join(firewall_res.reasons) if firewall_res.reasons else "Item is not eligible."
        raise FirewallValidationError(
            f"Commitment Firewall blocked execution for item '{task_id}'. Block reason: {reason_desc} ({reasons_text})",
            status_code=400
        )

    updated = mark_action_item_exported(task_id, db_path=path)
    if not updated:
        raise ItemNotFoundError(task_id)

    return ActionItem(**updated)


def get_export_summary_service(db_path: Optional[str] = None) -> ExportSummary:
    """Retrieve workspace-level export summary."""
    path = db_path or DATABASE_PATH
    data = db_get_export_summary(db_path=path)
    return ExportSummary(**data)
