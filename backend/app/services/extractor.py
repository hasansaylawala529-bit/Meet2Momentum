import json
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Tuple
from google import genai
from google.genai import types

from app.config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    get_gemini_api_key,
    get_gemini_model,
)
from app.models import (
    ActionItem,
    ActionItemCategory,
    ApprovalStatus,
    Decision,
    ExecutionStatus,
    ExtractionResponse,
    MeetingExtractionRaw,
    TaskStatus,
)
from app.database import save_extraction_results
from app.services.detector import detect_duplicates_and_conflicts


def _normalize_whitespace(text: str) -> str:
    """Collapse contiguous whitespace and newlines for robust evidence matching."""
    return re.sub(r"\s+", " ", text).strip().lower()


def verify_transcript_evidence(excerpt: str, transcript: str) -> bool:
    """
    Verify whether the quoted evidence excerpt appears in the original transcript.
    Uses exact substring matching first, then normalized whitespace matching.
    Does not modify or rewrite the excerpt.
    """
    if not excerpt or not transcript:
        return False

    raw_excerpt = excerpt.strip()
    # 1. Exact raw substring check
    if raw_excerpt in transcript:
        return True

    # 2. Case-insensitive exact check
    if raw_excerpt.lower() in transcript.lower():
        return True

    # 3. Normalized whitespace check
    norm_excerpt = _normalize_whitespace(excerpt)
    norm_transcript = _normalize_whitespace(transcript)
    if norm_excerpt in norm_transcript:
        return True

    return False


def get_gemini_client() -> genai.Client:
    """Initialize Google GenAI client with configured environment API key."""
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError(
            "Gemini API key is not configured. "
            "Please set GEMINI_API_KEY in your backend/.env file to enable AI meeting extraction."
        )
    return genai.Client(api_key=api_key)


SYSTEM_INSTRUCTION = """
You are Meet2Momentum's AI Meeting Intelligence Engine.
Your job is to analyze meeting transcripts and extract structured outcomes with strict ground-truth fidelity.

CRITICAL OPERATING PRINCIPLES:
1. AI proposes. Humans approve. The system enforces.
2. EVIDENCE IS MANDATORY: Every extracted decision and action item MUST include an exact verbatim excerpt (`source_text`) copied from the transcript.
3. NEVER INVENT INFORMATION:
   - If an owner is not explicitly stated in the conversation, set `owner` to null.
   - If a deadline is not explicitly mentioned, set `due_date` to null.
   - If rationale is not provided, set `rationale` to null.
   - Do NOT fabricate dates, people, or agreements.

4. STRICT COMMITMENT CLASSIFICATION:
   - `commitment`: ONLY for explicit agreements, undertakings, or accepted responsibilities (e.g. "I will finish X by Friday", "We agreed to launch Y").
   - `suggestion`: Exploratory thoughts, ideas, or proposals that were not formally agreed to (e.g. "We could consider adding dark mode", "Perhaps we should test with users").
   - `unresolved_question`: Open matters, missing decisions, dependencies, or unassigned roles (e.g. "Who will test the app?", "We still need to decide on the database").

5. CLARIFICATION FLAGS:
   - Set `clarification_required` to true if an item lacks an owner, has an ambiguous timeframe, or represents an open dependency.
   - State what needs clarification in `clarification_note`.
"""


