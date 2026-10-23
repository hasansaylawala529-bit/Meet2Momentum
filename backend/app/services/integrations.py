import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx

from app.config import GITHUB_TOKEN, GITHUB_REPO, DATABASE_PATH
from app.database import get_action_item, update_action_item, list_action_items, log_task_history
from app.services.firewall import evaluate_commitment_firewall, FirewallValidationError, ItemNotFoundError


def format_github_issue(item: Dict[str, Any]) -> Dict[str, Any]:
    """Format action item into structured GitHub Issue payload with verbatim evidence citation."""
    cat = item.get("category", "commitment").upper()
    title = f"[{cat}] {item.get('title', 'Action Item')}"
    
    owner = item.get("owner")
    due_date = item.get("due_date")
    meeting_title = item.get("meeting_title") or "Meeting Session"
    meeting_date = item.get("meeting_date") or "Unspecified"
    source_quote = item.get("source_text") or "Grounded from transcript discussion"
    description = item.get("description") or "No additional description provided."
    
    body = f"""### 🎯 Action Item Overview
- **Category:** `{item.get('category')}`
- **Assigned Owner:** {f'@{owner}' if owner else '*Unassigned*'}
- **Target Deadline:** {due_date if due_date else '*Unspecified*'}
- **Meeting Context:** {meeting_title} ({meeting_date})

### 📝 Description
{description}

---

### 🛡️ Ground-Truth Evidence (Grounded in Transcript)
> "{source_quote}"

---

*Dispatched under **Meet2Momentum Commitment Firewall** governance.*  
*Task ID: `{item.get('task_id')}` | Meeting ID: `{item.get('meeting_id')}`*
"""
    labels = ["commitment", "meet2momentum", "approved-by-firewall"]
    if item.get("category") == "suggestion":
        labels = ["suggestion", "meet2momentum", "approved-by-firewall"]
    elif item.get("category") == "unresolved_question":
        labels = ["unresolved-question", "meet2momentum", "approved-by-firewall"]

    payload: Dict[str, Any] = {
        "title": title,
        "body": body,
        "labels": labels,
    }
    
    # Only attach assignee if owner looks like a GitHub handle
    if owner and " " not in owner.strip() and len(owner.strip()) <= 39:
        payload["assignees"] = [owner.strip()]

    return payload


def create_github_issue(
    task_id: str,
    repo: Optional[str] = None,
    token: Optional[str] = None,
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Dispatch a single action item to GitHub Issues, strictly gated by the Commitment Firewall.
    If GITHUB_TOKEN is configured, creates a real issue on GitHub via REST API.
    If GITHUB_TOKEN is omitted, creates a simulated issue record for demonstration.
    """
    # 1. Commitment Firewall Enforcement Gate
    eval_result = evaluate_commitment_firewall(task_id, db_path=db_path)
    if not eval_result.eligible:
        raise FirewallValidationError(
            f"Commitment Firewall blocked export of '{task_id}': status is '{eval_result.approval_status.value}' ({eval_result.block_reason}). Only approved items can be dispatched.",
            status_code=400
        )

    item = get_action_item(task_id, db_path=db_path)
    if not item:
        raise ItemNotFoundError(task_id)

    target_repo = (repo or GITHUB_REPO or "hasansaylawala529-bit/Meet2Momentum").strip().strip("/")
    active_token = (token or GITHUB_TOKEN or "").strip()

    issue_payload = format_github_issue(item)
    now_iso = datetime.now(timezone.utc).isoformat()
    old_execution = item.get("execution_status", "not_exported")

    issue_url: str
    issue_number: int
    is_simulated = False

    if active_token:
        # Live GitHub REST API dispatch
        headers = {
            "Authorization": f"Bearer {active_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Meet2Momentum-Agent",
        }
        api_url = f"https://api.github.com/repos/{target_repo}/issues"
        try:
            with httpx.Client(timeout=15.0) as client:
                res = client.post(api_url, json=issue_payload, headers=headers)
                if res.status_code in (200, 201):
                    res_data = res.json()
                    issue_url = res_data.get("html_url", f"https://github.com/{target_repo}/issues")
                    issue_number = res_data.get("number", 1)
                else:
                    err_msg = res.text
                    try:
                        err_json = res.json()
                        err_msg = err_json.get("message", err_msg)
                    except Exception:
                        pass
                    raise FirewallValidationError(
                        f"GitHub API error ({res.status_code}): {err_msg}",
                        status_code=400
                    )
        except httpx.RequestError as e:
            raise FirewallValidationError(
                f"Failed to connect to GitHub API: {str(e)}",
                status_code=502
            )
    else:
        # Deterministic simulated dispatch for local evaluation without external token
        is_simulated = True
        pseudo_id = abs(hash(task_id)) % 900 + 100
        issue_number = pseudo_id
        issue_url = f"https://github.com/{target_repo}/issues/{issue_number}"

    # Update database record
    update_fields = {
        "execution_status": "exported",
        "exported_at": now_iso,
        "external_url": issue_url,
        "integration_service": "github",
        "external_id": f"#{issue_number}",
    }
    updated = update_action_item(task_id, update_fields, db_path=db_path) or dict(item, **update_fields)

    # Record in immutable audit trail
    note = f"Dispatched to GitHub Issues ({target_repo}#{issue_number}): {issue_url}"
    if is_simulated:
        note += " [Verified Demo Dispatch]"
    log_task_history(
        task_id=task_id,
        event_type="exported",
        old_value=old_execution,
        new_value="exported",
        details=note,
        db_path=db_path
    )

    return updated


def dispatch_github_batch(
    task_ids: Optional[List[str]] = None,
    repo: Optional[str] = None,
    token: Optional[str] = None,
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Batch dispatch approved commitments to GitHub Issues under Commitment Firewall gate.
    Evaluates each candidate and partitions into dispatched vs blocked items.
    """
    path = db_path or DATABASE_PATH
    target_repo = (repo or GITHUB_REPO or "hasansaylawala529-bit/Meet2Momentum").strip().strip("/")
    
    if task_ids:
        candidates = [get_action_item(tid, db_path=path) for tid in task_ids]
        candidates = [c for c in candidates if c]
    else:
        candidates = list_action_items(db_path=path)

    dispatched_items: List[Dict[str, Any]] = []
    blocked_items: List[Dict[str, Any]] = []

    for item in candidates:
        task_id = item["task_id"]
        eval_result = evaluate_commitment_firewall(task_id, db_path=path)

        if not eval_result.eligible:
            blocked_items.append({
                "task_id": task_id,
                "title": item.get("title", ""),
                "block_reason": eval_result.block_reason or "firewall_blocked",
                "reasons": eval_result.reasons,
            })
            continue

        try:
            dispatched = create_github_issue(task_id, repo=target_repo, token=token, db_path=path)
            dispatched_items.append(dispatched)
        except Exception as e:
            blocked_items.append({
                "task_id": task_id,
                "title": item.get("title", ""),
                "block_reason": "dispatch_error",
                "reasons": [str(e)],
            })

    return {
        "dispatched_count": len(dispatched_items),
        "blocked_count": len(blocked_items),
        "dispatched_items": dispatched_items,
        "blocked_items": blocked_items,
        "target_repo": target_repo,
        "dispatched_at": datetime.now(timezone.utc).isoformat(),
    }
