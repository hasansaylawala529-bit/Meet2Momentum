import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any
from app.config import DATABASE_PATH


def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    target_path = db_path or DATABASE_PATH
    if target_path != ":memory:":
        Path(target_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(target_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def _migrate_columns(conn: sqlite3.Connection) -> None:
    """Non-destructively add new columns if they do not exist."""
    cursor = conn.cursor()
    
    # Check decisions table columns
    cursor.execute("PRAGMA table_info(decisions);")
    decision_cols = {row["name"] for row in cursor.fetchall()}
    if "rationale" not in decision_cols:
        cursor.execute("ALTER TABLE decisions ADD COLUMN rationale TEXT;")
    if "evidence_verified" not in decision_cols:
        cursor.execute("ALTER TABLE decisions ADD COLUMN evidence_verified INTEGER NOT NULL DEFAULT 1;")

    # Check action_items table columns
    cursor.execute("PRAGMA table_info(action_items);")
    action_cols = {row["name"] for row in cursor.fetchall()}
    if "clarification_note" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN clarification_note TEXT;")
    if "evidence_verified" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN evidence_verified INTEGER NOT NULL DEFAULT 1;")


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
                    rationale TEXT,
                    source_text TEXT,
                    evidence_verified INTEGER NOT NULL DEFAULT 1,
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
                    clarification_note TEXT,
                    duplicate_of TEXT,
                    conflict_flag INTEGER NOT NULL DEFAULT 0,
                    evidence_verified INTEGER NOT NULL DEFAULT 1,
                    approval_status TEXT NOT NULL DEFAULT 'pending',
                    execution_status TEXT NOT NULL DEFAULT 'not_exported',
                    task_status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (meeting_id) REFERENCES meetings (meeting_id) ON DELETE CASCADE
                );
            """)

            _migrate_columns(conn)
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


def save_extraction_results(
    meeting_id: str,
    decisions: List[Dict[str, Any]],
    action_items: List[Dict[str, Any]],
    db_path: Optional[str] = None
) -> None:
    """
    Atomically replace extraction outcomes for a meeting.
    Safely re-extracts without duplicates or deleting history if transaction fails.
    """
    conn = get_db_connection(db_path)
    try:
        with conn:
            # 1. Clear previous extracted records for this meeting
            conn.execute("DELETE FROM decisions WHERE meeting_id = ?", (meeting_id,))
            conn.execute("DELETE FROM action_items WHERE meeting_id = ?", (meeting_id,))

            # 2. Insert new decisions
            for d in decisions:
                conn.execute(
                    """
                    INSERT INTO decisions (
                        decision_id, meeting_id, title, description, rationale,
                        source_text, evidence_verified, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        d["decision_id"],
                        meeting_id,
                        d["title"],
                        d.get("description"),
                        d.get("rationale"),
                        d.get("source_text"),
                        1 if d.get("evidence_verified", True) else 0,
                        d.get("created_at", datetime.now(timezone.utc).isoformat())
                    )
                )

            # 3. Insert new action items
            for a in action_items:
                conn.execute(
                    """
                    INSERT INTO action_items (
                        task_id, meeting_id, title, description, category,
                        commitment_status, owner, due_date, source_text,
                        clarification_required, clarification_note, duplicate_of,
                        conflict_flag, evidence_verified, approval_status,
                        execution_status, task_status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        a["task_id"],
                        meeting_id,
                        a["title"],
                        a.get("description"),
                        a["category"],
                        a["commitment_status"],
                        a.get("owner"),
                        a.get("due_date"),
                        a.get("source_text"),
                        1 if a.get("clarification_required", False) else 0,
                        a.get("clarification_note"),
                        a.get("duplicate_of"),
                        1 if a.get("conflict_flag", False) else 0,
                        1 if a.get("evidence_verified", True) else 0,
                        a.get("approval_status", "pending"),
                        a.get("execution_status", "not_exported"),
                        a.get("task_status", "pending"),
                        a.get("created_at", datetime.now(timezone.utc).isoformat())
                    )
                )
    finally:
        conn.close()


def list_decisions(meeting_id: Optional[str] = None, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve decisions, optionally filtered by meeting_id."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        if meeting_id:
            cursor.execute(
                "SELECT * FROM decisions WHERE meeting_id = ? ORDER BY created_at DESC",
                (meeting_id,)
            )
        else:
            cursor.execute("SELECT * FROM decisions ORDER BY created_at DESC")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["evidence_verified"] = bool(d.get("evidence_verified", 1))
            result.append(d)
        return result
    finally:
        conn.close()


def list_action_items(
    meeting_id: Optional[str] = None,
    category: Optional[str] = None,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Retrieve action items, optionally filtered by meeting_id or category."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        query = "SELECT * FROM action_items WHERE 1=1"
        params = []
        if meeting_id:
            query += " AND meeting_id = ?"
            params.append(meeting_id)
        if category:
            query += " AND category = ?"
            params.append(category)
        query += " ORDER BY created_at DESC"
        
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["clarification_required"] = bool(d.get("clarification_required", 0))
            d["conflict_flag"] = bool(d.get("conflict_flag", 0))
            d["evidence_verified"] = bool(d.get("evidence_verified", 1))
            result.append(d)
        return result
    finally:
        conn.close()
