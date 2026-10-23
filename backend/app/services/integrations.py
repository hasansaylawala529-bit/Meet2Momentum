import os
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import httpx

from app.config import GITHUB_TOKEN, GITHUB_REPO, DATABASE_PATH
from app.database import get_action_item, update_action_item, list_action_items, log_task_history
from app.services.firewall import evaluate_commitment_firewall, FirewallValidationError, ItemNotFoundError


import re

def resolve_assignee_candidate(owner: Optional[str], repo: str) -> Optional[str]:
    """
    Deterministically resolve transcript owner name to an eligible GitHub username.
    - If the owner matches or contains the repo owner (e.g. 'Hasan Saylawala' vs 'hasansaylawala529-bit'), map to repo owner.
    - If owner is a single-word handle matching GitHub username rules, attempt direct assignment.
    """
    if not owner or not owner.strip():
        return None

    clean_owner = owner.strip()
    repo_parts = repo.split("/")
    repo_owner = repo_parts[0].strip() if repo_parts else ""

    # Match against repo owner (e.g. 'Hasan' in 'hasansaylawala529-bit')
    if repo_owner:
        first_name = clean_owner.split()[0].lower()
        if len(first_name) >= 3 and (first_name in repo_owner.lower() or repo_owner.lower() in clean_owner.lower()):
            return repo_owner

    # If already a valid GitHub username format (no spaces, alphanumeric/hyphens)
    if re.match(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$", clean_owner):
        return clean_owner

    return None


def format_github_issue(item: Dict[str, Any], repo: Optional[str] = None) -> Dict[str, Any]:
    """
    Format action item into a clean, professional GitHub Issue.
    Eliminates emoji spam, cheesy badges, and AI boilerplate.
    Formats clearly for engineering teams: Summary, Assignment Details, Verbatim Transcript Reference.
    """
    cat = item.get("category", "commitment").upper()
    title = f"[{cat}] {item.get('title', 'Action Item')}"

    owner = item.get("owner")
    due_date = item.get("due_date") or "Not specified"
    meeting_title = item.get("meeting_title") or "Meeting Session"
    meeting_date = item.get("meeting_date") or "Unspecified"
    source_quote = (item.get("source_text") or "").strip()
    description = (item.get("description") or "").strip()

    body_sections = []

    # Section 1: Clean summary
    if description and description.strip().lower() != (item.get("title") or "").strip().lower():
        body_sections.append(f"## Summary\n{description}")
    else:
        body_sections.append(f"## Summary\n{item.get('title', 'Action item extracted from meeting discussion.')}")

    # Section 2: Clear details
    body_sections.append(
        f"## Details\n"
        f"- **Assigned Owner:** {owner if owner else 'Unassigned'}\n"
        f"- **Target Deadline:** {due_date}\n"
        f"- **Meeting Reference:** {meeting_title} ({meeting_date})"
    )

    # Section 3: Verbatim transcript evidence
    if source_quote:
        body_sections.append(f"## Transcript Evidence\n> \"{source_quote}\"")

    # Section 4: Minimal reference footer
    body_sections.append(f"---\n*Dispatched from Meet2Momentum (`{item.get('task_id')}`)*")

    body = "\n\n".join(body_sections)

    labels = ["task", "commitment"]
    if item.get("category") == "suggestion":
        labels = ["suggestion"]
    elif item.get("category") == "unresolved_question":
        labels = ["question", "clarification-needed"]

    payload: Dict[str, Any] = {
        "title": title,
        "body": body,
        "labels": labels,
    }

    # Resolve assignee candidate if repo is specified
    if repo and owner:
        candidate = resolve_assignee_candidate(owner, repo)
        if candidate:
            payload["assignees"] = [candidate]

    return payload


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
    Gracefully handles assignees: if user is not a collaborator, retries cleanly without failing.
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

    issue_payload = format_github_issue(item, repo=target_repo)
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

            # Real-world resilience: if GitHub rejects assignees because user is not a repo collaborator,
            # retry without assignees so issue creation succeeds with owner noted in body
            if res.status_code == 422 and "assignees" in issue_payload:
                payload_fallback = dict(issue_payload)
                payload_fallback.pop("assignees", None)
                res = client.post(api_url, json=payload_fallback, headers=headers)

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
