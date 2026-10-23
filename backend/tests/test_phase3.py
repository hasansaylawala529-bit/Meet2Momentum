import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import (
    ActionItemCategory,
    ApprovalStatus,
    ExtractedActionItemRaw,
    ExtractedDecisionRaw,
    MeetingExtractionRaw,
)
from app.database import (
    init_db,
    insert_meeting,
    save_extraction_results,
    get_action_item,
    list_action_items,
)
from app.services.firewall import (
    evaluate_commitment_firewall,
    approve_action_item,
    reject_action_item,
    edit_action_item,
    FirewallValidationError,
    ItemNotFoundError,
)


@pytest.fixture
def temp_db():
    """Create a temporary SQLite database file for testing."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    if os.path.exists(path):
        os.remove(path)


@pytest.fixture
def client(temp_db, monkeypatch):
    """Create TestClient pointing to the temporary test database."""
    monkeypatch.setattr("app.database.DATABASE_PATH", temp_db)
    monkeypatch.setattr("app.config.DATABASE_PATH", temp_db)
    with TestClient(app) as test_client:
        yield test_client


def seed_test_meeting_and_actions(db_path):
    """Helper to seed a test meeting and three action items (one per category)."""
    meeting = insert_meeting(
        title="Sprint Review & Planning",
        meeting_date="2026-10-23",
        transcript="Sarah will implement the auth service by Friday. Alex suggested Redis caching. Who will review PRs?",
        db_path=db_path,
    )
    meeting_id = meeting["meeting_id"]

    decisions = [
        {
            "decision_id": f"dec_{meeting_id}_1",
            "meeting_id": meeting_id,
            "title": "Adopt FastAPI for backend services",
            "rationale": "Fast asynchronous support",
            "source_text": "Adopt FastAPI for backend services",
            "evidence_verified": True,
        }
    ]

    action_items = [
        {
            "task_id": f"task_{meeting_id}_1",
            "meeting_id": meeting_id,
            "title": "Implement auth service",
            "description": "Sarah handles JWT auth",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Sarah Chen",
            "due_date": "Friday 5pm",
            "source_text": "Sarah will implement the auth service by Friday.",
            "approval_status": "pending",
            "evidence_verified": True,
            "clarification_required": False,
        },
        {
            "task_id": f"task_{meeting_id}_2",
            "meeting_id": meeting_id,
            "title": "Evaluate Redis caching",
            "description": "Alex suggested caching",
            "category": "suggestion",
            "commitment_status": "suggestion",
            "owner": "Alex",
            "due_date": None,
            "source_text": "Alex suggested Redis caching.",
            "approval_status": "pending",
            "evidence_verified": True,
            "clarification_required": False,
        },
        {
            "task_id": f"task_{meeting_id}_3",
            "meeting_id": meeting_id,
            "title": "PR review rotation",
            "description": "Assign reviewer",
            "category": "unresolved_question",
            "commitment_status": "unresolved_question",
            "owner": None,
            "due_date": None,
            "source_text": "Who will review PRs?",
            "approval_status": "pending",
            "evidence_verified": True,
            "clarification_required": True,
        },
    ]

    save_extraction_results(
        meeting_id=meeting_id,
        decisions=decisions,
        action_items=action_items,
        db_path=db_path,
    )

    items = list_action_items(meeting_id=meeting_id, db_path=db_path)
    return meeting_id, items


# --- Approval & Rejection Workflow Tests ---

def test_approve_pending_action_item(client, temp_db):
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    commitment_item = next(i for i in items if i["category"] == "commitment")
    task_id = commitment_item["task_id"]

    # Initial state must be pending
    assert commitment_item["approval_status"] == "pending"

    # Approve item via API
    resp = client.post(f"/api/action-items/{task_id}/approve", json={"note": "Looks good"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"] == task_id
    assert data["approval_status"] == "approved"
    assert data["category"] == "commitment"

    # Verify database persistence
    saved = get_action_item(task_id, db_path=temp_db)
    assert saved["approval_status"] == "approved"


def test_approve_preserves_category_invariance(client, temp_db):
    """Approving a suggestion or unresolved question must not mutate its category."""
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    suggestion_item = next(i for i in items if i["category"] == "suggestion")
    task_id = suggestion_item["task_id"]

    resp = client.post(f"/api/action-items/{task_id}/approve", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["approval_status"] == "approved"
    assert data["category"] == "suggestion"  # Invariant: remains suggestion!


def test_reject_pending_action_item(client, temp_db):
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    question_item = next(i for i in items if i["category"] == "unresolved_question")
    task_id = question_item["task_id"]

    resp = client.post(f"/api/action-items/{task_id}/reject", json={"note": "Out of scope"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"] == task_id
    assert data["approval_status"] == "rejected"

    saved = get_action_item(task_id, db_path=temp_db)
    assert saved["approval_status"] == "rejected"


def test_invalid_state_transitions_fail(client, temp_db):
    """Items not in pending status cannot transition directly to approved or rejected."""
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    task_id = items[0]["task_id"]

    # 1. Approve item
    client.post(f"/api/action-items/{task_id}/approve")

    # 2. Re-approving an already approved item must fail with 400
    resp_reapprove = client.post(f"/api/action-items/{task_id}/approve")
    assert resp_reapprove.status_code == 400
    assert "already approved" in resp_reapprove.json()["detail"]

    # 3. Rejecting an approved item directly must fail with 400
    resp_reject = client.post(f"/api/action-items/{task_id}/reject")
    assert resp_reject.status_code == 400
    assert "Cannot reject an approved item directly" in resp_reject.json()["detail"]


# --- Material Edit Rule Tests ---

def test_material_edit_resets_approved_to_pending(client, temp_db):
    """Editing title, description, owner, or due_date of an approved item reverts status to pending."""
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    task_id = items[0]["task_id"]

    # Approve item first
    client.post(f"/api/action-items/{task_id}/approve")
    item_approved = get_action_item(task_id, db_path=temp_db)
    assert item_approved["approval_status"] == "approved"

    # Make material edit to title
    resp = client.patch(
        f"/api/action-items/{task_id}",
        json={"title": "Implement auth service with OAuth2 PKCE"},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["title"] == "Implement auth service with OAuth2 PKCE"
    assert updated["approval_status"] == "pending"  # Reset to pending!

    # Verify database state
    db_item = get_action_item(task_id, db_path=temp_db)
    assert db_item["approval_status"] == "pending"


def test_edit_owner_or_deadline_resets_approved_to_pending(client, temp_db):
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    task_id = items[0]["task_id"]

    # Approve item
    client.post(f"/api/action-items/{task_id}/approve")

    # Change owner and deadline
    resp = client.patch(
        f"/api/action-items/{task_id}",
        json={"owner": "Bob Martin", "due_date": "Next Monday"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["owner"] == "Bob Martin"
    assert data["due_date"] == "Next Monday"
    assert data["approval_status"] == "pending"


def test_editing_pending_item_stays_pending(client, temp_db):
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    task_id = items[0]["task_id"]
    assert items[0]["approval_status"] == "pending"

    resp = client.patch(
        f"/api/action-items/{task_id}",
        json={"title": "Updated pending title"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Updated pending title"
    assert data["approval_status"] == "pending"


def test_edit_validation_empty_title_fails(client, temp_db):
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    task_id = items[0]["task_id"]

    resp = client.patch(
        f"/api/action-items/{task_id}",
        json={"title": "   "},
    )
    assert resp.status_code == 422


# --- Commitment Firewall Evaluation Tests ---

def test_commitment_firewall_evaluation_states(client, temp_db):
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    commitment_item = next(i for i in items if i["category"] == "commitment")
    suggestion_item = next(i for i in items if i["category"] == "suggestion")
    question_item = next(i for i in items if i["category"] == "unresolved_question")

    task_commitment = commitment_item["task_id"]
    task_suggestion = suggestion_item["task_id"]
    task_rejected = question_item["task_id"]

    # 1. Pending commitment check -> Blocked (approval_pending)
    resp_pending = client.get(f"/api/action-items/{task_commitment}/firewall")
    assert resp_pending.status_code == 200
    res_p = resp_pending.json()
    assert res_p["eligible"] is False
    assert res_p["firewall_status"] == "blocked"
    assert res_p["block_reason"] == "approval_pending"

    # 2. Approve commitment -> Eligible
    client.post(f"/api/action-items/{task_commitment}/approve")
    resp_approved = client.get(f"/api/action-items/{task_commitment}/firewall")
    assert resp_approved.status_code == 200
    res_a = resp_approved.json()
    assert res_a["eligible"] is True
    assert res_a["firewall_status"] == "eligible"
    assert res_a["block_reason"] is None

    # 3. Approved suggestion -> Blocked (not_a_commitment)
    client.post(f"/api/action-items/{task_suggestion}/approve")
    resp_sugg = client.get(f"/api/action-items/{task_suggestion}/firewall")
    assert resp_sugg.status_code == 200
    res_s = resp_sugg.json()
    assert res_s["eligible"] is False
    assert res_s["firewall_status"] == "blocked"
    assert res_s["block_reason"] == "not_a_commitment"

    # 4. Rejected check -> Blocked (item_rejected)
    client.post(f"/api/action-items/{task_rejected}/reject")
    resp_rejected = client.get(f"/api/action-items/{task_rejected}/firewall")
    assert resp_rejected.status_code == 200
    res_r = resp_rejected.json()
    assert res_r["eligible"] is False
    assert res_r["firewall_status"] == "blocked"
    assert res_r["block_reason"] == "item_rejected"


def test_commitment_firewall_blocks_unresolved_owner(client, temp_db):
    """An approved commitment with an unassigned or TBD owner must be blocked by the firewall."""
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    commitment_item = next(i for i in items if i["category"] == "commitment")
    task_id = commitment_item["task_id"]

    # Edit owner to Unassigned
    client.patch(f"/api/action-items/{task_id}", json={"owner": "unassigned"})
    client.post(f"/api/action-items/{task_id}/approve")

    res = client.get(f"/api/action-items/{task_id}/firewall").json()
    assert res["eligible"] is False
    assert res["block_reason"] == "unresolved_owner"


def test_commitment_firewall_blocks_unverified_evidence(client, temp_db):
    """An approved commitment with unverified evidence must be blocked by the firewall."""
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    commitment_item = next(i for i in items if i["category"] == "commitment")
    task_id = commitment_item["task_id"]

    # Update evidence_verified to False in database
    from app.database import update_action_item
    update_action_item(task_id, {"evidence_verified": 0}, db_path=temp_db)
    client.post(f"/api/action-items/{task_id}/approve")

    res = client.get(f"/api/action-items/{task_id}/firewall").json()
    assert res["eligible"] is False
    assert res["block_reason"] == "unverified_evidence"


def test_commitment_firewall_blocks_unresolved_conflicts(client, temp_db):
    """An approved commitment with conflict_flag=True must be blocked by the firewall."""
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    commitment_item = next(i for i in items if i["category"] == "commitment")
    task_id = commitment_item["task_id"]

    from app.database import update_action_item
    update_action_item(task_id, {"conflict_flag": 1, "conflict_note": "Conflicting deadlines"}, db_path=temp_db)
    client.post(f"/api/action-items/{task_id}/approve")

    res = client.get(f"/api/action-items/{task_id}/firewall").json()
    assert res["eligible"] is False
    assert res["block_reason"] == "unresolved_conflict"


def test_commitment_firewall_bulk_evaluations(client, temp_db):
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    commitment_item = next(i for i in items if i["category"] == "commitment")
    client.post(f"/api/action-items/{commitment_item['task_id']}/approve")

    resp = client.get("/api/action-items/firewall/evaluations")
    assert resp.status_code == 200
    evals = resp.json()
    assert len(evals) == 3

    eligible_count = sum(1 for e in evals if e["eligible"] is True)
    blocked_count = sum(1 for e in evals if e["eligible"] is False)
    assert eligible_count == 1
    assert blocked_count == 2


# --- Query Filters & 404 Tests ---

def test_list_action_items_approval_status_filter(client, temp_db):
    meeting_id, items = seed_test_meeting_and_actions(temp_db)
    client.post(f"/api/action-items/{items[0]['task_id']}/approve")
    client.post(f"/api/action-items/{items[1]['task_id']}/reject")

    # Filter approved
    resp_app = client.get("/api/action-items?approval_status=approved")
    assert resp_app.status_code == 200
    assert len(resp_app.json()) == 1
    assert resp_app.json()[0]["task_id"] == items[0]["task_id"]

    # Filter rejected
    resp_rej = client.get("/api/action-items?approval_status=rejected")
    assert resp_rej.status_code == 200
    assert len(resp_rej.json()) == 1
    assert resp_rej.json()[0]["task_id"] == items[1]["task_id"]

    # Filter pending
    resp_pen = client.get("/api/action-items?approval_status=pending")
    assert resp_pen.status_code == 200
    assert len(resp_pen.json()) == 1
    assert resp_pen.json()[0]["task_id"] == items[2]["task_id"]


def test_action_item_endpoints_return_404_on_missing(client):
    non_existent = "non-existent-task-id"
    assert client.get(f"/api/action-items/{non_existent}").status_code == 404
    assert client.post(f"/api/action-items/{non_existent}/approve").status_code == 404
    assert client.post(f"/api/action-items/{non_existent}/reject").status_code == 404
    assert client.patch(f"/api/action-items/{non_existent}", json={"title": "new"}).status_code == 404
    assert client.get(f"/api/action-items/{non_existent}/firewall").status_code == 404
