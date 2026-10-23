import re
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple

from app.config import DATABASE_PATH
from app.database import (
    list_action_items,
    get_action_item,
    update_action_item_progress,
    list_all_history,
    get_task_history,
)
from app.models import (
    ActionItem,
    TaskStatus,
    TaskHistoryEntry,
    TrackingDashboardResponse,
)


MONTH_NAMES = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}

WEEKDAYS = {
    "monday": 0, "mon": 0,
    "tuesday": 1, "tue": 1, "tues": 1,
    "wednesday": 2, "wed": 2,
    "thursday": 3, "thu": 3, "thur": 3, "thurs": 3,
    "friday": 4, "fri": 4,
    "saturday": 5, "sat": 5,
    "sunday": 6, "sun": 6,
}


def parse_due_date(due_date_str: Optional[str], ref_datetime: Optional[datetime] = None) -> Optional[datetime]:
    """
    Deterministically parse raw deadline string into an aware UTC datetime.
    Supports ISO formats, Month-Day strings (e.g., 'October 27'), and natural weekdays.
    """
    if not due_date_str or not due_date_str.strip():
        return None

    s = due_date_str.strip().lower()
    ref = ref_datetime or datetime.now(timezone.utc)
    current_year = ref.year

    # 1. ISO format: 2026-10-27 or 2026-10-27T17:00:00
    iso_match = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if iso_match:
        try:
            y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
            return datetime(y, m, d, 23, 59, 59, tzinfo=timezone.utc)
        except ValueError:
            pass

    # 2. Month name and day: e.g. "October 27", "Oct 27, 2026", "October 27th"
    month_pattern = r"(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?"
    m_match = re.search(month_pattern, s)
    if m_match:
        try:
            m_str = m_match.group(1)
            day = int(m_match.group(2))
            year = int(m_match.group(3)) if m_match.group(3) else current_year
            month = MONTH_NAMES[m_str]
            return datetime(year, month, day, 23, 59, 59, tzinfo=timezone.utc)
        except (ValueError, KeyError):
            pass

    # 3. Day followed by Month: e.g. "27th October", "27 Oct 2026"
    day_month_pattern = r"(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\.?\s*(?:,?\s*(\d{4}))?"
    dm_match = re.search(day_month_pattern, s)
    if dm_match:
        try:
            day = int(dm_match.group(1))
            m_str = dm_match.group(2)
            year = int(dm_match.group(3)) if dm_match.group(3) else current_year
            month = MONTH_NAMES[m_str]
            return datetime(year, month, day, 23, 59, 59, tzinfo=timezone.utc)
        except (ValueError, KeyError):
            pass

    # 4. Relative words: "today", "tomorrow"
    if "today" in s:
        return datetime(ref.year, ref.month, ref.day, 23, 59, 59, tzinfo=timezone.utc)
    if "tomorrow" in s:
        tom = ref + timedelta(days=1)
        return datetime(tom.year, tom.month, tom.day, 23, 59, 59, tzinfo=timezone.utc)

    # 5. Day of week: e.g. "Friday", "this Friday", "by Friday 5pm"
    for wname, wday in WEEKDAYS.items():
        if re.search(r"\b" + wname + r"\b", s):
            days_ahead = (wday - ref.weekday()) % 7
            target = ref + timedelta(days=days_ahead)
            return datetime(target.year, target.month, target.day, 23, 59, 59, tzinfo=timezone.utc)

    return None


