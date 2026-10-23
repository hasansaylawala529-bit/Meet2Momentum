import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any
from app.config import DATABASE_PATH


def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    target_path = db_path or DATABASE_PATH
    # Ensure directory exists if not memory database
    if target_path != ":memory:":
        Path(target_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(target_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(db_path: Optional[str] = None) -> None:
    """Initialize database tables idempotently without overwriting existing data."""
    conn = get_db_connection(db_path)
    try:
        with conn:
            # 1. Meetings Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS meetings (
                    meeting_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    transcript TEXT NOT NULL,
                    meeting_date TEXT,
                    created_at TEXT NOT NULL
                );
            """)

            # 2. Decisions Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS decisions (
                    decision_id TEXT PRIMARY KEY,
                    meeting_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    source_text TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (meeting_id) REFERENCES meetings (meeting_id) ON DELETE CASCADE
                );
            """)

            # 3. Action Items Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS action_items (
                    task_id TEXT PRIMARY KEY,
                    meeting_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT,
                    category TEXT NOT NULL,
                    commitment_status TEXT NOT NULL,
                    owner TEXT,
                    due_date TEXT,
                    source_text TEXT,
                    clarification_required INTEGER NOT NULL DEFAULT 0,
                    duplicate_of TEXT,
                    conflict_flag INTEGER NOT NULL DEFAULT 0,
                    approval_status TEXT NOT NULL DEFAULT 'pending',
                    execution_status TEXT NOT NULL DEFAULT 'not_exported',
                    task_status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (meeting_id) REFERENCES meetings (meeting_id) ON DELETE CASCADE
                );
            """)
    finally:
        conn.close()


def insert_meeting(title: str, transcript: str, meeting_date: Optional[str] = None, db_path: Optional[str] = None) -> Dict[str, Any]:
    """Persist a new meeting record using parameterized query."""
    meeting_id = f"mtg_{uuid.uuid4().hex[:12]}"
    created_at = datetime.now(timezone.utc).isoformat()
    
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO meetings (meeting_id, title, transcript, meeting_date, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (meeting_id, title, transcript, meeting_date, created_at)
            )
        return {
            "meeting_id": meeting_id,
            "title": title,
            "transcript": transcript,
            "meeting_date": meeting_date,
            "created_at": created_at
        }
    finally:
        conn.close()


def list_meetings(db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve all stored meetings ordered by creation date descending."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT meeting_id, title, transcript, meeting_date, created_at FROM meetings ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_meeting(meeting_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieve single meeting by id."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT meeting_id, title, transcript, meeting_date, created_at FROM meetings WHERE meeting_id = ?", (meeting_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
