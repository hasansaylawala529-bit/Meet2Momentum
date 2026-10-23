from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union

from app.models import (
    ActionItem,
    ActionItemCategory,
    ActionItemUpdate,
    ApprovalStatus,
    FirewallEvaluationResult,
)
from app.database import get_action_item, update_action_item, log_task_history
from app.services.detector import detect_duplicates_and_conflicts


class FirewallValidationError(Exception):
    """Raised when an approval transition or action item validation fails."""
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ItemNotFoundError(Exception):
    """Raised when an action item is not found in the database."""
    def __init__(self, task_id: str):
        super().__init__(f"Action item with ID '{task_id}' not found.")
        self.task_id = task_id
        self.status_code = 404


def approve_action_item(
    task_id: str,
    note: Optional[str] = None,
    db_path: Optional[str] = None
) -> ActionItem:
    """
    Explicitly approve a pending action item.
    Enforces review workflow: only pending items can be approved.
    Preserves original classification (commitments, suggestions, unresolved questions).
    """
    item = get_action_item(task_id, db_path=db_path)
    if not item:
        raise ItemNotFoundError(task_id)

    current_status = item.get("approval_status", ApprovalStatus.PENDING.value)

    if current_status == ApprovalStatus.APPROVED.value:
        raise FirewallValidationError(
            f"Action item '{task_id}' is already approved. Cannot re-approve an approved item.",
            status_code=400
        )

    if current_status == ApprovalStatus.REJECTED.value:
        raise FirewallValidationError(
            f"Action item '{task_id}' is rejected. Rejected items cannot be approved directly.",
            status_code=400
        )

    if current_status != ApprovalStatus.PENDING.value:
        raise FirewallValidationError(
            f"Invalid status transition from '{current_status}' to 'approved'. Only pending items can be approved.",
            status_code=400
        )

    updates: Dict[str, Any] = {
        "approval_status": ApprovalStatus.APPROVED.value,
    }

    if note and note.strip():
        existing_note = item.get("clarification_note") or ""
        combined_note = f"{existing_note} [Reviewer approval note: {note.strip()}]".strip()
        updates["clarification_note"] = combined_note

    updated = update_action_item(task_id, updates, db_path=db_path)
    if not updated:
        raise ItemNotFoundError(task_id)

    note_detail = f"Approved by human reviewer{f': {note.strip()}' if note and note.strip() else ''}"
    log_task_history(
        task_id=task_id,
        event_type="approved",
        old_value=current_status,
        new_value=ApprovalStatus.APPROVED.value,
        details=note_detail,
        db_path=db_path
    )

    return ActionItem(**updated)


def reject_action_item(
    task_id: str,
    note: Optional[str] = None,
    db_path: Optional[str] = None
) -> ActionItem:
    """
    Explicitly reject a pending action item.
    Enforces review workflow: only pending items can be rejected.
    """
    item = get_action_item(task_id, db_path=db_path)
    if not item:
        raise ItemNotFoundError(task_id)

    current_status = item.get("approval_status", ApprovalStatus.PENDING.value)

    if current_status == ApprovalStatus.REJECTED.value:
        raise FirewallValidationError(
            f"Action item '{task_id}' is already rejected.",
            status_code=400
        )

    if current_status == ApprovalStatus.APPROVED.value:
        raise FirewallValidationError(
            f"Action item '{task_id}' is already approved. Cannot reject an approved item directly.",
            status_code=400
        )

    if current_status != ApprovalStatus.PENDING.value:
        raise FirewallValidationError(
            f"Invalid status transition from '{current_status}' to 'rejected'. Only pending items can be rejected.",
            status_code=400
        )

    updates: Dict[str, Any] = {
        "approval_status": ApprovalStatus.REJECTED.value,
    }

    if note and note.strip():
        existing_note = item.get("clarification_note") or ""
        combined_note = f"{existing_note} [Rejection reason: {note.strip()}]".strip()
        updates["clarification_note"] = combined_note

    updated = update_action_item(task_id, updates, db_path=db_path)
    if not updated:
        raise ItemNotFoundError(task_id)

    rejection_detail = f"Rejected by human reviewer{f': {note.strip()}' if note and note.strip() else ''}"
    log_task_history(
        task_id=task_id,
        event_type="rejected",
        old_value=current_status,
        new_value=ApprovalStatus.REJECTED.value,
        details=rejection_detail,
        db_path=db_path
    )

    return ActionItem(**updated)


UNRESOLVED_OWNERS = {
    "unassigned", "tbd", "unknown", "none", "n/a", "unspecified", "anyone", "someone", "team"
}


def is_resolved_owner(owner: Optional[str]) -> bool:
    """Check if owner is resolved to a specific human name, not empty or placeholder."""
    if not owner or not owner.strip():
        return False
    return owner.strip().lower() not in UNRESOLVED_OWNERS