def evaluate_task_schedule(
    item: Dict[str, Any],
    ref_datetime: Optional[datetime] = None
) -> Tuple[bool, str, Optional[int]]:
    """
    Evaluate whether a task is overdue, due soon, on track, or completed.
    Returns: (is_overdue: bool, schedule_status: str, days_delta: Optional[int])
    """
    status = item.get("task_status", "pending")
    if status == "completed":
        return False, "completed", None

    due_str = item.get("due_date")
    if not due_str or not due_str.strip():
        return False, "unspecified", None

    ref = ref_datetime or datetime.now(timezone.utc)
    parsed_date = parse_due_date(due_str, ref_datetime=ref)

    if not parsed_date:
        return False, "unspecified", None

    # Compare end of target date vs reference
    delta = parsed_date - ref
    total_hours = delta.total_seconds() / 3600.0

    if total_hours < 0:
        days_overdue = int(abs(total_hours) // 24) + 1
        return True, "overdue", days_overdue
    elif total_hours <= 48:
        return False, "due_soon", int(total_hours // 24)
    else:
        return False, "on_track", int(total_hours // 24)


def enrich_action_item_schedule(
    item: Dict[str, Any],
    ref_datetime: Optional[datetime] = None
) -> Dict[str, Any]:
    """Enrich an action item dictionary with computed schedule fields."""
    item_copy = dict(item)
    is_overdue, sched_status, _ = evaluate_task_schedule(item, ref_datetime=ref_datetime)
    item_copy["is_overdue"] = is_overdue
    item_copy["schedule_status"] = sched_status
    return item_copy


def get_tracking_dashboard_service(
    db_path: Optional[str] = None,
    ref_datetime: Optional[datetime] = None
) -> TrackingDashboardResponse:
    """
    Calculate comprehensive workspace accountability and tracking metrics.
    Includes completion rates, overdue tasks, unassigned tasks, and recent audit history.
    """
    path = db_path or DATABASE_PATH
    ref = ref_datetime or datetime.now(timezone.utc)

    items = list_action_items(db_path=path)
    commitments = [i for i in items if i.get("category") == "commitment"]

    completed_count = 0
    in_progress_count = 0
    pending_count = 0
    overdue_items: List[Dict[str, Any]] = []
    unassigned_items: List[Dict[str, Any]] = []
    due_soon_count = 0

    for item in items:
        # Progress status counts
        t_status = item.get("task_status", "pending")
        if t_status == "completed":
            completed_count += 1
        elif t_status == "in_progress":
            in_progress_count += 1
        else:
            pending_count += 1

        # Schedule evaluation
        is_overdue, sched_status, days_delta = evaluate_task_schedule(item, ref_datetime=ref)
        if is_overdue:
            overdue_items.append({
                "task_id": item["task_id"],
                "meeting_id": item["meeting_id"],
                "title": item["title"],
                "owner": item.get("owner") or "Unassigned",
                "due_date": item.get("due_date"),
                "days_overdue": days_delta or 1,
                "approval_status": item.get("approval_status", "pending"),
                "task_status": t_status,
            })
        elif sched_status == "due_soon":
            due_soon_count += 1

        # Unassigned owner check (for commitments)
        if item.get("category") == "commitment":
            owner = item.get("owner")
            if not owner or not owner.strip() or owner.lower() in ("unassigned", "tbd", "unknown"):
                unassigned_items.append({
                    "task_id": item["task_id"],
                    "meeting_id": item["meeting_id"],
                    "title": item["title"],
                    "category": item["category"],
                    "due_date": item.get("due_date"),
                    "approval_status": item.get("approval_status", "pending"),
                    "task_status": t_status,
                })

    # Completion rate based on commitments
    total_comms = len(commitments)
    if total_comms > 0:
        comms_completed = sum(1 for c in commitments if c.get("task_status") == "completed")
        completion_rate = round((comms_completed / total_comms) * 100.0, 1)
    else:
        completion_rate = 0.0

    raw_history = list_all_history(limit=50, db_path=path)
    recent_history = [TaskHistoryEntry(**h) for h in raw_history]

    return TrackingDashboardResponse(
        total_items=len(items),
        total_commitments=total_comms,
        completed_count=completed_count,
        in_progress_count=in_progress_count,
        pending_count=pending_count,
        overdue_count=len(overdue_items),
        due_soon_count=due_soon_count,
        unassigned_owner_count=len(unassigned_items),
        completion_rate_percent=completion_rate,
        overdue_items=overdue_items,
        unassigned_items=unassigned_items,
        recent_history=recent_history,
    )
