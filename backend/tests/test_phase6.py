import os
import tempfile
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.models import ActionItemCategory, ApprovalStatus, TaskStatus, ExecutionStatus
from app.database import (
    init_db,
    insert_meeting,
    save_extraction_results,
    get_action_item,
    list_action_items,
    get_task_history,
)
from app.services.detector import (
    detect_duplicates_and_conflicts,
    evaluate_pair_relationship,
    normalize_title,
    GENERIC_TITLES,
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
    monkeypatch.setattr("app.services.tracker.DATABASE_PATH", temp_db)
    with TestClient(app) as test_client:
        yield test_client


def seed_phase6_test_data(db_path):
    """Helper to seed a meeting with pending, approved, and rejected items."""
    meeting = insert_meeting(
        title="Phase 6 Verification Meeting",
        meeting_date="2026-10-24",
        transcript="Elena will configure Redis cache by Friday. Liam suggested Kafka for notifications.",
        db_path=db_path,
    )
    meeting_id = meeting["meeting_id"]

    actions = [
        {
            "task_id": f"task_{meeting_id}_approved",
            "meeting_id": meeting_id,
            "title": "Configure Redis caching cluster",
            "description": "Set up Redis for session management",
            "category": ActionItemCategory.COMMITMENT.value,
            "commitment_status": "commitment",
            "owner": "Elena Rostova",
            "due_date": "2026-10-30",
            "source_text": "Elena will configure Redis cache by Friday.",
            "evidence_verified": True,
            "approval_status": ApprovalStatus.APPROVED.value,
            "execution_status": ExecutionStatus.NOT_EXPORTED.value,
            "task_status": TaskStatus.PENDING.value,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "task_id": f"task_{meeting_id}_pending",
            "meeting_id": meeting_id,
            "title": "Evaluate Kafka notification service",
            "description": "Assess Kafka versus RabbitMQ",
            "category": ActionItemCategory.COMMITMENT.value,
            "commitment_status": "commitment",
            "owner": "Liam Chen",
            "due_date": "2026-11-05",
            "source_text": "Liam suggested Kafka for notifications.",
            "evidence_verified": True,
            "approval_status": ApprovalStatus.PENDING.value,
            "execution_status": ExecutionStatus.NOT_EXPORTED.value,
            "task_status": TaskStatus.PENDING.value,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "task_id": f"task_{meeting_id}_rejected",
            "meeting_id": meeting_id,
            "title": "Rewrite frontend in Svelte",
            "description": "Consider Svelte migration",
            "category": ActionItemCategory.SUGGESTION.value,
            "commitment_status": "suggestion",
            "owner": "Sarah Connor",
            "due_date": None,
            "source_text": "Maybe rewrite frontend in Svelte.",
            "evidence_verified": True,
            "approval_status": ApprovalStatus.REJECTED.value,
            "execution_status": ExecutionStatus.NOT_EXPORTED.value,
            "task_status": TaskStatus.PENDING.value,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    ]

    save_extraction_results(
        meeting_id=meeting_id,
        decisions=[],
        action_items=actions,
        db_path=db_path,
    )
    return meeting_id, actions


# --- Phase 6.1 Tests: Commitment Firewall Hardening ---

def test_pending_progress_transitions_blocked_by_firewall(client, temp_db):
    """Pending action items must NOT transition to in_progress or completed."""
    meeting_id, _ = seed_phase6_test_data(temp_db)
    pending_task_id = f"task_{meeting_id}_pending"

    # 1. Attempt transition to in_progress -> Must return HTTP 400
    resp_ip = client.patch(
        f"/api/action-items/{pending_task_id}/status",
        json={"task_status": "in_progress", "note": "Trying to start work prematurely"},
    )
    assert resp_ip.status_code == 400
    assert "Commitment Firewall blocked" in resp_ip.json()["detail"]

    # 2. Attempt transition to completed -> Must return HTTP 400
    resp_comp = client.patch(
        f"/api/action-items/{pending_task_id}/status",
        json={"task_status": "completed", "note": "Trying to mark completed prematurely"},
    )
    assert resp_comp.status_code == 400
    assert "Commitment Firewall blocked" in resp_comp.json()["detail"]

    # 3. Verify task status in database is completely unmodified
    item = get_action_item(pending_task_id, db_path=temp_db)
    assert item["task_status"] == "pending"

    # 4. Verify no status_changed event was added to the audit history
    history = get_task_history(pending_task_id, db_path=temp_db)
    assert not any(h["event_type"] == "status_changed" for h in history)


def test_rejected_progress_transitions_blocked_by_firewall(client, temp_db):
    """Rejected action items can NEVER undergo execution progress updates."""
    meeting_id, _ = seed_phase6_test_data(temp_db)
    rejected_task_id = f"task_{meeting_id}_rejected"

    resp = client.patch(
        f"/api/action-items/{rejected_task_id}/status",
        json={"task_status": "in_progress", "note": "Starting rejected task"},
    )
    assert resp.status_code == 400
    assert "Commitment Firewall blocked" in resp.json()["detail"]
    assert "rejected" in resp.json()["detail"].lower()

    # Verify database was not changed
    item = get_action_item(rejected_task_id, db_path=temp_db)
    assert item["task_status"] == "pending"


def test_only_eligible_false_cannot_bypass_export_filtering(client, temp_db):
    """Commitment Firewall must strictly prevent unapproved items from appearing in exports, even if only_eligible=false."""
    meeting_id, _ = seed_phase6_test_data(temp_db)

    # 1. CSV export with explicit only_eligible=false
    resp_csv = client.get("/api/export/csv?only_eligible=false")
    assert resp_csv.status_code == 200
    csv_text = resp_csv.text

    # Approved commitment MUST be in CSV
    assert "Configure Redis caching cluster" in csv_text
    # Pending and rejected items MUST NOT appear in CSV export
    assert "Evaluate Kafka notification service" not in csv_text
    assert "Rewrite frontend in Svelte" not in csv_text

    # 2. JSON export with explicit only_eligible=false
    resp_json = client.get("/api/export/json?only_eligible=false")
    assert resp_json.status_code == 200
    json_data = resp_json.json()

    exported_titles = [item["title"] for item in json_data["items"]]
    assert "Configure Redis caching cluster" in exported_titles
    assert "Evaluate Kafka notification service" not in exported_titles
    assert "Rewrite frontend in Svelte" not in exported_titles


def test_eligible_approved_commitments_exported_and_tracked(client, temp_db):
    """Approved commitments can be exported, dispatched, tracked, and updated to completion."""
    meeting_id, _ = seed_phase6_test_data(temp_db)
    approved_task_id = f"task_{meeting_id}_approved"

    # 1. Dispatch export
    resp_batch = client.post("/api/export/dispatch", json={"task_ids": [approved_task_id]})
    assert resp_batch.status_code == 200
    batch_data = resp_batch.json()
    assert batch_data["dispatched_count"] >= 1
    assert approved_task_id in batch_data["exported_task_ids"]

    # Verify marked as exported
    item = get_action_item(approved_task_id, db_path=temp_db)
    assert item["execution_status"] == "exported"
    assert item["exported_at"] is not None

    # 2. Transition to in_progress
    resp_ip = client.patch(
        f"/api/action-items/{approved_task_id}/status",
        json={"task_status": "in_progress", "note": "Redis deployment started"},
    )
    assert resp_ip.status_code == 200, f"Expected 200, got {resp_ip.status_code}: {resp_ip.text}"
    assert resp_ip.json()["task_status"] == "in_progress"

    # 3. Transition to completed
    resp_comp = client.patch(
        f"/api/action-items/{approved_task_id}/status",
        json={"task_status": "completed", "note": "Cluster online and tested"},
    )
    assert resp_comp.status_code == 200
    data_comp = resp_comp.json()
    assert data_comp["task_status"] == "completed"
    assert data_comp["completed_at"] is not None
    assert data_comp["is_overdue"] is False
    assert data_comp["schedule_status"] == "completed"


# --- Phase 6.2 Tests: Deterministic Duplicate and Conflict Detection ---

def test_duplicate_candidate_detection():
    """Exact and high-similarity commitments with matching owner and deadline are flagged as duplicates."""
    items = [
        {
            "task_id": "task_1",
            "title": "Configure Redis caching cluster for session store",
            "owner": "Elena Rostova",
            "due_date": "2026-10-30",
        },
        {
            "task_id": "task_2",
            "title": "Configure Redis caching cluster for session storage",
            "owner": "Elena Rostova",
            "due_date": "2026-10-30",
        },
    ]

    processed = detect_duplicates_and_conflicts(items)
    t1 = next(it for it in processed if it["task_id"] == "task_1")
    t2 = next(it for it in processed if it["task_id"] == "task_2")

    assert t1["duplicate_of"] == "task_2"
    assert t1["conflict_flag"] is False
    assert "Potential duplicate of" in t1["duplicate_note"]

    assert t2["duplicate_of"] == "task_1"
    assert t2["conflict_flag"] is False


def test_owner_and_deadline_conflict_detection():
    """High similarity commitments with differing owners or differing deadlines are flagged as conflicts."""
    # 1. Differing owners
    owner_conflict_items = [
        {
            "task_id": "task_owner_1",
            "title": "Migrate database schema to PostgreSQL 16",
            "owner": "Alex Rivera",
            "due_date": "2026-11-01",
        },
        {
            "task_id": "task_owner_2",
            "title": "Migrate database schema to PostgreSQL 16",
            "owner": "Marcus Vance",
            "due_date": "2026-11-01",
        },
    ]
    res_owner = detect_duplicates_and_conflicts(owner_conflict_items)
    to1 = next(it for it in res_owner if it["task_id"] == "task_owner_1")
    assert to1["conflict_flag"] is True
    assert to1["duplicate_of"] is None
    assert "Assigned owner conflict" in to1["conflict_note"]

    # 2. Differing deadlines
    deadline_conflict_items = [
        {
            "task_id": "task_due_1",
            "title": "Implement multi-factor authentication",
            "owner": "Elena Rostova",
            "due_date": "2026-10-25",
        },
        {
            "task_id": "task_due_2",
            "title": "Implement multi-factor authentication",
            "owner": "Elena Rostova",
            "due_date": "2026-11-15",
        },
    ]
    res_due = detect_duplicates_and_conflicts(deadline_conflict_items)
    td1 = next(it for it in res_due if it["task_id"] == "task_due_1")
    assert td1["conflict_flag"] is True
    assert td1["duplicate_of"] is None
    assert "Deadline conflict" in td1["conflict_note"]


def test_generic_titles_are_not_falsely_flagged():
    """Generic titles like 'Follow up' or 'Next steps' must NOT be flagged as duplicates or conflicts."""
    items = [
        {
            "task_id": "gen_1",
            "title": "Follow up",
            "owner": "Sarah",
            "due_date": "2026-10-30",
        },
        {
            "task_id": "gen_2",
            "title": "Follow-up",
            "owner": "Sarah",
            "due_date": "2026-10-30",
        },
        {
            "task_id": "gen_3",
            "title": "Next steps",
            "owner": "Alex",
            "due_date": "2026-11-01",
        },
        {
            "task_id": "gen_4",
            "title": "Discuss next steps",
            "owner": "Liam",
            "due_date": "2026-11-05",
        },
    ]

    processed = detect_duplicates_and_conflicts(items)
    for it in processed:
        assert it["duplicate_of"] is None
        assert it["duplicate_note"] is None
        assert it["conflict_flag"] is False
        assert it["conflict_note"] is None


def test_ambiguous_matches_are_not_arbitrarily_selected():
    """When an item matches multiple candidate items equally, duplicate_of must remain None."""
    items = [
        {
            "task_id": "base_item",
            "title": "Deploy Kubernetes production monitoring ingress",
            "owner": "DevOps Team",
            "due_date": "2026-11-10",
        },
        {
            "task_id": "cand_1",
            "title": "Deploy Kubernetes production monitoring ingress",
            "owner": "DevOps Team",
            "due_date": "2026-11-10",
        },
        {
            "task_id": "cand_2",
            "title": "Deploy Kubernetes production monitoring ingress",
            "owner": "DevOps Team",
            "due_date": "2026-11-10",
        },
    ]

    processed = detect_duplicates_and_conflicts(items)
    base = next(it for it in processed if it["task_id"] == "base_item")
    assert base["duplicate_of"] is None
    assert base["duplicate_note"] is not None
    assert "Ambiguous candidate" in base["duplicate_note"]


def test_reextraction_cleans_dangling_duplicate_references(temp_db):
    """Re-extracting a meeting cleanly resets dangling duplicate_of pointers referencing deleted items."""
    # Meeting A has item A1
    meeting_a = insert_meeting(
        title="Meeting Alpha",
        transcript="Elena will configure Redis.",
        db_path=temp_db,
    )
    a_id = meeting_a["meeting_id"]
    item_a1 = {
        "task_id": "task_a1",
        "meeting_id": a_id,
        "title": "Configure Redis cluster",
        "category": "commitment",
        "commitment_status": "definite",
        "owner": "Elena",
        "due_date": "2026-10-30",
        "source_text": "Elena will configure Redis.",
        "approval_status": "pending",
    }
    save_extraction_results(a_id, decisions=[], action_items=[item_a1], db_path=temp_db)

    # Meeting B has item B1 pointing to item A1 as duplicate
    meeting_b = insert_meeting(
        title="Meeting Beta",
        transcript="Elena will configure Redis cluster.",
        db_path=temp_db,
    )
    b_id = meeting_b["meeting_id"]
    item_b1 = {
        "task_id": "task_b1",
        "meeting_id": b_id,
        "title": "Configure Redis cluster",
        "category": "commitment",
        "commitment_status": "definite",
        "owner": "Elena",
        "due_date": "2026-10-30",
        "source_text": "Elena will configure Redis cluster.",
        "approval_status": "pending",
        "duplicate_of": "task_a1",
        "duplicate_note": "Duplicate of Meeting Alpha",
    }
    save_extraction_results(b_id, decisions=[], action_items=[item_b1], db_path=temp_db)

    # Confirm item B1 points to task_a1
    b1_before = get_action_item("task_b1", db_path=temp_db)
    assert b1_before["duplicate_of"] == "task_a1"

    # Now re-extract Meeting Alpha with updated item A2
    item_a2 = {
        "task_id": "task_a2",
        "meeting_id": a_id,
        "title": "Configure Valkey cluster instead of Redis",
        "category": "commitment",
        "commitment_status": "definite",
        "owner": "Elena",
        "due_date": "2026-10-30",
        "source_text": "Elena will configure Valkey.",
        "approval_status": "approved",
    }
    save_extraction_results(a_id, decisions=[], action_items=[item_a2], db_path=temp_db)

    # Verify task_a1 was deleted and item B1 duplicate_of was cleanly set to NULL (not dangling!)
    assert get_action_item("task_a1", db_path=temp_db) is None
    b1_after = get_action_item("task_b1", db_path=temp_db)
    assert b1_after["duplicate_of"] is None