def extract_meeting_outcomes(
    meeting_id: str,
    title: str,
    transcript: str,
    meeting_date: str = None,
    db_path: str = None
) -> ExtractionResponse:
    """
    Extract decisions and action items from a meeting transcript using Google Gemini.
    Validates evidence, enforces classification rules, and safely persists outcomes.
    """
    if not transcript or not transcript.strip():
        raise ValueError("Cannot process an empty meeting transcript.")

    client = get_gemini_client()

    prompt = f"""
Meeting Title: {title}
Meeting Date: {meeting_date or 'Not specified'}

Full Meeting Transcript:
---
{transcript}
---

Extract all confirmed decisions and action items (commitments, suggestions, unresolved questions).
Ensure every item includes exact verbatim source_text from the transcript.
"""

    primary_model = get_gemini_model()
    # Ordered fallback cascade to protect against model deprecations (404), high demand (503), or timeouts (504)
    models_to_try = [primary_model]
    for fallback in ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash"]:
        if fallback not in models_to_try:
            models_to_try.append(fallback)

    response = None
    last_error = None

    for m in models_to_try:
        try:
            response = client.models.generate_content(
                model=m,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=MeetingExtractionRaw,
                    temperature=0.1,
                    system_instruction=SYSTEM_INSTRUCTION,
                ),
            )
            if response and response.text:
                break
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            # If it's an authentication error, fail immediately without trying fallbacks
            if "api_key" in err_str or "unauthenticated" in err_str or "forbidden" in err_str or "permission" in err_str:
                raise RuntimeError("Gemini AI API authentication error. Please verify your API key in backend/.env.")
            # Continue to next model on 404 (model not available), 503 (high demand), or 504 (deadline exceeded)
            continue

    if not response or not response.text:
        error_msg = str(last_error) if last_error else "No response returned from Gemini models."
        if "API_KEY" in error_msg or "key" in error_msg.lower():
            raise RuntimeError("Gemini AI API authentication or configuration error. Please verify your API key.")
        raise RuntimeError(f"Gemini AI extraction service error: {error_msg}")

    # Parse JSON output
    try:
        raw_text = response.text
        parsed_data = json.loads(raw_text)
        validated_raw = MeetingExtractionRaw(**parsed_data)
    except Exception as e:
        raise ValueError(f"Failed to parse structured model extraction response: {str(e)}")

    extracted_at = datetime.now(timezone.utc).isoformat()
    processed_decisions: List[Dict[str, Any]] = []
    processed_actions: List[Dict[str, Any]] = []

    # Process & verify decisions
    for d_raw in validated_raw.decisions:
        dec_id = f"dec_{uuid.uuid4().hex[:10]}"
        evidence_ok = verify_transcript_evidence(d_raw.source_text, transcript)
        
        decision_dict = {
            "decision_id": dec_id,
            "meeting_id": meeting_id,
            "title": d_raw.title.strip(),
            "description": d_raw.rationale,
            "rationale": d_raw.rationale,
            "source_text": d_raw.source_text,
            "evidence_verified": evidence_ok,
            "created_at": extracted_at,
        }
        processed_decisions.append(decision_dict)

    # Process & verify action items
    commitments_count = 0
    suggestions_count = 0
    unresolved_count = 0

    for a_raw in validated_raw.action_items:
        task_id = f"task_{uuid.uuid4().hex[:10]}"
        evidence_ok = verify_transcript_evidence(a_raw.source_text, transcript)

        category = a_raw.category
        if category == ActionItemCategory.COMMITMENT:
            commitments_count += 1
        elif category == ActionItemCategory.SUGGESTION:
            suggestions_count += 1
        elif category == ActionItemCategory.UNRESOLVED_QUESTION:
            unresolved_count += 1

        clarification_req = a_raw.clarification_required
        clarification_note = a_raw.clarification_note

        # Automatically require clarification if owner is missing on a commitment
        if category == ActionItemCategory.COMMITMENT and not a_raw.owner:
            clarification_req = True
            clarification_note = (clarification_note or "") + " Owner missing for confirmed commitment."

        if not evidence_ok:
            clarification_req = True
            clarification_note = (clarification_note or "") + " Evidence excerpt could not be directly verified against transcript."

        action_dict = {
            "task_id": task_id,
            "meeting_id": meeting_id,
            "title": a_raw.title.strip(),
            "description": a_raw.description,
            "category": category.value,
            "commitment_status": category.value,
            "owner": a_raw.owner.strip() if a_raw.owner else None,
            "due_date": a_raw.due_date.strip() if a_raw.due_date else None,
            "source_text": a_raw.source_text,
            "clarification_required": clarification_req,
            "clarification_note": clarification_note.strip() if clarification_note else None,
            "duplicate_of": None,
            "duplicate_note": None,
            "conflict_flag": False,
            "conflict_note": None,
            "evidence_verified": evidence_ok,
            "approval_status": ApprovalStatus.PENDING.value,
            "execution_status": ExecutionStatus.NOT_EXPORTED.value,
            "task_status": TaskStatus.PENDING.value,
            "created_at": extracted_at,
        }
        processed_actions.append(action_dict)

    # Detect duplicate candidates and potential conflicts deterministically
    processed_actions = detect_duplicates_and_conflicts(
        processed_actions,
        meeting_id=meeting_id,
        db_path=db_path
    )

    # Persist extraction results transactionally to SQLite
    save_extraction_results(
        meeting_id=meeting_id,
        decisions=processed_decisions,
        action_items=processed_actions,
        db_path=db_path
    )

    # Build Pydantic response objects
    decisions_models = [Decision(**d) for d in processed_decisions]
    actions_models = [ActionItem(**a) for a in processed_actions]

    return ExtractionResponse(
        meeting_id=meeting_id,
        decisions=decisions_models,
        action_items=actions_models,
        total_decisions=len(decisions_models),
        total_action_items=len(actions_models),
        commitments_count=commitments_count,
        suggestions_count=suggestions_count,
        unresolved_questions_count=unresolved_count,
        extracted_at=extracted_at,
    )
