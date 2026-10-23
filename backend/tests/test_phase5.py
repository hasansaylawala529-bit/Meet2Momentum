import os
import tempfile
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import (
    init_db,
    insert_meeting,
    save_extraction_results,
    get_action_item,
    get_task_history,
)
from app.services.tracker import parse_due_date, evaluate_task_schedule
from app.services.firewall import approve_action_item, edit_action_item
from app.models import ActionItemUpdate, TaskStatusUpdateRequest


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
    monkeypatch.setattr("app.services.tracker.DATABASE_PATH", temp_db)
    monkeypatch.setattr("app.services.exporter.DATABASE_PATH", temp_db)
    with TestClient(app) as test_client:
        yield test_client


def seed_phase5_dataset(db_path):
    """Helper to seed a test meeting and action items for Phase 5 tests."""
    meeting = insert_meeting(
        title="Sprint Planning & Retrospective",
        meeting_date="2026-10-20",
        transcript="Marcus will finish database optimization by yesterday. Sarah will configure auth by tomorrow. Unassigned deployment script needs review.",
        db_path=db_path,
    )
    meeting_id = meeting["meeting_id"]

    decisions = [
        {
            "decision_id": f"dec_{meeting_id}_1",
            "meeting_id": meeting_id,
            "title": "Use JWT tokens for backend authentication",
            "rationale": "Stateless horizontal scaling",
            "source_text": "Sarah will configure auth",
            "evidence_verified": True,
        }
    ]

    action_items = [
        # Past due commitment with owner
        {
            "task_id": f"task_{meeting_id}_overdue",
            "meeting_id": meeting_id,
            "title": "Database optimization",
            "description": "Index queries for high load",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Marcus",
            "due_date": "2026-10-18",
            "source_text": "Marcus will finish database optimization by yesterday.",
            "evidence_verified": True,
            "approval_status": "approved",
            "execution_status": "not_exported",
            "task_status": "pending",
        },
        # Due soon commitment with owner
        {
            "task_id": f"task_{meeting_id}_soon",
            "meeting_id": meeting_id,
            "title": "Configure auth service",
            "description": "JWT issuance and validation",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Sarah",
            "due_date": "2026-10-24",
            "source_text": "Sarah will configure auth by tomorrow.",
            "evidence_verified": True,
            "approval_status": "approved",
            "execution_status": "not_exported",
            "task_status": "in_progress",
        },
        # Unassigned commitment
        {
            "task_id": f"task_{meeting_id}_unassigned",
            "meeting_id": meeting_id,
            "title": "Setup deployment script",
            "description": "Automated deployment pipeline",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": None,
            "due_date": "2026-11-01",
            "source_text": "Unassigned deployment script needs review.",
            "evidence_verified": True,
            "approval_status": "pending",
            "execution_status": "not_exported",
            "task_status": "pending",
        },
        # Suggestion (not a commitment)
        {
            "task_id": f"task_{meeting_id}_suggestion",
            "meeting_id": meeting_id,
            "title": "Consider GraphQL in Q4",
            "description": "Evaluate GraphQL for mobile",
            "category": "suggestion",
            "commitment_status": "suggestion",
            "owner": "David",
            "due_date": None,
            "source_text": "David mentioned GraphQL",
            "evidence_verified": True,
            "approval_status": "pending",
            "execution_status": "not_exported",
            "task_status": "pending",
        },
    ]

    save_extraction_results(meeting_id, decisions, action_items, db_path=db_path)
    return meeting_id


# --- Unit Tests: Due Date Parsing ---

def test_parse_due_date_iso_and_month():
    ref = datetime(2026, 10, 23, 12, 0, 0, tzinfo=timezone.utc)

    # ISO
    d1 = parse_due_date("2026-10-27", ref_datetime=ref)
    assert d1 is not None
    assert d1.year == 2026 and d1.month == 10 and d1.day == 27

    # Month name
    d2 = parse_due_date("October 27", ref_datetime=ref)
    assert d2 is not None
    assert d2.month == 10 and d2.day == 27

    # Month name with ordinal
    d3 = parse_due_date("October 27th, 2026", ref_datetime=ref)
    assert d3 is not None
    assert d3.month == 10 and d3.day == 27

    # Day followed by month
    d4 = parse_due_date("27th October", ref_datetime=ref)
    assert d4 is not None
    assert d4.month == 10 and d4.day == 27


def test_parse_due_date_relative_and_weekdays():
    ref = datetime(2026, 10, 23, 12, 0, 0, tzinfo=timezone.utc)  # Friday

    # Relative
    d_today = parse_due_date("today", ref_datetime=ref)
    assert d_today.day == 23

    d_tom = parse_due_date("tomorrow", ref_datetime=ref)
    assert d_tom.day == 24

    # Day of week: next Tuesday (weekday 1)
    d_tue = parse_due_date("Tuesday", ref_datetime=ref)
    assert d_tue is not None
    assert d_tue.weekday() == 1

    # Invalid / empty
    assert parse_due_date("") is None
    assert parse_due_date(None) is None
    assert parse_due_date("asap soonish") is None


# --- Unit Tests: Schedule Evaluation & Completed Immunity ---

