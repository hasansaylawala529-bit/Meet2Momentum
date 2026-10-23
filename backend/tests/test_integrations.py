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
    get_action_item,
    get_task_history,
)
from app.services.integrations import format_github_issue


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


def seed_test_data(db_path):
    meeting = insert_meeting(
        title="Integration Test Meeting",
        meeting_date="2026-10-24",
        transcript="Sarah confirmed she will deploy auth service by Friday.",
        db_path=db_path,
    )
    meeting_id = meeting["meeting_id"]

    from app.database import get_db_connection
    conn = get_db_connection(db_path)
    with conn:
        conn.execute(
            """
            INSERT INTO action_items (
                task_id, meeting_id, title, description, category, commitment_status,
                owner, due_date, source_text, evidence_verified, approval_status, execution_status,
                task_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "task_approved_1",
                meeting_id,
                "Deploy auth service to staging",
                "Setup staging auth service",
                ActionItemCategory.COMMITMENT.value,
                "commitment",
                "Sarah Connor",
                "Friday",
                "Sarah confirmed she will deploy auth service by Friday.",
                1,
                ApprovalStatus.APPROVED.value,
                ExecutionStatus.NOT_EXPORTED.value,
                TaskStatus.PENDING.value,
                datetime.now(timezone.utc).isoformat(),
            )
        )
        conn.execute(
            """
            INSERT INTO action_items (
                task_id, meeting_id, title, description, category, commitment_status,
                owner, due_date, source_text, evidence_verified, approval_status, execution_status,
                task_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "task_pending_1",
                meeting_id,
                "Evaluate database sharding",
                "Review sharding options",
                ActionItemCategory.SUGGESTION.value,
                "suggestion",
                "Vikram Patel",
                None,
                "Vikram suggested looking at sharding.",
                1,
                ApprovalStatus.PENDING.value,
                ExecutionStatus.NOT_EXPORTED.value,
                TaskStatus.PENDING.value,
                datetime.now(timezone.utc).isoformat(),
            )
        )
    conn.close()
    return meeting_id


def test_format_github_issue_payload():
    item = {
        "task_id": "task_123",
        "meeting_id": "mtg_456",
        "title": "Configure staging database",
        "description": "Install PostgreSQL 16 on staging",
        "category": "commitment",
        "owner": "Sarah Chen",
        "due_date": "2026-10-30",
        "source_text": "Sarah will configure staging database by Oct 30.",
        "meeting_title": "Sprint Planning",
        "meeting_date": "2026-10-24",
    }
    payload = format_github_issue(item)
    assert "[COMMITMENT]" in payload["title"]
    assert "Sarah will configure staging database by Oct 30." in payload["body"]
    assert "**Assigned Owner:** Sarah Chen" in payload["body"]
    # Transcripts contain human names, not GitHub handles: assignees must NOT be set
    assert "assignees" not in payload
    assert "@Sarah" not in payload["body"]
    assert "approved-by-firewall" in payload["labels"]


def test_github_dispatch_blocks_when_server_token_missing(client, temp_db, monkeypatch):
    """If GITHUB_TOKEN is not configured on the server, dispatch fails without generating fake URLs."""
    seed_test_data(temp_db)
    monkeypatch.setenv("GITHUB_TOKEN", "")
    monkeypatch.setattr("app.services.integrations.GITHUB_TOKEN", "")

    res = client.post("/api/action-items/task_approved_1/dispatch-github")
    assert res.status_code == 400
    assert "GITHUB_TOKEN is not configured in the server environment" in res.json()["detail"]


def test_github_dispatch_approved_item_with_real_api(client, temp_db, monkeypatch):
    """When GITHUB_TOKEN is configured in server env, calls real GitHub REST API and records html_url."""
    seed_test_data(temp_db)
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_real_server_token_secret_123")
    monkeypatch.setattr("app.services.integrations.GITHUB_TOKEN", "ghp_real_server_token_secret_123")

    captured_requests = []

    class MockResponse:
        status_code = 201
        text = '{"html_url": "https://github.com/hasansaylawala529-bit/Meet2Momentum/issues/42", "number": 42}'
        def json(self):
            return {
                "html_url": "https://github.com/hasansaylawala529-bit/Meet2Momentum/issues/42",
                "number": 42,
                "title": "[COMMITMENT] Deploy auth service to staging",
            }

    class MockHttpxClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, json=None, headers=None):
            captured_requests.append({"url": url, "json": json, "headers": headers})
            return MockResponse()

    monkeypatch.setattr("httpx.Client", MockHttpxClient)

    res = client.post("/api/action-items/task_approved_1/dispatch-github")
    assert res.status_code == 200
    data = res.json()
    assert data["execution_status"] == "exported"
    assert data["external_url"] == "https://github.com/hasansaylawala529-bit/Meet2Momentum/issues/42"
    assert data["external_id"] == "#42"

    # Verify authorization used server token only and did NOT pass assignees
    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert req["headers"]["Authorization"] == "Bearer ghp_real_server_token_secret_123"
    assert "assignees" not in req["json"]

    # Verify audit history
    history = get_task_history("task_approved_1", db_path=temp_db)
    export_events = [h for h in history if h["event_type"] == "exported"]
    assert len(export_events) >= 1
    assert "https://github.com/hasansaylawala529-bit/Meet2Momentum/issues/42" in export_events[0]["details"]


def test_github_dispatch_blocks_unapproved_item(client, temp_db, monkeypatch):
    seed_test_data(temp_db)
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_server_token")
    monkeypatch.setattr("app.services.integrations.GITHUB_TOKEN", "ghp_server_token")

    # Attempt to dispatch pending item
    res = client.post("/api/action-items/task_pending_1/dispatch-github")
    assert res.status_code == 400
    assert "Commitment Firewall blocked dispatch" in res.json()["detail"]


def test_github_batch_dispatch_partitions_items(client, temp_db, monkeypatch):
    seed_test_data(temp_db)
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_server_token")
    monkeypatch.setattr("app.services.integrations.GITHUB_TOKEN", "ghp_server_token")

    class MockResponse:
        status_code = 201
        text = '{"html_url": "https://github.com/hasansaylawala529-bit/Meet2Momentum/issues/42", "number": 42}'
        def json(self):
            return {"html_url": "https://github.com/hasansaylawala529-bit/Meet2Momentum/issues/42", "number": 42}

    class MockHttpxClient:
        def __init__(self, *args, **kwargs):
            pass
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def post(self, url, json=None, headers=None):
            return MockResponse()

    monkeypatch.setattr("httpx.Client", MockHttpxClient)

    res = client.post("/api/integrations/github/dispatch")
    assert res.status_code == 200
    data = res.json()
    assert data["dispatched_count"] == 1
    assert data["blocked_count"] == 1
    assert data["dispatched_items"][0]["task_id"] == "task_approved_1"
    assert data["blocked_items"][0]["task_id"] == "task_pending_1"


def test_material_edit_resets_and_blocks_github_dispatch(client, temp_db, monkeypatch):
    seed_test_data(temp_db)
    monkeypatch.setenv("GITHUB_TOKEN", "ghp_server_token")
    monkeypatch.setattr("app.services.integrations.GITHUB_TOKEN", "ghp_server_token")

    # Materially edit the approved item (changes deadline)
    patch_res = client.patch(
        "/api/action-items/task_approved_1",
        json={"due_date": "Next Month"}
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["approval_status"] == "pending"

    # Now attempt dispatch: should be blocked by firewall!
    res = client.post("/api/action-items/task_approved_1/dispatch-github")
    assert res.status_code == 400
    assert "Commitment Firewall blocked dispatch" in res.json()["detail"]
