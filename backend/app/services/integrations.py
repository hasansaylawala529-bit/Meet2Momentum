import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx

from app.config import GITHUB_TOKEN, GITHUB_REPO, DATABASE_PATH
from app.database import get_action_item, update_action_item, list_action_items, log_task_history
from app.services.firewall import evaluate_commitment_firewall, FirewallValidationError, ItemNotFoundError


def format_github_issue(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Format action item into structured GitHub Issue payload with verbatim evidence citation.
    Transcripts contain human names (e.g. 'Sarah Chen'), not GitHub handles.
    Owner is included in the markdown body without '@' mention, and assignees is omitted.
    """
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
- **Assigned Owner:** {owner if owner else '*Unassigned*'}
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

    return {
        "title": title,
        "body": body,
        "labels": labels,
    }


def create_github_issue(
    task_id: str,
    repo: Optional[str] = None,
    token: Optional[str] = None,
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Dispatch a single approved commitment to GitHub Issues, strictly gated by the Commitment Firewall.
    The GitHub token MUST come from the server environment (GITHUB_TOKEN).
    Dispatches directly to the real GitHub REST API. Fake / simulated URLs are strictly prohibited.
    """
    # 1. Commitment Firewall Enforcement Gate
    eval_result = evaluate_commitment_firewall(task_id, db_path=db_path)
    if not eval_result.eligible:
        reason_msg = eval_result.block_reason or "firewall_blocked"
        reasons_text = "; ".join(eval_result.reasons)
        raise FirewallValidationError(
            f"Commitment Firewall blocked dispatch of '{task_id}': ({reason_msg}). {reasons_text}",
            status_code=400
        )

    item = get_action_item(task_id, db_path=db_path)
    if not item:
        raise ItemNotFoundError(task_id)

    # Server environment ONLY for token
    server_token = os.getenv("GITHUB_TOKEN", "").strip() or GITHUB_TOKEN
    if not server_token:
        raise FirewallValidationError(
            "GitHub dispatch failed: GITHUB_TOKEN is not configured in the server environment. "
            "Please configure GITHUB_TOKEN in backend/.env to dispatch real GitHub issues.",
            status_code=400
        )

    target_repo = (repo or os.getenv("GITHUB_REPO", "").strip() or GITHUB_REPO or "hasansaylawala529-bit/Meet2Momentum").strip().strip("/")
    if "/" not in target_repo:
        raise FirewallValidationError(
            f"Invalid target repository '{target_repo}'. Must be in 'owner/repo' format.",
            status_code=400
        )

    issue_payload = format_github_issue(item)
    now_iso = datetime.now(timezone.utc).isoformat()
    old_execution = item.get("execution_status", "not_exported")

    # Live GitHub REST API dispatch
    headers = {
        "Authorization": f"Bearer {server_token}",
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
                issue_url = res_data.get("html_url")
                if not issue_url:
                    raise FirewallValidationError(
                        "GitHub API response missing 'html_url'.",
                        status_code=502
                    )
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

    # Update database record with real GitHub issue details
    update_fields = {
        "execution_status": "exported",
        "exported_at": now_iso,
        "external_url": issue_url,
        "integration_service": "github",
        "external_id": f"#{issue_number}",
    }
    updated = update_action_item(task_id, update_fields, db_path=db_path) or dict(item, **update_fields)

    # Record in immutable audit trail
    note = f"Dispatched to real GitHub Issue ({target_repo}#{issue_number}): {issue_url}"
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
    Enforces real GitHub API execution using server-configured GITHUB_TOKEN only.
    """
    path = db_path or DATABASE_PATH
    target_repo = (repo or os.getenv("GITHUB_REPO", "").strip() or GITHUB_REPO or "hasansaylawala529-bit/Meet2Momentum").strip().strip("/")

    if task_ids:
        candidates = [get_action_item(tid, db_path=path) for tid in task_ids]
        candidates = [c for c in candidates if c]
    else:
        candidates = list_action_items(db_path=path)

    dispatched_items: List[Dict[str, Any]] = []
    blocked_items: List[Dict[str, Any]] = []

    server_token = os.getenv("GITHUB_TOKEN", "").strip() or GITHUB_TOKEN

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

        if not server_token:
            blocked_items.append({
                "task_id": task_id,
                "title": item.get("title", ""),
                "block_reason": "server_token_missing",
                "reasons": ["GITHUB_TOKEN is not configured in the server environment. Simulated URLs are prohibited."],
            })
            continue

        try:
            dispatched = create_github_issue(task_id, repo=target_repo, db_path=path)
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
