import re
from difflib import SequenceMatcher
from typing import Dict, Any, List, Optional, Tuple

from app.config import DATABASE_PATH
from app.database import list_action_items

# Configurable similarity threshold for candidate identification
DEFAULT_SIMILARITY_THRESHOLD = 0.85

# Generic action item titles that should not be automatically flagged
GENERIC_TITLES = {
    "follow up",
    "follow-up",
    "followup",
    "next steps",
    "discuss next steps",
    "sync up",
    "check in",
    "review notes",
    "action item",
    "action items",
    "status update",
    "meeting follow up",
    "discuss",
    "recap",
    "general follow up",
}


def normalize_title(title: Optional[str]) -> str:
    """
    Deterministically normalize a task title for comparison:
    1. Case folding (lowercase)
    2. Replace punctuation and non-alphanumerics with single spaces
    3. Collapse multiple whitespaces and strip
    """
    if not title:
        return ""
    s = title.strip().lower()
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def is_generic_title(normalized: str) -> bool:
    """Check if normalized title is in the generic titles exclusion list."""
    return normalized in GENERIC_TITLES or len(normalized) <= 3


def calculate_title_similarity(norm1: str, norm2: str) -> float:
    """
    Calculate deterministic string similarity using difflib SequenceMatcher.
    Combines direct character ratio and token-sorted ratio to handle reordered words.
    """
    if not norm1 or not norm2:
        return 0.0

    if norm1 == norm2:
        return 1.0

    # Direct SequenceMatcher ratio
    direct_ratio = SequenceMatcher(None, norm1, norm2).ratio()

    # Token sort ratio to catch word order differences (e.g. "deploy auth service" vs "auth service deploy")
    tokens1 = " ".join(sorted(norm1.split()))
    tokens2 = " ".join(sorted(norm2.split()))
    token_ratio = SequenceMatcher(None, tokens1, tokens2).ratio()

    return round(max(direct_ratio, token_ratio), 4)


def _normalize_attribute(val: Optional[str]) -> Optional[str]:
    """Helper to normalize owner or deadline strings for comparison."""
    if not val or not val.strip():
        return None
    s = val.strip().lower()
    return re.sub(r"\s+", " ", s)


def evaluate_pair_relationship(
    item: Dict[str, Any],
    other: Dict[str, Any],
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD
) -> Tuple[bool, bool, Optional[str], float]:
    """
    Evaluate whether two action items represent a duplicate candidate or conflict candidate.
    Returns: (is_duplicate: bool, is_conflict: bool, conflict_reason: Optional[str], similarity: float)
    """
    title1 = item.get("title", "")
    title2 = other.get("title", "")

    norm1 = normalize_title(title1)
    norm2 = normalize_title(title2)

    # Exclude empty titles or generic titles
    if not norm1 or not norm2 or is_generic_title(norm1) or is_generic_title(norm2):
        return False, False, None, 0.0

    similarity = calculate_title_similarity(norm1, norm2)
    if similarity < threshold:
        return False, False, None, similarity

    # Items have high semantic/text similarity (>= threshold)
    owner1 = _normalize_attribute(item.get("owner"))
    owner2 = _normalize_attribute(other.get("owner"))

    due1 = _normalize_attribute(item.get("due_date"))
    due2 = _normalize_attribute(other.get("due_date"))

    has_owner_conflict = (owner1 is not None and owner2 is not None and owner1 != owner2)
    has_deadline_conflict = (due1 is not None and due2 is not None and due1 != due2)

    # Check conflict first: differing owners or differing deadlines on strongly similar commitments
    if has_owner_conflict or has_deadline_conflict:
        reasons = []
        if has_owner_conflict:
            reasons.append(
                f"Assigned owner conflict: '{item.get('owner')}' vs '{other.get('owner')}'"
            )
        if has_deadline_conflict:
            reasons.append(
                f"Deadline conflict: '{item.get('due_date')}' vs '{other.get('due_date')}'"
            )
        
        conflict_msg = (
            f"Conflict with '{other.get('title')}' (#{other.get('task_id')}): "
            + "; ".join(reasons)
        )
        return False, True, conflict_msg, similarity

    # If no conflict exists, this is a potential duplicate candidate
    return True, False, None, similarity


