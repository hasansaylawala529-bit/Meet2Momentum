import os
import tempfile
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.models import ActionItem, ActionItemCategory, ApprovalStatus, MeetingCreate
from app.database import init_db, insert_meeting, list_meetings, get_meeting, get_db_connection


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


# Test 1: Health endpoint responds successfully
def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Meet2Momentum API"


# Test 2: Valid meeting can be created
def test_create_valid_meeting(client):
    payload = {
        "title": "Sprint Planning Sync",
        "transcript": "Riya will complete the login page by Friday. Aman will finish the API integration.",
        "meeting_date": "2026-10-23"
    }
    response = client.post("/api/meetings", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == payload["title"]
    assert data["transcript"] == payload["transcript"]
    assert data["meeting_date"] == payload["meeting_date"]
    assert data["meeting_id"].startswith("mtg_")
    assert "created_at" in data


# Test 3: Empty transcript text is rejected
def test_reject_empty_transcript(client):
    payload = {
        "title": "Sprint Planning Sync",
        "transcript": ""
    }
    response = client.post("/api/meetings", json=payload)
    assert response.status_code == 422  # Pydantic validation error


# Test 4: Whitespace-only transcript text is rejected
def test_reject_whitespace_transcript(client):
    payload = {
        "title": "Sprint Planning Sync",
        "transcript": "   \n\t  "
    }
    response = client.post("/api/meetings", json=payload)
    assert response.status_code == 422


# Test 5: Invalid action-item categories are rejected by Pydantic schema
def test_reject_invalid_action_item_category():
    with pytest.raises(ValidationError):
        ActionItem(
            task_id="task_1",
            meeting_id="mtg_1",
            title="Design Dashboard",
            category="random_category",  # Invalid category
            commitment_status=ActionItemCategory.COMMITMENT
        )


# Test 6: Invalid approval statuses are rejected by Pydantic schema
def test_reject_invalid_approval_status():
    with pytest.raises(ValidationError):
        ActionItem(
            task_id="task_1",
            meeting_id="mtg_1",
            title="Design Dashboard",
            category=ActionItemCategory.COMMITMENT,
            commitment_status=ActionItemCategory.COMMITMENT,
            approval_status="arbitrary_status"  # Invalid approval status
        )


# Test 7: SQLite tables initialize correctly
def test_sqlite_tables_initialize(temp_db):
    conn = get_db_connection(temp_db)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {row["name"] for row in cursor.fetchall()}
    conn.close()
    
    assert "meetings" in tables
    assert "decisions" in tables
    assert "action_items" in tables


# Test 8: Saved meeting persists and can be retrieved
def test_meeting_persistence_and_retrieval(temp_db):
    saved = insert_meeting(
        title="Architecture Review",
        transcript="Discussed modularity of the pipeline.",
        meeting_date="2026-10-23",
        db_path=temp_db
    )
    meeting_id = saved["meeting_id"]

    retrieved = get_meeting(meeting_id, db_path=temp_db)
    assert retrieved is not None
    assert retrieved["meeting_id"] == meeting_id
    assert retrieved["title"] == "Architecture Review"
    assert retrieved["transcript"] == "Discussed modularity of the pipeline."

    all_meetings = list_meetings(db_path=temp_db)
    assert any(m["meeting_id"] == meeting_id for m in all_meetings)


# Test 9: Database initialization does not erase existing records
def test_idempotent_init_preserves_records(temp_db):
    saved = insert_meeting(
        title="Quarterly Review",
        transcript="Reviewed Q3 metrics.",
        db_path=temp_db
    )
    meeting_id = saved["meeting_id"]

    # Re-run init_db on the same database file
    init_db(temp_db)

    # Verify the record is still present and intact
    retrieved = get_meeting(meeting_id, db_path=temp_db)
    assert retrieved is not None
    assert retrieved["title"] == "Quarterly Review"


# Test 10: Error responses are appropriate for invalid requests
def test_error_response_for_missing_fields(client):
    # Missing required title and transcript
    response = client.post("/api/meetings", json={})
    assert response.status_code == 422
    data = response.json()
    assert "detail" in data

    # Empty title
    response = client.post("/api/meetings", json={"title": "   ", "transcript": "Some text"})
    assert response.status_code == 422

    # Non-existent meeting retrieval
    response = client.get("/api/meetings/non_existent_id")
    assert response.status_code == 404
