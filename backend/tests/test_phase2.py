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
    list_decisions,
    list_action_items,
)
from app.services.extractor import verify_transcript_evidence


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


# --- Evidence Verification Unit Tests ---

def test_evidence_verification_exact_match():
    transcript = "Riya will finish the login screen by Friday afternoon."
    excerpt = "Riya will finish the login screen"
    assert verify_transcript_evidence(excerpt, transcript) is True


def test_evidence_verification_normalized_whitespace():
    transcript = "Aman agreed to\n  deploy the backend   API service by Monday."
    excerpt = "Aman agreed to deploy the backend API service by Monday."
    assert verify_transcript_evidence(excerpt, transcript) is True


def test_evidence_verification_fabricated_excerpt():
    transcript = "Vikram discussed benchmarking queries."
    excerpt = "Vikram will buy 10 servers by tomorrow."
    assert verify_transcript_evidence(excerpt, transcript) is False


# --- Schema and Classification Unit Tests ---

def test_raw_action_item_classification_validation():
    # Valid classifications
    valid_commitment = ExtractedActionItemRaw(
        title="Deploy auth service",
        category=ActionItemCategory.COMMITMENT,
        owner="Riya",
        due_date="2026-10-25",
        source_text="Riya will deploy auth service by Oct 25",
    )
    assert valid_commitment.category == "commitment"

    valid_suggestion = ExtractedActionItemRaw(
        title="Explore Redis caching",
        category=ActionItemCategory.SUGGESTION,
        owner=None,
        due_date=None,
        source_text="We could consider Redis caching",
    )
    assert valid_suggestion.owner is None
    assert valid_suggestion.due_date is None

    valid_question = ExtractedActionItemRaw(
        title="Who will handle QA?",
        category=ActionItemCategory.UNRESOLVED_QUESTION,
        owner=None,
        due_date=None,
        source_text="Who will handle QA?",
        clarification_required=True,
        clarification_note="Owner unassigned",
    )
    assert valid_question.category == "unresolved_question"
    assert valid_question.clarification_required is True


# --- Database Persistence & Re-Extraction Safety Tests ---

def test_persistence_and_safe_reextraction(temp_db):
    # Ingest meeting
    meeting = insert_meeting("Architecture Sync", "Discussed database.", db_path=temp_db)
    meeting_id = meeting["meeting_id"]

    # First extraction
    decisions_1 = [
        {
            "decision_id": "dec_1",
            "meeting_id": meeting_id,
            "title": "Use SQLite",
            "rationale": "Simple and fast",
            "source_text": "Agreed on SQLite",
            "evidence_verified": True,
        }
    ]
    actions_1 = [
        {
            "task_id": "task_1",
            "meeting_id": meeting_id,
            "title": "Setup SQLite",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Vikram",
            "due_date": "Monday",
            "source_text": "Vikram will setup SQLite by Monday",
            "approval_status": "pending",
        }
    ]

    save_extraction_results(meeting_id, decisions_1, actions_1, db_path=temp_db)
    assert len(list_decisions(meeting_id=meeting_id, db_path=temp_db)) == 1
    assert len(list_action_items(meeting_id=meeting_id, db_path=temp_db)) == 1

    # Safe Re-extraction: replaces previous results without duplication
    decisions_2 = [
        {
            "decision_id": "dec_2",
            "meeting_id": meeting_id,
            "title": "Use PostgreSQL",
            "source_text": "Shifted to Postgres",
            "evidence_verified": True,
        }
    ]
    actions_2 = [
        {
            "task_id": "task_2",
            "meeting_id": meeting_id,
            "title": "Setup Postgres",
            "category": "commitment",
            "commitment_status": "commitment",
            "owner": "Aman",
            "source_text": "Aman will setup Postgres",
            "approval_status": "pending",
        }
    ]

    save_extraction_results(meeting_id, decisions_2, actions_2, db_path=temp_db)
    stored_dec = list_decisions(meeting_id=meeting_id, db_path=temp_db)
    stored_act = list_action_items(meeting_id=meeting_id, db_path=temp_db)

    # Replaced cleanly, no duplicate old records
    assert len(stored_dec) == 1
    assert stored_dec[0]["decision_id"] == "dec_2"
    assert len(stored_act) == 1
    assert stored_act[0]["task_id"] == "task_2"
    assert stored_act[0]["approval_status"] == ApprovalStatus.PENDING.value


# --- API Endpoint Tests ---

def test_extract_endpoint_missing_meeting(client):
    response = client.post("/api/meetings/mtg_nonexistent/extract")
    assert response.status_code == 404


def test_extract_endpoint_missing_api_key_safe_error(client, monkeypatch):
    # Ensure GEMINI_API_KEY is unset to verify safe configuration error
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setattr("app.config.GEMINI_API_KEY", "")
    monkeypatch.setattr("app.services.extractor.GEMINI_API_KEY", "")
    monkeypatch.setattr("app.services.extractor.get_gemini_api_key", lambda: "")


    # Create meeting
    res = client.post("/api/meetings", json={"title": "Test", "transcript": "Some transcript"})
    meeting_id = res.json()["meeting_id"]

    # Attempt extraction
    extract_res = client.post(f"/api/meetings/{meeting_id}/extract")
    assert extract_res.status_code == 400
    detail = extract_res.json()["detail"]
    assert "Gemini API key is not configured" in detail


def test_workspace_decisions_and_actions_endpoints(client, temp_db):
    meeting = insert_meeting("Sync", "Transcript", db_path=temp_db)
    meeting_id = meeting["meeting_id"]

    save_extraction_results(
        meeting_id,
        [{"decision_id": "d1", "meeting_id": meeting_id, "title": "Decision 1", "source_text": "T1", "evidence_verified": True}],
        [{"task_id": "t1", "meeting_id": meeting_id, "title": "Task 1", "category": "commitment", "commitment_status": "commitment", "source_text": "T2", "approval_status": "pending"}],
        db_path=temp_db,
    )

    dec_res = client.get("/api/decisions")
    assert dec_res.status_code == 200
    assert len(dec_res.json()) >= 1

    act_res = client.get("/api/action-items")
    assert act_res.status_code == 200
    assert len(act_res.json()) >= 1
    assert act_res.json()[0]["approval_status"] == "pending"