def detect_duplicates_and_conflicts(
    items: List[Dict[str, Any]],
    meeting_id: Optional[str] = None,
    db_path: Optional[str] = None,
    threshold: float = DEFAULT_SIMILARITY_THRESHOLD
) -> List[Dict[str, Any]]:
    """
    Detect duplicate candidates and potential conflicts across action items.
    Compares:
    1. Within the current batch (same meeting) first.
    2. Against recent action items from prior meetings in the database.

    Populates:
    - `duplicate_of`: Candidate task_id if single clear match; None if ambiguous or no match.
    - `duplicate_note`: Explanation of similarity and candidate title, or ambiguity warning.
    - `conflict_flag`: True if deadline or owner conflict detected.
    - `conflict_note`: Explanation of conflicting attributes.

    Never automatically merges, deletes, approves, rejects, or alters task fields.
    """
    # Fetch existing action items from database for comparison
    try:
        existing_items = list_action_items(db_path=db_path)
    except Exception:
        existing_items = []

    input_ids = {i.get("task_id") for i in items if i.get("task_id")}
    db_items = [
        it for it in existing_items
        if it.get("task_id") not in input_ids
    ]

    # Combined candidate pool for comparison (same batch items + persisted DB items)
    enriched_items = []

    for idx, item in enumerate(items):
        item_copy = dict(item)
        task_id = item_copy.get("task_id")

        duplicate_candidates: List[Tuple[Dict[str, Any], float]] = []
        conflict_notes: List[str] = []

        # 1. Compare with all other items in the current meeting batch
        for other_idx, other in enumerate(items):
            if idx == other_idx or other.get("task_id") == task_id:
                continue
            is_dup, is_conf, conf_reason, sim = evaluate_pair_relationship(item_copy, other, threshold=threshold)
            if is_conf and conf_reason:
                conflict_notes.append(conf_reason)
            elif is_dup:
                duplicate_candidates.append((other, sim))

        # 2. Compare with items already saved in the database (same-meeting or cross-meeting)
        for other in db_items:
            if other.get("task_id") == task_id:
                continue
            is_dup, is_conf, conf_reason, sim = evaluate_pair_relationship(item_copy, other, threshold=threshold)
            is_cross = other.get("meeting_id") != meeting_id
            if is_conf and conf_reason:
                prefix = "[Cross-Meeting] " if is_cross else ""
                conflict_notes.append(f"{prefix}{conf_reason}")
            elif is_dup:
                duplicate_candidates.append((other, sim))

        # --- Resolve Conflicts ---
        if conflict_notes:
            item_copy["conflict_flag"] = True
            item_copy["conflict_note"] = " | ".join(conflict_notes[:2])  # Cap at top 2 for display clarity
        else:
            item_copy["conflict_flag"] = False
            item_copy["conflict_note"] = None

        # --- Resolve Duplicates & Handle Ambiguity ---
        if duplicate_candidates:
            # Sort by similarity descending
            duplicate_candidates.sort(key=lambda x: x[1], reverse=True)

            # Check for ambiguity: multiple candidates with close similarity
            if len(duplicate_candidates) > 1 and (duplicate_candidates[0][1] - duplicate_candidates[1][1] < 0.05):
                # Ambiguous match: surface ambiguity without choosing arbitrarily
                cand1, sim1 = duplicate_candidates[0]
                cand2, sim2 = duplicate_candidates[1]
                item_copy["duplicate_of"] = None
                item_copy["duplicate_note"] = (
                    f"Ambiguous candidate: closely resembles both '{cand1.get('title')}' ({int(sim1*100)}%) "
                    f"and '{cand2.get('title')}' ({int(sim2*100)}%). Reviewer confirmation required."
                )
            else:
                # Clear single candidate
                best_cand, best_sim = duplicate_candidates[0]
                item_copy["duplicate_of"] = best_cand.get("task_id")
                item_copy["duplicate_note"] = (
                    f"Potential duplicate of '{best_cand.get('title')}' (#{best_cand.get('task_id')}) "
                    f"— {int(best_sim * 100)}% title similarity."
                )
        else:
            item_copy["duplicate_of"] = None
            item_copy["duplicate_note"] = None

        enriched_items.append(item_copy)

    return enriched_items