def test_schedule_evaluation_and_completed_immunity():
    ref = datetime(2026, 10, 23, 12, 0, 0, tzinfo=timezone.utc)

    # Past due item -> Overdue
    item_past = {"task_status": "pending", "due_date": "2026-10-20"}
    is_overdue, status, days = evaluate_task_schedule(item_past, ref_datetime=ref)
    assert is_overdue is True
    assert status == "overdue"
    assert days is not None and days >= 1

    # CRITICAL: Completed item is NEVER overdue, even if date was in past
    item_completed_past = {"task_status": "completed", "due_date": "2026-10-20"}
    is_overdue, status, days = evaluate_task_schedule(item_completed_past, ref_datetime=ref)
    assert is_overdue is False
    assert status == "completed"
    assert days is None

    # Future date > 48h -> on_track
    item_future = {"task_status": "in_progress", "due_date": "2026-11-05"}
    is_overdue, status, days = evaluate_task_schedule(item_future, ref_datetime=ref)
    assert is_overdue is False
    assert status == "on_track"

    # Missing due date -> unspecified
    item_no_date = {"task_status": "pending", "due_date": None}
    is_overdue, status, days = evaluate_task_schedule(item_no_date, ref_datetime=ref)
    assert is_overdue is False
    assert status == "unspecified"


# --- Integration Tests: Status Transitions & Lifecycle Separation ---

def test_task_status_transition_and_completed_at(client, temp_db):
    meeting_id = seed_phase5_dataset(temp_db)
    task_id = f"task_{meeting_id}_soon"

    # 1. Transition pending -> in_progress
    resp = client.patch(
        f"/api/action-items/{task_id}/status",
        json={"task_status": "in_progress", "note": "Started working on JWT tokens"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["task_status"] == "in_progress"
    assert data["completed_at"] is None
    # Verify approval_status is preserved (separation of concerns)
    assert data["approval_status"] == "approved"

    # 2. Transition in_progress -> completed
    resp2 = client.patch(
        f"/api/action-items/{task_id}/status",
        json={"task_status": "completed", "note": "All auth endpoints tested and merged"}
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["task_status"] == "completed"
    assert data2["completed_at"] is not None
    assert data2["is_overdue"] is False
    assert data2["schedule_status"] == "completed"

    # 3. Transition completed -> in_progress (reopen) clears completed_at
    resp3 = client.patch(
        f"/api/action-items/{task_id}/status",
        json={"task_status": "in_progress", "note": "Reopened for additional token claims"}
    )
    assert resp3.status_code == 200
    data3 = resp3.json()
    assert data3["task_status"] == "in_progress"
    assert data3["completed_at"] is None


# --- Integration Tests: Audit Trail & Task History ---

def test_task_audit_history_endpoint(client, temp_db):
    meeting_id = seed_phase5_dataset(temp_db)
    task_id = f"task_{meeting_id}_unassigned"

    # 1. Initial history has 'extracted' event from seed
    resp = client.get(f"/api/action-items/{task_id}/history")
    assert resp.status_code == 200
    history = resp.json()
    assert len(history) >= 1
    assert any(h["event_type"] == "extracted" for h in history)

    # 2. Approve the item
    client.post(f"/api/action-items/{task_id}/approve", json={"note": "Approved for dev team"})

    # 3. Edit owner
    client.patch(f"/api/action-items/{task_id}", json={"owner": "Elena Rostova"})

    # 4. Update status
    client.patch(f"/api/action-items/{task_id}/status", json={"task_status": "in_progress"})

    # 5. Check complete audit trail
    resp_updated = client.get(f"/api/action-items/{task_id}/history")
    assert resp_updated.status_code == 200
    events = resp_updated.json()
    event_types = [e["event_type"] for e in events]

    assert "extracted" in event_types
    assert "approved" in event_types
    assert "edited" in event_types
    assert "status_changed" in event_types


def test_workspace_audit_log_endpoint(client, temp_db):
    seed_phase5_dataset(temp_db)

    resp = client.get("/api/tracking/audit-log?limit=10")
    assert resp.status_code == 200
    log = resp.json()
    assert isinstance(log, list)
    assert len(log) >= 4  # The 4 seeded items generated extraction logs


# --- Integration Tests: Tracking Dashboard & Intelligence ---

def test_tracking_dashboard_endpoint(client, temp_db):
    meeting_id = seed_phase5_dataset(temp_db)

    resp = client.get("/api/tracking/dashboard")
    assert resp.status_code == 200
    dash = resp.json()

    # Total items and commitments
    assert dash["total_items"] == 4
    assert dash["total_commitments"] == 3  # Marcus, Sarah, Unassigned

    # Counts
    assert dash["in_progress_count"] == 1  # Sarah's task
    assert dash["pending_count"] == 3

    # Intelligence checks
    assert dash["overdue_count"] >= 1  # Marcus's task is 2026-10-18
    assert dash["unassigned_owner_count"] >= 1  # Unassigned script
    assert any(item["title"] == "Setup deployment script" for item in dash["unassigned_items"])

    # Recent history included
    assert len(dash["recent_history"]) > 0

    # Test completing Marcus's overdue task updates completion rate and overdue count
    task_id = f"task_{meeting_id}_overdue"
    client.patch(
        f"/api/action-items/{task_id}/status",
        json={"task_status": "completed"}
    )

    resp_after = client.get("/api/tracking/dashboard")
    dash_after = resp_after.json()
    assert dash_after["completed_count"] == 1
    # Overdue count should drop by 1 since completed items are never overdue
    assert dash_after["overdue_count"] == 0
    # Completion rate: 1 completed out of 3 commitments = 33.3%
    assert 30.0 <= dash_after["completion_rate_percent"] <= 35.0
