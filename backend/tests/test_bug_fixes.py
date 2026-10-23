import os
import tempfile
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from app.main import app
from app.models import ActionItemCategory, ApprovalStatus
from app.database import (
    init_db,
    insert_meeting,
    save_extraction_results,
    get_action_item,
    list_action_items,
    update_action_item,
)
from app.services.tracker import parse_due_date, evaluate_task_schedule
from app.services.detector import detect_duplicates_and_conflicts
from app.services.firewall import edit_action_item, ActionItemUpdate


@pytest.fixture
def temp_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    if os.path.exists(path):
        os.remove(path)


@pytest.fixture
def client(temp_db, monkeypatch):
    monkeypatch.setattr("app.database.DATABASE_PATH", temp_db)
    monkeypatch.setattr("app.config.DATABASE_PATH", temp_db)
    monkeypatch.setattr("app.services.exporter.DATABASE_PATH", temp_db)
    monkeypatch.setattr("app.services.tracker.DATABASE_PATH", temp_db)
    monkeypatch.setattr("app.services.integrations.DATABASE_PATH", temp_db)
    with TestClient(app) as test_client:
        yield test_client


def test_re_extraction_preserves_approved_items(temp_db):
    """Bug fix: re-extracting a meeting must NOT delete or reset already approved action items."""
    meeting = insert_meeting("Sprint Planning", "2026-10-24", "Alice will deploy staging.", db_path=temp_db)
    m_id = meeting["meeting_id"]

    initial_actions = [
        {
            "task_id": "task_approved_first",
            "meeting_id": m_id,
            "title": "Deploy staging environment",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Alice",
            "due_date": "2026-10-28",
            "source_text": "Alice will deploy staging.",
            "approval_status": "pending",
            "evidence_verified": True,
        },
        {
            "task_id": "task_pending_first",
            "meeting_id": m_id,
            "title": "Clean up logs",
            "category": "suggestion",
            "commitment_status": "suggestion",
            "owner": "Bob",
            "due_date": None,
            "source_text": "Clean up logs",
            "approval_status": "pending",
            "evidence_verified": True,
        }
    ]

    save_extraction_results(m_id, decisions=[], action_items=initial_actions, db_path=temp_db)

    # Approve task_approved_first
    update_action_item("task_approved_first", {"approval_status": "approved"}, db_path=temp_db)
    assert get_action_item("task_approved_first", db_path=temp_db)["approval_status"] == "approved"

    # Now simulate a re-extraction with new or refreshed items
    re_extracted_actions = [
        {
            "task_id": "task_approved_first",
            "meeting_id": m_id,
            "title": "Deploy staging environment",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Alice",
            "due_date": "2026-10-28",
            "source_text": "Alice will deploy staging.",
            "approval_status": "pending",
            "evidence_verified": True,
        },
        {
            "task_id": "task_newly_discovered",
            "meeting_id": m_id,
            "title": "Set up Grafana alerts",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Charlie",
            "due_date": "2026-10-31",
            "source_text": "Set up Grafana alerts",
            "approval_status": "pending",
            "evidence_verified": True,
        }
    ]

    save_extraction_results(m_id, decisions=[], action_items=re_extracted_actions, db_path=temp_db)

    # Approved item must still be present and still approved!
    approved_item = get_action_item("task_approved_first", db_path=temp_db)
    assert approved_item is not None
    assert approved_item["approval_status"] == "approved"

    # Old unapproved item ("task_pending_first") was replaced
    assert get_action_item("task_pending_first", db_path=temp_db) is None

    # New item was saved
    assert get_action_item("task_newly_discovered", db_path=temp_db) is not None


def test_edits_preserve_duplicate_flags(temp_db):
    """Bug fix: editing description or owner must NOT wipe duplicate flags."""
    meeting = insert_meeting("Architecture Review", "2026-10-24", "Transcript", db_path=temp_db)
    m_id = meeting["meeting_id"]

    item1 = {
        "task_id": "task_parent",
        "meeting_id": m_id,
        "title": "Migrate database schema to v2",
        "category": "commitment",
        "commitment_status": "commitment",
        "owner": "Dave",
        "due_date": "2026-11-01",
        "source_text": "Migrate database schema to v2",
        "approval_status": "pending",
        "evidence_verified": True,
    }
    item2 = {
        "task_id": "task_dup",
        "meeting_id": m_id,
        "title": "Migrate database schema to v2",
        "category": "commitment",
        "commitment_status": "commitment",
        "owner": "Dave",
        "due_date": "2026-11-01",
        "source_text": "Migrate database schema to v2",
        "approval_status": "pending",
        "evidence_verified": True,
    }

    save_extraction_results(m_id, decisions=[], action_items=[item1, item2], db_path=temp_db)

    # Verify task_dup has duplicate_of set
    enriched = detect_duplicates_and_conflicts([item2], meeting_id=m_id, db_path=temp_db)
    assert enriched[0]["duplicate_of"] == "task_parent"

    update_action_item("task_dup", {
        "duplicate_of": "task_parent",
        "duplicate_note": "Potential duplicate of Migrate database schema to v2",
    }, db_path=temp_db)

    # Edit description on task_dup
    edit_action_item("task_dup", ActionItemUpdate(description="Adding notes on downtime"), db_path=temp_db)

    after_edit = get_action_item("task_dup", db_path=temp_db)
    assert after_edit["description"] == "Adding notes on downtime"
    # Duplicate flag MUST NOT be wiped!
    assert after_edit["duplicate_of"] == "task_parent"
    assert "duplicate" in (after_edit.get("duplicate_note") or "").lower()


def test_parse_due_date_eod_and_end_of_month():
    """Bug fix: parse_due_date supports 'end of month', 'EOD', 'end of day', 'COB'."""
    ref = datetime(2026, 10, 24, 10, 0, 0, tzinfo=timezone.utc)

    # 1. "end of month" -> Oct 31, 2026 23:59:59
    d_eom = parse_due_date("end of month", ref_datetime=ref)
    assert d_eom is not None
    assert d_eom.year == 2026
    assert d_eom.month == 10
    assert d_eom.day == 31
    assert d_eom.hour == 23

    # 2. "by end of the month"
    d_eom2 = parse_due_date("by end of the month", ref_datetime=ref)
    assert d_eom2 is not None
    assert d_eom2.day == 31

    # 3. "end of november" -> Nov 30, 2026
    d_nov = parse_due_date("end of november", ref_datetime=ref)
    assert d_nov is not None
    assert d_nov.month == 11
    assert d_nov.day == 30

    # 4. "EOD" -> Oct 24, 2026 23:59:59
    d_eod = parse_due_date("EOD", ref_datetime=ref)
    assert d_eod is not None
    assert d_eod.year == 2026
    assert d_eod.month == 10
    assert d_eod.day == 24
    assert d_eod.hour == 23

    # 5. "by end of day" -> Oct 24, 2026
    d_end_of_day = parse_due_date("by end of day", ref_datetime=ref)
    assert d_end_of_day is not None
    assert d_end_of_day.day == 24

    # 6. "COB" -> Oct 24, 2026
    d_cob = parse_due_date("COB", ref_datetime=ref)
    assert d_cob is not None
    assert d_cob.day == 24

    # 7. "Friday EOD" -> coming Friday Oct 30, 2026
    d_fri_eod = parse_due_date("Friday EOD", ref_datetime=ref)
    assert d_fri_eod is not None
    assert d_fri_eod.year == 2026
    assert d_fri_eod.month == 10
    assert d_fri_eod.day == 30
