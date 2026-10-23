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
    if "exported_at" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN exported_at TEXT;")
    if "completed_at" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN completed_at TEXT;")
    if "conflict_note" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN conflict_note TEXT;")
    if "duplicate_note" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN duplicate_note TEXT;")
    if "external_url" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN external_url TEXT;")
    if "integration_service" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN integration_service TEXT;")
    if "external_id" not in action_cols:
        cursor.execute("ALTER TABLE action_items ADD COLUMN external_id TEXT;")


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
                    duplicate_note TEXT,
                    conflict_flag INTEGER NOT NULL DEFAULT 0,
                    conflict_note TEXT,
                    evidence_verified INTEGER NOT NULL DEFAULT 1,
                    approval_status TEXT NOT NULL DEFAULT 'pending',
                    execution_status TEXT NOT NULL DEFAULT 'not_exported',
                    task_status TEXT NOT NULL DEFAULT 'pending',
                    exported_at TEXT,
                    completed_at TEXT,
                    external_url TEXT,
                    integration_service TEXT,
                    external_id TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (meeting_id) REFERENCES meetings (meeting_id) ON DELETE CASCADE
                );
            """)

            # 4. Task History / Audit Trail Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS task_history (
                    history_id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    old_value TEXT,
                    new_value TEXT,
                    details TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES action_items (task_id) ON DELETE CASCADE
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
            # 1. Clear previous extracted records for this meeting and clean dangling duplicate references
            conn.execute(
                "UPDATE action_items SET duplicate_of = NULL WHERE duplicate_of IN (SELECT task_id FROM action_items WHERE meeting_id = ?)",
                (meeting_id,)
            )
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
            # 3. Insert new action items & initial audit event
            for a in action_items:
                created_ts = a.get("created_at", datetime.now(timezone.utc).isoformat())
                conn.execute(
                    """
                    INSERT INTO action_items (
                        task_id, meeting_id, title, description, category,
                        commitment_status, owner, due_date, source_text,
                        clarification_required, clarification_note, duplicate_of,
                        duplicate_note, conflict_flag, conflict_note, evidence_verified,
                        approval_status, execution_status, task_status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        a.get("duplicate_note"),
                        1 if a.get("conflict_flag", False) else 0,
                        a.get("conflict_note"),
                        1 if a.get("evidence_verified", True) else 0,
                        a.get("approval_status", "pending"),
                        a.get("execution_status", "not_exported"),
                        a.get("task_status", "pending"),
                        created_ts
                    )
                )
                conn.execute(
                    """
                    INSERT INTO task_history (history_id, task_id, event_type, old_value, new_value, details, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"hist_{uuid.uuid4().hex[:12]}",
                        a["task_id"],
                        "extracted",
                        None,
                        "pending",
                        f"Extracted from transcript as '{a['category']}'",
                        created_ts
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
    approval_status: Optional[str] = None,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Retrieve action items, optionally filtered by meeting_id, category, or approval_status."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        query = """
            SELECT a.*, m.meeting_date, m.title as meeting_title 
            FROM action_items a 
            LEFT JOIN meetings m ON a.meeting_id = m.meeting_id 
            WHERE 1=1
        """
        params = []
        if meeting_id:
            query += " AND a.meeting_id = ?"
            params.append(meeting_id)
        if category:
            query += " AND a.category = ?"
            params.append(category)
        if approval_status:
            query += " AND a.approval_status = ?"
            params.append(approval_status)
        query += " ORDER BY a.created_at DESC"
        
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


def get_action_item(task_id: str, db_path: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Retrieve single action item by task_id."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT a.*, m.meeting_date, m.title as meeting_title 
            FROM action_items a 
            LEFT JOIN meetings m ON a.meeting_id = m.meeting_id 
            WHERE a.task_id = ?
        """, (task_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["clarification_required"] = bool(d.get("clarification_required", 0))
        d["conflict_flag"] = bool(d.get("conflict_flag", 0))
        d["evidence_verified"] = bool(d.get("evidence_verified", 1))
        return d
    finally:
        conn.close()


def update_action_item(
    task_id: str,
    fields: Dict[str, Any],
    db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Atomically update specified fields on an action item.
    Returns the updated action item dictionary, or None if not found.
    """
    if not fields:
        return get_action_item(task_id, db_path=db_path)

    # Allowed columns to update
    allowed_columns = {
        "title",
        "description",
        "category",
        "commitment_status",
        "owner",
        "due_date",
        "source_text",
        "clarification_required",
        "clarification_note",
        "duplicate_of",
        "duplicate_note",
        "conflict_flag",
        "conflict_note",
        "evidence_verified",
        "approval_status",
        "execution_status",
        "task_status",
        "exported_at",
        "completed_at",
        "external_url",
        "integration_service",
        "external_id",
    }

    set_clauses = []
    params = []

    for k, v in fields.items():
        if k in allowed_columns:
            set_clauses.append(f"{k} = ?")
            # Convert booleans to 1 / 0 for SQLite
            if isinstance(v, bool):
                params.append(1 if v else 0)
            else:
                params.append(v)

    if not set_clauses:
        return get_action_item(task_id, db_path=db_path)

    params.append(task_id)
    sql = f"UPDATE action_items SET {', '.join(set_clauses)} WHERE task_id = ?"

    conn = get_db_connection(db_path)
    try:
        with conn:
            cursor = conn.cursor()
            cursor.execute(sql, tuple(params))
            if cursor.rowcount == 0:
                return None
        return get_action_item(task_id, db_path=db_path)
    finally:
        conn.close()


def mark_action_item_exported(
    task_id: str,
    exported_at: Optional[str] = None,
    db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Transition an action item's execution_status to 'exported' with an explicit timestamp."""
    timestamp = exported_at or datetime.now(timezone.utc).isoformat()
    updated = update_action_item(
        task_id=task_id,
        fields={
            "execution_status": "exported",
            "exported_at": timestamp,
        },
        db_path=db_path
    )
    if updated:
        log_task_history(
            task_id=task_id,
            event_type="exported",
            old_value="not_exported",
            new_value="exported",
            details=f"Dispatched downstream at {timestamp}",
            db_path=db_path
        )
    return updated


def get_export_summary(db_path: Optional[str] = None) -> Dict[str, Any]:
    """Retrieve workspace-level execution and export summary metrics."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) as cnt FROM action_items")
        total_items = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM action_items WHERE category = 'commitment'")
        total_commitments = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM action_items WHERE approval_status = 'approved'")
        approved_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM action_items WHERE execution_status = 'exported'")
        exported_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM action_items WHERE approval_status = 'approved' AND execution_status != 'exported'")
        pending_export_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT COUNT(*) as cnt FROM action_items WHERE approval_status != 'approved'")
        blocked_count = cursor.fetchone()["cnt"]

        cursor.execute("SELECT MAX(exported_at) as last_exp FROM action_items WHERE exported_at IS NOT NULL")
        last_row = cursor.fetchone()
        last_exported_at = last_row["last_exp"] if (last_row and last_row["last_exp"]) else None

        return {
            "total_items": total_items,
            "total_commitments": total_commitments,
            "approved_count": approved_count,
            "firewall_eligible_count": approved_count,
            "exported_count": exported_count,
            "pending_export_count": pending_export_count,
            "blocked_count": blocked_count,
            "last_exported_at": last_exported_at,
        }
    finally:
        conn.close()


def log_task_history(
    task_id: str,
    event_type: str,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    details: Optional[str] = None,
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """Record an audit trail event for a task."""
    history_id = f"hist_{uuid.uuid4().hex[:12]}"
    created_at = datetime.now(timezone.utc).isoformat()
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO task_history (history_id, task_id, event_type, old_value, new_value, details, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (history_id, task_id, event_type, old_value, new_value, details, created_at)
            )
        return {
            "history_id": history_id,
            "task_id": task_id,
            "event_type": event_type,
            "old_value": old_value,
            "new_value": new_value,
            "details": details,
            "created_at": created_at,
        }
    finally:
        conn.close()


def get_task_history(task_id: str, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve all historical audit events for a task ordered by time ascending."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM task_history WHERE task_id = ? ORDER BY created_at ASC",
            (task_id,)
        )
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


def list_all_history(limit: int = 50, db_path: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve recent workspace-wide audit events ordered by time descending."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM task_history ORDER BY created_at DESC LIMIT ?",
            (limit,)
        )
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()


def update_action_item_progress(
    task_id: str,
    new_status: str,
    note: Optional[str] = None,
    db_path: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Update a task's task_status ('pending', 'in_progress', 'completed').
    If completed, records completed_at timestamp; otherwise clears it if moved back.
    Logs the transition to task_history.
    """
    existing = get_action_item(task_id, db_path=db_path)
    if not existing:
        return None

    old_status = existing.get("task_status", "pending")
    now_iso = datetime.now(timezone.utc).isoformat()

    fields_to_update: Dict[str, Any] = {
        "task_status": new_status,
    }
    if new_status == "completed":
        fields_to_update["completed_at"] = now_iso
    elif old_status == "completed" and new_status != "completed":
        fields_to_update["completed_at"] = None

    updated = update_action_item(task_id, fields_to_update, db_path=db_path)
    if updated:
        detail_msg = f"Progress updated to '{new_status}'" + (f": {note}" if note else "")
        log_task_history(
            task_id=task_id,
            event_type="status_changed",
            old_value=old_status,
            new_value=new_status,
            details=detail_msg,
            db_path=db_path,
        )
    return updated