def edit_action_item(
    task_id: str,
    updates: ActionItemUpdate,
    db_path: Optional[str] = None
) -> ActionItem:
    """
    Update editable fields of an action item (title, description, owner, deadline).
    Rule: If an approved item is materially edited, it returns to 'pending' for human review.
    Does NOT allow clients to set arbitrary approval statuses through edit requests.
    Preserves duplicate flags unless title has materially changed.
    """
    item = get_action_item(task_id, db_path=db_path)
    if not item:
        raise ItemNotFoundError(task_id)

    fields_to_update: Dict[str, Any] = {}
    material_change = False
    title_changed = False

    if updates.title is not None:
        new_title = updates.title.strip()
        if new_title != item.get("title"):
            fields_to_update["title"] = new_title
            material_change = True
            title_changed = True

    if updates.description is not None:
        new_desc = updates.description.strip() if updates.description else None
        if new_desc != item.get("description"):
            fields_to_update["description"] = new_desc
            material_change = True

    if updates.owner is not None:
        new_owner = updates.owner.strip() if updates.owner else None
        if new_owner != item.get("owner"):
            fields_to_update["owner"] = new_owner
            material_change = True

    if updates.due_date is not None:
        new_date = updates.due_date.strip() if updates.due_date else None
        if new_date != item.get("due_date"):
            fields_to_update["due_date"] = new_date
            material_change = True

    if updates.clarification_note is not None:
        fields_to_update["clarification_note"] = updates.clarification_note.strip() if updates.clarification_note else None

    # Material change rule: if item was approved and materially changed, reset to pending
    current_status = item.get("approval_status", ApprovalStatus.PENDING.value)
    if current_status == ApprovalStatus.APPROVED.value and material_change:
        fields_to_update["approval_status"] = ApprovalStatus.PENDING.value

    updated = update_action_item(task_id, fields_to_update, db_path=db_path)
    if not updated:
        raise ItemNotFoundError(task_id)

    # Re-evaluate duplicates and conflicts only when title/owner/deadline change
    if material_change and updated:
        re_evaluated = detect_duplicates_and_conflicts([updated], meeting_id=updated.get("meeting_id"), db_path=db_path)
        if re_evaluated:
            eval_item = re_evaluated[0]
            detection_updates: Dict[str, Any] = {
                "conflict_flag": eval_item.get("conflict_flag", False),
                "conflict_note": eval_item.get("conflict_note"),
            }
            # Only update duplicate_of / duplicate_note if title actually changed
            # This prevents edits to owner/deadline/description from wiping duplicate flags
            if title_changed:
                detection_updates["duplicate_of"] = eval_item.get("duplicate_of")
                detection_updates["duplicate_note"] = eval_item.get("duplicate_note")
            elif not item.get("duplicate_of") and eval_item.get("duplicate_of"):
                detection_updates["duplicate_of"] = eval_item.get("duplicate_of")
                detection_updates["duplicate_note"] = eval_item.get("duplicate_note")

            updated = update_action_item(task_id, detection_updates, db_path=db_path) or updated

    if fields_to_update:
        mod_fields = list(fields_to_update.keys())
        is_reset = fields_to_update.get("approval_status") == ApprovalStatus.PENDING.value
        edit_detail = f"Fields modified: {', '.join(mod_fields)}" + (" (Material edit reset status to pending review)" if is_reset else "")
        log_task_history(
            task_id=task_id,
            event_type="edited",
            old_value=current_status,
            new_value=fields_to_update.get("approval_status", current_status),
            details=edit_detail,
            db_path=db_path
        )

    return ActionItem(**updated)


