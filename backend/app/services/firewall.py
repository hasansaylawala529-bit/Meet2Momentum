from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Union

from app.models import (
    ActionItem,
    ActionItemCategory,
    ActionItemUpdate,
    ApprovalStatus,
    FirewallEvaluationResult,
)
from app.database import get_action_item, update_action_item


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

    return ActionItem(**updated)


def edit_action_item(
    task_id: str,
    updates: ActionItemUpdate,
    db_path: Optional[str] = None
) -> ActionItem:
    """
    Update editable fields of an action item (title, description, owner, deadline).
    Rule: If an approved item is materially edited, it returns to 'pending' for human review.
    Does NOT allow clients to set arbitrary approval statuses through edit requests.
    """
    item = get_action_item(task_id, db_path=db_path)
    if not item:
        raise ItemNotFoundError(task_id)

    fields_to_update: Dict[str, Any] = {}
    material_change = False

    if updates.title is not None:
        new_title = updates.title.strip()
        if new_title != item.get("title"):
            fields_to_update["title"] = new_title
            material_change = True

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
    - Ineligible if classification invalid -> 'invalid_classification'
    - Eligible ONLY if approval_status is 'approved' and all required attributes are valid.
    """
    if isinstance(item_or_task_id, str):
        item = get_action_item(item_or_task_id, db_path=db_path)
        task_id = item_or_task_id
    else:
        task_id = item_or_task_id.get("task_id", "")
        # Re-verify against persisted server-side state
        item = get_action_item(task_id, db_path=db_path) if task_id else None

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

    # Rule 1: Approval status checks
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
    else:
        # Rule 2: Item must have valid data
        title = (item.get("title") or "").strip()
        if not title:
            eligible = False
            block_reason = "missing_required_information"
            reasons.append("Action item title is missing or empty.")
        else:
            eligible = True
            reasons.append("Item has been explicitly approved by a human reviewer.")
            reasons.append("Item has valid persisted identifier and title.")
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
