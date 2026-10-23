import os
import tempfile
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import (
    init_db,
    insert_meeting,
    save_extraction_results,
    get_action_item,
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
    monkeypatch.setattr("app.services.exporter.DATABASE_PATH", temp_db)
    with TestClient(app) as test_client:
        yield test_client


def seed_test_meeting_and_items(db_path):
    """Helper to seed a test meeting with action items in various states."""
    meeting = insert_meeting(
        title="Architecture Review",
        meeting_date="2026-10-24",
        transcript="Elena will configure Prometheus metrics by Wednesday. Liam suggested alerting via Slack.",
        db_path=db_path,
    )
    meeting_id = meeting["meeting_id"]

    decisions = [
        {
            "decision_id": f"dec_{meeting_id}_1",
            "meeting_id": meeting_id,
            "title": "Adopt Prometheus for cluster metrics",
            "rationale": "Industry standard monitoring",
            "source_text": "Adopt Prometheus for cluster metrics",
            "evidence_verified": True,
        }
    ]

    action_items = [
        {
            "task_id": f"task_{meeting_id}_1",
            "meeting_id": meeting_id,
            "title": "Configure Prometheus metrics",
            "description": "Elena to setup metrics exporter",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Elena Rostova",
            "due_date": "Wednesday 5pm",
            "source_text": "Elena will configure Prometheus metrics by Wednesday.",
            "approval_status": "pending",
            "evidence_verified": True,
            "execution_status": "not_exported",
            "clarification_required": False,
        },
        {
            "task_id": f"task_{meeting_id}_2",
            "meeting_id": meeting_id,
            "title": "Slack alerting integration",
            "description": "Liam suggested alerting",
            "category": "suggestion",
            "commitment_status": "suggestion",
            "owner": "Liam",
            "due_date": None,
            "source_text": "Liam suggested alerting via Slack.",
            "approval_status": "pending",
            "evidence_verified": True,
            "execution_status": "not_exported",
            "clarification_required": False,
        },
    ]

    save_extraction_results(
        meeting_id=meeting_id,
        decisions=decisions,
        action_items=action_items,
        db_path=db_path,
    )

    return meeting_id, action_items


# --- CSV Export Tests ---

def test_export_csv_only_eligible_commitments(client, temp_db):
    meeting_id, items = seed_test_meeting_and_items(temp_db)
    task_1 = items[0]["task_id"]
    task_2 = items[1]["task_id"]

    # Before approval: 0 items are eligible, CSV should contain only headers
    resp_empty = client.get("/api/export/csv")
    assert resp_empty.status_code == 200
    assert resp_empty.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=" in resp_empty.headers["content-disposition"]
    lines = resp_empty.text.strip().split("\r\n")
    assert len(lines) == 1  # Only header row
    assert "Task ID,Meeting ID,Meeting Title" in lines[0]

    # Approve task 1
    client.post(f"/api/action-items/{task_1}/approve")

    # Now CSV must contain task 1, but NOT task 2 (which is still pending)
    resp = client.get("/api/export/csv")
    assert resp.status_code == 200
    rows = resp.text.strip().split("\r\n")
    assert len(rows) == 2  # Header + 1 record
    assert task_1 in rows[1]
    assert "Elena Rostova" in rows[1]
    assert "Wednesday 5pm" in rows[1]
    assert task_2 not in resp.text


# --- JSON Export Tests ---

def test_export_json_structure_and_traceability(client, temp_db):
    meeting_id, items = seed_test_meeting_and_items(temp_db)
    task_1 = items[0]["task_id"]

    # Approve task 1
    client.post(f"/api/action-items/{task_1}/approve")

    resp = client.get("/api/export/json")
    assert resp.status_code == 200
    data = resp.json()

    assert "export_timestamp" in data
    assert data["total_exported"] == 1
    record = data["items"][0]
    assert record["task_id"] == task_1
    assert record["meeting_title"] == "Architecture Review"
    assert record["owner"] == "Elena Rostova"
    assert record["source_text"] == "Elena will configure Prometheus metrics by Wednesday."
    assert record["evidence_verified"] is True
    assert record["approval_status"] == "approved"


# --- Batch Execution Dispatch Tests ---

def test_dispatch_export_batch_marks_exported(client, temp_db):
    meeting_id, items = seed_test_meeting_and_items(temp_db)
    task_1 = items[0]["task_id"]

    # Approve task 1
    client.post(f"/api/action-items/{task_1}/approve")

    # Dispatch export
    resp = client.post("/api/export/dispatch", json={"task_ids": [task_1]})
    assert resp.status_code == 200
    res = resp.json()
    assert res["dispatched_count"] == 1
    assert res["blocked_count"] == 0
    assert task_1 in res["exported_task_ids"]

    # Verify database state updated
    db_item = get_action_item(task_1, db_path=temp_db)
    assert db_item["execution_status"] == "exported"
    assert db_item["exported_at"] is not None


def test_firewall_blocks_unapproved_export_in_batch(client, temp_db):
    meeting_id, items = seed_test_meeting_and_items(temp_db)
    task_pending = items[0]["task_id"]
    task_rejected = items[1]["task_id"]

    # Reject task 2
    client.post(f"/api/action-items/{task_rejected}/reject")

    # Dispatch export for both pending and rejected tasks
    resp = client.post("/api/export/dispatch", json={"task_ids": [task_pending, task_rejected]})
    assert resp.status_code == 200
    res = resp.json()

    assert res["dispatched_count"] == 0
    assert res["blocked_count"] == 2

    reasons_by_id = {b["task_id"]: b["block_reason"] for b in res["blocked_items"]}
    assert reasons_by_id[task_pending] == "approval_pending"
    assert reasons_by_id[task_rejected] == "item_rejected"


# --- Single Item Execution Export Tests ---

def test_export_single_action_item_success(client, temp_db):
    meeting_id, items = seed_test_meeting_and_items(temp_db)
    task_1 = items[0]["task_id"]

    # Approve first
    client.post(f"/api/action-items/{task_1}/approve")

    # Export single item
    resp = client.post(f"/api/action-items/{task_1}/export")
    assert resp.status_code == 200
    data = resp.json()
    assert data["task_id"] == task_1
    assert data["execution_status"] == "exported"
    assert data["exported_at"] is not None


def test_export_single_action_item_blocked_by_firewall(client, temp_db):
    meeting_id, items = seed_test_meeting_and_items(temp_db)
    task_pending = items[0]["task_id"]

    # Attempt to export while still pending -> blocked with 400
    resp = client.post(f"/api/action-items/{task_pending}/export")
    assert resp.status_code == 400
    assert "Commitment Firewall blocked execution" in resp.json()["detail"]
    assert "approval_pending" in resp.json()["detail"]


def test_export_single_action_item_not_found(client):
    resp = client.post("/api/action-items/non-existent-task/export")
    assert resp.status_code == 404


# --- Summary Endpoint Tests ---

def test_export_summary_endpoint(client, temp_db):
    meeting_id, items = seed_test_meeting_and_items(temp_db)
    task_1 = items[0]["task_id"]

    summary_1 = client.get("/api/export/summary").json()
    assert summary_1["approved_count"] == 0
    assert summary_1["pending_export_count"] == 0
    assert summary_1["exported_count"] == 0

    # Approve task 1
    client.post(f"/api/action-items/{task_1}/approve")
    summary_2 = client.get("/api/export/summary").json()
    assert summary_2["approved_count"] == 1
    assert summary_2["pending_export_count"] == 1
    assert summary_2["exported_count"] == 0

    # Dispatch export
    client.post(f"/api/action-items/{task_1}/export")
    summary_3 = client.get("/api/export/summary").json()
    assert summary_3["approved_count"] == 1
    assert summary_3["pending_export_count"] == 0
    assert summary_3["exported_count"] == 1
    assert summary_3["last_exported_at"] is not None