def evaluate_commitment_firewall(
    item_or_task_id: Union[str, Dict[str, Any]],
    db_path: Optional[str] = None
) -> FirewallEvaluationResult:
    """
    Deterministic backend Commitment Firewall.
    Decides whether an action item is eligible for downstream execution or export.
    Uses strictly persisted server-side state, never trusting unverified client claims.

    Eligibility Rules:
    - Ineligible if approval_status is 'pending' -> 'approval_pending'
    - Ineligible if approval_status is 'rejected' -> 'item_rejected'
    - Ineligible if item record missing or invalid -> 'invalid_item'
    - Ineligible if required fields (title, task_id) missing -> 'missing_required_information'
    - Ineligible if category is NOT 'commitment' -> 'not_a_commitment'
    - Ineligible if owner is unresolved ('unassigned', 'tbd', etc.) -> 'unresolved_owner'
    - Ineligible if evidence is unverified -> 'unverified_evidence'
    - Ineligible if item has an unresolved conflict -> 'unresolved_conflict'
    - Eligible ONLY if approval_status is 'approved' AND category is 'commitment'
      AND owner is resolved AND evidence is verified AND conflict_flag is false.
    """
    if isinstance(item_or_task_id, str):
        item = get_action_item(item_or_task_id, db_path=db_path)
        task_id = item_or_task_id
    else:
        task_id = item_or_task_id.get("task_id", "")
        # Re-verify against persisted server-side state when possible
        db_item = get_action_item(task_id, db_path=db_path) if task_id else None
        item = db_item if db_item is not None else item_or_task_id

    now_iso = datetime.now(timezone.utc).isoformat()

    if not item:
        return FirewallEvaluationResult(
            task_id=task_id,
            meeting_id="",
            title="Unknown Item",
            category=ActionItemCategory.COMMITMENT,
            approval_status=ApprovalStatus.PENDING,
            eligible=False,
            firewall_status="blocked",
            block_reason="invalid_item",
            reasons=["Action item does not exist in server database."],
            checked_at=now_iso,
        )

    approval_status_val = item.get("approval_status", ApprovalStatus.PENDING.value)
    category_val = item.get("category", ActionItemCategory.COMMITMENT.value)

    # Safe enum casting
    try:
        app_status_enum = ApprovalStatus(approval_status_val)
    except ValueError:
        app_status_enum = ApprovalStatus.PENDING

    try:
        cat_enum = ActionItemCategory(category_val)
    except ValueError:
        cat_enum = ActionItemCategory.COMMITMENT

    reasons: List[str] = []
    eligible = False
    block_reason: Optional[str] = None

    # Rule 1: Title and core identifiers
    title = (item.get("title") or "").strip()
    if not title:
        return FirewallEvaluationResult(
            task_id=item.get("task_id", task_id),
            meeting_id=item.get("meeting_id", ""),
            title="Untitled Item",
            category=cat_enum,
            approval_status=app_status_enum,
            eligible=False,
            firewall_status="blocked",
            block_reason="missing_required_information",
            reasons=["Action item title is missing or empty."],
            checked_at=now_iso,
        )

    # Rule 2: Approval status checks
    if approval_status_val == ApprovalStatus.PENDING.value:
        eligible = False
        block_reason = "approval_pending"
        reasons.append("Item is pending human review and approval. Core Principle: AI proposes, humans approve.")
    elif approval_status_val == ApprovalStatus.REJECTED.value:
        eligible = False
        block_reason = "item_rejected"
        reasons.append("Item was rejected by human reviewer. Blocked from downstream execution.")
    elif approval_status_val != ApprovalStatus.APPROVED.value:
        eligible = False
        block_reason = "invalid_status"
        reasons.append(f"Invalid approval status '{approval_status_val}'.")
    # Rule 3: Category must be commitment (suggestions and open questions are blocked)
    elif cat_enum != ActionItemCategory.COMMITMENT:
        eligible = False
        block_reason = "not_a_commitment"
        reasons.append(
            f"Only approved commitments can pass the Commitment Firewall. "
            f"Current category is '{cat_enum.value}'. Suggestions and questions are non-binding."
        )
    # Rule 4: Resolved human owner is mandatory
    elif not is_resolved_owner(item.get("owner")):
        eligible = False
        raw_owner = item.get("owner")
        block_reason = "unresolved_owner"
        reasons.append(
            f"Action item owner is unresolved ('{raw_owner or 'Unassigned'}'). "
            "A resolved human owner is strictly required by the Commitment Firewall."
        )
    # Rule 5: Deterministic grounded evidence verification
    elif not bool(item.get("evidence_verified")):
        eligible = False
        block_reason = "unverified_evidence"
        reasons.append(
            "Action item evidence could not be verified against the meeting transcript. "
            "Deterministic grounded evidence is required to pass the Commitment Firewall."
        )
    # Rule 6: Block unresolved conflicts
    elif bool(item.get("conflict_flag")):
        eligible = False
        block_reason = "unresolved_conflict"
        conflict_note = item.get("conflict_note") or "Conflicting owner or deadline detected across action items."
        reasons.append(f"Action item has an unresolved conflict: {conflict_note}")
    else:
        # All Commitment Firewall conditions satisfied
        eligible = True
        reasons.append("Item has been explicitly approved by a human reviewer.")
        reasons.append("Item is an approved commitment with a resolved owner and verified evidence.")
        reasons.append("No unresolved conflicts detected.")
        reasons.append("Commitment Firewall criteria satisfied for downstream execution.")

    return FirewallEvaluationResult(
        task_id=item.get("task_id", task_id),
        meeting_id=item.get("meeting_id", ""),
        title=item.get("title", ""),
        category=cat_enum,
        approval_status=app_status_enum,
        eligible=eligible,
        firewall_status="eligible" if eligible else "blocked",
        block_reason=block_reason,
        reasons=reasons,
        checked_at=now_iso,
    )
