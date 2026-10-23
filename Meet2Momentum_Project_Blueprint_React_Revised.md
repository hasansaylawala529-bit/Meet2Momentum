# Meet2Momentum

## HACKNOVA'26 --- Problem Statement 4

### Meeting-to-Execution Automation Agent

> **Project vision:** Convert meeting conversations into
> evidence-grounded, human-approved, trackable execution.
>
> **Core principle:** AI proposes. Humans approve. The system enforces.

**Project status:** Planning and architecture\
**Proposed stack:** React, Vite, Python, FastAPI, Google Gemini API,
Pydantic, Pandas, SQLite, CSV/JSON\
**Optional integration:** GitHub Issues or Trello, subject to available
time and API access

------------------------------------------------------------------------

## 1. Executive Summary

Meet2Momentum is an AI-powered meeting-to-execution agent designed to
convert meeting transcripts or notes into structured decisions, action
items, owners, deadlines, and follow-ups. It distinguishes confirmed
commitments from suggestions and unresolved questions, flags possible
duplicate or conflicting tasks, and requires human review before
execution.

The system aims to reduce manual task entry, prevent ambiguous or
unapproved items from silently entering execution, and improve
accountability through task tracking and an audit trail.

The project is designed around **evidence-grounded extraction, a
human-in-the-loop approval workflow, and deterministic execution
controls** rather than relying on AI output alone.

## 2. Problem Statement

Meetings often produce important decisions, commitments, and follow-up
actions, but these outcomes can remain buried in transcripts, notes, or
chat messages. Tasks may have unclear owners or deadlines, suggestions
may be mistaken for commitments, duplicate or conflicting tasks may be
created, and follow-ups may be forgotten.

Meet2Momentum addresses the gap between meeting discussion and actual
execution by extracting structured outcomes, validating them, requesting
clarification where necessary, routing them through an approval
workflow, and tracking approved work.

## 3. Objectives

-   Accept meeting transcripts or notes.
-   Extract decisions, action items, follow-ups, owners, deadlines, and
    unresolved questions.
-   Distinguish confirmed commitments from suggestions and unresolved
    items.
-   Preserve evidence linking each extracted outcome to the original
    transcript.
-   Identify potential duplicate and conflicting tasks.
-   Ask for clarification when ownership, dates, or other important
    details are ambiguous.
-   Allow users to review, edit, approve, or reject proposed tasks.
-   Prevent unapproved or rejected tasks from being exported or
    executed.
-   Export approved tasks in structured CSV/JSON format or integrate
    with a project board.
-   Track completion, overdue work, unassigned actions, and pending
    follow-ups.
-   Evaluate extraction and control quality against labelled test
    transcripts.

## 4. Target Users

-   Project managers and team leaders
-   Software development teams
-   Meeting coordinators
-   Student project teams
-   Corporate and business teams
-   Administrative teams managing follow-up activities

## 5. Proposed Product Identity

**Name:** Meet2Momentum\
**Tagline:** From spoken commitments to verified, approved, trackable
execution.

The name is a proposed product identity for this project, not an
official name from the problem statement.

## 6. System Architecture

### 6.1 High-level architecture

``` text
Meeting Transcript / Notes
            |
            v
React + Vite Input Interface
(Upload transcript/notes file or paste notes)
            |
            v
Preprocessing and Normalisation
(Validate input, preserve original text, assign meeting ID)
            |
            v
AI Extraction Engine
(Google Gemini API + structured output)
            |
            v
Structured Outcome Records
(Decisions, actions, follow-ups, unresolved questions)
            |
            v
Validation and Detection Layer
(Pydantic checks, evidence checks, missing fields,
duplicate candidates, conflict candidates)
            |
            v
Human Review and Approval Gate
(Edit / Clarify / Approve / Reject)
            |
            v
Execution Permission Check
(Only eligible approved items can proceed)
            |
            v
Persistence and Export
(SQLite + approved CSV/JSON export)
            |
            +--------------------+
            |                    |
            v                    v
Project Board             Execution Dashboard
(Optional GitHub Issues    (Status, overdue, unassigned,
or Trello integration)     follow-ups, history)
```

### 6.2 Architecture layers

  -----------------------------------------------------------------------
  Layer                   Proposed technology     Responsibility
  ----------------------- ----------------------- -----------------------
  User interface          React + Vite            Transcript input,
                                                  review screen,
                                                  dashboard

  Backend API             Python + FastAPI         Connect frontend to
                                                  extraction, validation,
                                                  approval, and tracking

  AI extraction           Google Gemini API       Interpret
                                                  natural-language
                                                  meeting outcomes

  Structured output       Pydantic                Define and validate
                                                  extraction schema

  Validation              Python                  Check fields, evidence,
                                                  approval state, and
                                                  required information

  Duplicate detection     Python text             Flag exact and likely
                          normalisation and       duplicate candidates
                          similarity              

  Conflict detection      Python rules and        Flag inconsistent or
                          optional semantic       incompatible task
                          comparison              details

  Persistence             SQLite                  Store meetings, tasks,
                                                  review decisions, and
                                                  execution records

  Data handling           Pandas                  Tables, filtering,
                                                  summaries, and exports

  Execution               CSV/JSON; optional      Transfer approved tasks
                          board API               

  Version control         Git and private GitHub  Track source changes
                          repository              and collaborate
  -----------------------------------------------------------------------

### 6.3 Design principle

Gemini interprets meeting language. Deterministic Python code validates
fields and enforces approval. The AI should not be the sole authority
deciding whether a task is permitted to execute.

## 7. End-to-End User Workflow

1.  **Provide meeting input:** Upload a transcript or notes file, or paste
    meeting notes.
2.  **Extract outcomes:** The AI generates structured items with titles,
    descriptions, categories, owners, deadlines, commitment status, and
    supporting text.
3.  **Validate evidence:** The system checks whether cited source text
    appears in the original transcript and flags mismatches.
4.  **Detect issues:** Missing fields, possible duplicates, and
    conflicts are flagged for review.
5.  **Clarify ambiguity:** The user resolves missing ownership, unclear
    deadlines, or other required information.
6.  **Review and edit:** The reviewer corrects the task details and
    decides whether candidate duplicates should be merged or retained.
7.  **Approve or reject:** The reviewer makes the decision. Unapproved
    or rejected items cannot execute.
8.  **Transfer approved tasks:** Export approved tasks to CSV/JSON or
    create them in an optional project board.
9.  **Track execution:** Monitor task status, overdue tasks, unassigned
    actions, and pending follow-ups.
10. **Audit changes:** Retain the relevant history of edits, approvals,
    rejections, and export attempts.

## 8. Core Features

### 8.1 Meeting input

-   Plain-text transcript upload
-   Paste meeting notes directly
-   Input validation and transcript preservation

### 8.2 Decision and task extraction

-   Decisions
-   Action items
-   Follow-ups
-   Unresolved questions
-   Owners and due dates when supported by the transcript
-   Exact supporting source sentence or passage

### 8.3 Commitment classification

Suggested categories:

-   `confirmed`: wording supports an explicit commitment or confirmed
    outcome
-   `suggestion`: exploratory or proposed action that has not been
    committed to
-   `unresolved`: the matter remains open or is not decided

The item category should be stored separately from commitment status.
For example, an item may be an `action` and have commitment status
`confirmed`.

### 8.4 Evidence validation

-   Retain the original transcript.
-   Store source text for every extracted item.
-   Check whether source text matches the transcript.
-   Flag unsupported or mismatched evidence for manual review.
-   Do not invent missing owners, deadlines, or decisions.

### 8.5 Duplicate detection

-   Normalise text and compare exact matches first.
-   Use text similarity to identify likely duplicates.
-   Optionally add semantic comparison if time permits.
-   Display the candidate pair and the reason for the match.
-   Do not silently delete or merge candidate tasks.

### 8.6 Conflict detection

Potential conflict examples include: - The same task assigned to
different owners - Incompatible due dates for what appears to be the
same task - Contradictory descriptions or commitments

Conflict detection should flag candidates for human review. Similar
wording does not always mean that two tasks conflict.

### 8.7 Human approval workflow

-   Edit proposed tasks
-   Resolve clarification questions
-   Approve or reject items
-   Preserve review decisions
-   Block execution for unapproved, rejected, or otherwise ineligible
    tasks

### 8.8 Task export and integration

Minimum viable implementation: - CSV export of approved tasks - JSON
export of approved tasks

Optional extension: - Create issues on GitHub or cards on Trello - Store
external task IDs and transfer status - Confirm successful transfer
before marking an item as exported

### 8.9 Task tracking dashboard

-   Total extracted items
-   Confirmed commitments, suggestions, and unresolved items
-   Items awaiting clarification or approval
-   Unassigned actions
-   Overdue tasks
-   In-progress and completed tasks
-   Pending follow-ups
-   Execution and review history

## 9. Commitment Firewall

The **Commitment Firewall** is the proposed name for the deterministic
policy gate between AI-generated proposals and execution.

### Rules

1.  Extraction does not imply approval.
2.  A suggestion is not automatically a confirmed task.
3.  Missing or ambiguous mandatory information must be resolved before
    execution when it affects assignment or scheduling.
4.  Rejected items cannot be executed.
5.  Unapproved items cannot be exported or sent to a project board.
6.  The backend must check the persisted approval state at execution
    time.
7.  Export and integration status must reflect confirmed outcomes;
    failed transfers must not be marked successful.

This is a central safety and trust feature of the project.

## 10. Data Model

The initial implementation can use a small SQLite database with separate
records for meetings, tasks, review decisions, detection results,
execution records, and history.

### 10.1 Meeting

  Field          Purpose
  -------------- ---------------------------
  `meeting_id`   Unique meeting identifier
  `title`        Meeting title
  `transcript`   Original input text
  `created_at`   Creation timestamp

### 10.2 Task

  Field                      Purpose
  -------------------------- --------------------------------------------------
  `task_id`                  Unique task identifier
  `meeting_id`               Link to source meeting
  `title`                    Short task or outcome title
  `description`              Supporting detail
  `category`                 Decision, action, follow-up, unresolved question
  `commitment_status`        Confirmed, suggestion, unresolved
  `owner`                    Explicitly identified owner or null
  `due_date`                 Supported deadline or null
  `source_text`              Supporting transcript passage
  `clarification_required`   Whether user clarification is required
  `duplicate_of`             Optional link to a possible duplicate
  `conflict_flag`            Whether a conflict candidate was detected
  `approval_status`          Pending, approved, rejected
  `execution_status`         Not exported, exported, failed, or integrated
  `task_status`              Pending, in progress, completed
  `created_at`               Creation timestamp

### 10.3 Additional tables

-   **Review:** task ID, reviewer, decision, note, timestamp
-   **Detection:** task ID, matched task ID, detection type, reason,
    confidence
-   **Execution:** task ID, export or integration result, external task
    ID, timestamp
-   **Task history:** task ID, event type, old value, new value,
    timestamp

### 10.4 State design

Approval status, execution status, and task progress must remain
separate.

For example: - An approved task may not yet be exported. - An exported
task may still be pending. - A completed task should not be reported as
overdue merely because its due date has passed.

## 11. Suggested Repository Structure

``` text
meeting-to-execution-agent/
├── frontend/                  # React + Vite application
├── backend/                   # Python + FastAPI application
│   ├── main.py
│   ├── extractor.py
│   ├── validator.py
│   ├── duplicate_detector.py
│   ├── conflict_detector.py
│   ├── approval.py
│   ├── database.py
│   ├── exporter.py
│   └── tracker.py
├── requirements.txt
├── .env
├── .env.example
├── .gitignore
├── README.md
├── sample_meeting.txt
├── tests/
│   ├── test_extraction_schema.py
│   ├── test_approval_gate.py
│   ├── test_duplicates.py
│   └── test_export.py
└── data/
    └── .gitkeep
```

This is a target structure. Start with the smallest working set of files
and add modules as each component is implemented.

## 12. Implementation Plan

### Phase 1 --- Foundation

-   Set up the React + Vite frontend.
-   Set up the Python + FastAPI backend.
-   Configure the frontend-to-backend connection.
-   Build the initial application shell and meeting-input interface.
-   Verify the frontend and backend launch.

**Deliverable:** Working React + FastAPI application skeleton.

### Phase 2 --- AI extraction

-   Define a structured Pydantic schema.
-   Implement Gemini extraction.
-   Preserve source evidence.
-   Extract categories, commitment status, owners, and deadlines.
-   Display results in the React interface.

**Deliverable:** Transcript-to-structured-outcomes workflow.

### Phase 3 --- Validation and detection

-   Validate required fields and output types.
-   Check source text against the original transcript.
-   Detect exact duplicate candidates.
-   Add similarity-based duplicate candidates.
-   Add basic conflict checks.
-   Build a clarification queue.

**Deliverable:** Reviewable extraction with quality flags.

### Phase 4 --- Approval gate

-   Implement edit, clarify, approve, and reject actions.
-   Store approval decisions.
-   Enforce eligibility in backend code.
-   Test that unapproved and rejected tasks cannot execute.

**Deliverable:** Approval-controlled execution.

### Phase 5 --- Persistence, export, and tracking

-   Store meetings and tasks in SQLite.
-   Export only approved and eligible tasks.
-   Track transfer success or failure.
-   Calculate overdue and unassigned actions.
-   Track progress and pending follow-ups.

**Deliverable:** Complete local workflow with persistence and structured
export.

### Phase 6 --- Testing, polish, and presentation

-   Test normal and edge-case transcripts.
-   Verify approval-gate behavior.
-   Polish the dashboard.
-   Prepare a repeatable demo.
-   Write setup instructions and known limitations.
-   Measure performance on labelled test cases.

**Deliverable:** Demonstrable prototype and technical explanation.

## 13. Feature Priorities

### Tier 1 --- Must have

-   Transcript input
-   Structured extraction and classification
-   Owner/date handling
-   Evidence display and validation
-   Duplicate/conflict flags
-   Clarification workflow
-   Edit, approve, reject
-   Approval-gated CSV/JSON export
-   Basic task tracking
-   End-to-end demonstration

### Tier 2 --- Differentiators

-   Explainable duplicate and conflict candidates
-   Audit trail
-   Decision-to-execution traceability
-   Clarification dashboard
-   Evaluation suite with labelled transcripts
-   Follow-up and accountability report

### Tier 3 --- If time permits

-   Live GitHub Issues or Trello integration
-   Task dependency or blocker view
-   Advanced semantic similarity
-   More detailed evaluation charts
-   Enhanced post-meeting report

**Priority rule:** A reliable end-to-end workflow is more valuable than
many unfinished advanced features.

## 14. Testing and Evaluation

The project should be evaluated against a small set of manually labelled
meeting transcripts.

  -----------------------------------------------------------------------
  Metric                              What it measures
  ----------------------------------- -----------------------------------
  Extraction precision                Fraction of extracted items
                                      supported by the transcript

  Extraction recall                   Fraction of expected outcomes found

  Owner accuracy                      Correctness of explicit owner
                                      extraction

  Deadline accuracy                   Correctness of supported deadline
                                      extraction

  Classification accuracy             Correct distinction between
                                      commitments, suggestions, and
                                      unresolved items

  Duplicate precision/recall          Quality of duplicate candidate
                                      detection

  Approval-gate reliability           Whether unapproved and rejected
                                      tasks are blocked

  Export correctness                  Whether exported tasks are approved
                                      and correctly represented

  Tracking correctness                Whether task statuses and overdue
                                      counts are consistent
  -----------------------------------------------------------------------

Do not claim performance percentages until the tests have actually been
run. Report the test-set size, method, results, and limitations.

## 15. Demo Plan

Target duration: approximately 3--4 minutes.

1.  Upload a prepared transcript or notes file.
2.  Display extracted outcomes and their supporting evidence.
3.  Show a confirmed action, a suggestion, a duplicate candidate, and an
    unresolved owner.
4.  Resolve a clarification or edit an item.
5.  Approve one eligible task.
6.  Demonstrate that an unapproved task is blocked from export.
7.  Export the approved task or transfer it to the configured board.
8.  Show the updated execution status on the dashboard.

### Demo transcript example

``` text
Project meeting: October 23

Riya will complete the login page by October 25.
Aman will finish API integration by October 27.
We should consider adding dark mode next week.
We still need to decide who will test the application.
Riya will complete the login page by October 25.
```

Expected behavior: - Extract the login page action and flag the repeated
statement as a possible duplicate. - Extract API integration as a
confirmed action if supported by the wording. - Classify dark mode as a
suggestion, not a confirmed commitment. - Keep the testing ownership
question unresolved and request clarification. - Do not invent a year
for dates when the context does not establish one.

## 16. Risk Management

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  AI invents or misstates information Evidence checks, schema validation,
                                      human review

  Ambiguous owner or deadline         Keep unknown fields empty and
                                      request clarification

  False duplicate detection           Show candidate pairs and require
                                      human resolution

  False conflict detection            Explain the reason and allow
                                      reviewer resolution

  API quota or connectivity failure   Show a clear error and retain input
                                      for retry

  Board integration fails             Record failure; preserve approved
                                      data; allow structured export

  API key leakage                     Keep `.env` out of Git; use
                                      environment variables

  Time pressure                       Finish the minimum viable
                                      end-to-end path before advanced
                                      features

  Unverified accuracy claims          Use labelled tests and report
                                      measured results only
  -----------------------------------------------------------------------

## 17. Security and Responsible Use

-   Keep API credentials in a local `.env` file or an appropriate
    secrets manager.
-   Never commit `.env`, API keys, or sensitive meeting transcripts to a
    public repository.
-   Use anonymised or synthetic transcripts for the demo where possible.
-   Treat transcript contents as data, not as instructions to override
    system rules.
-   Validate data before passing it to execution functions.
-   Enforce approval in backend code.
-   Keep a record of review and execution outcomes.
-   Clearly communicate that extraction may make mistakes and that human
    review is required.

## 18. Suggested Presentation Outline

1.  Title --- Meet2Momentum
2.  Problem statement
3.  Proposed solution
4.  System architecture
5.  AI extraction and classification
6.  Evidence validation, duplicates, and conflicts
7.  Commitment Firewall and approval workflow
8.  Execution and tracking dashboard
9.  Innovation and differentiation
10. Evaluation and test results
11. Implementation plan and feasibility
12. Impact, live demo, and closing

Use actual screenshots and measured results from the working prototype.
Do not present planned features as already implemented.

## 19. Likely Judge Questions

### How do you reduce hallucinations?

We preserve the original transcript, link extracted outcomes to source
passages, validate evidence, leave unknown fields empty, and request
human clarification. These controls reduce risk but do not guarantee
zero errors.

### Why use an LLM rather than only rules?

An LLM can interpret varied natural-language expressions. Deterministic
Python logic is better suited for field checks, approval enforcement,
and execution-state management.

### How do you distinguish suggestions from commitments?

We classify the wording in context. Ambiguous cases are flagged for
review rather than automatically treated as confirmed tasks.

### What if two tasks look similar but are not duplicates?

The system flags potential matches and explains why. The reviewer
decides whether to merge or retain them.

### How do you prevent unapproved execution?

The backend checks the persisted approval status before export or
integration. Hiding a UI button alone is not sufficient.

### What happens if board integration fails?

The system records the failed attempt, preserves the approved task, and
allows retry or structured export. It does not mark a failed transfer as
successful.

### How will you prove the solution works?

We test against labelled transcripts and report extraction,
classification, duplicate-detection, approval-gate, and export results,
including limitations.

## 20. Success Criteria

The project is ready for demonstration when:

-   [ ] A transcript can be uploaded or pasted.
-   [ ] Structured outcomes are extracted and displayed.
-   [ ] Each extracted item includes supporting evidence or a review
    flag.
-   [ ] Suggestions and unresolved questions are distinguished from
    confirmed commitments.
-   [ ] Missing owners and ambiguous dates are handled without
    invention.
-   [ ] Potential duplicates and conflicts are flagged.
-   [ ] Reviewers can edit, clarify, approve, and reject items.
-   [ ] Unapproved and rejected tasks cannot be exported or executed.
-   [ ] Approved tasks can be exported to CSV/JSON or transferred to a
    tested board integration.
-   [ ] Task statuses, overdue work, and unassigned actions are tracked.
-   [ ] The demonstration is repeatable.
-   [ ] API credentials are not exposed.
-   [ ] The presentation accurately distinguishes implemented features
    from planned extensions.

## 21. Closing Statement

**Meet2Momentum is not just a meeting summarizer. It is a controlled
bridge between what a team says and what a team gets done.**

By combining evidence-grounded AI extraction, explainable validation,
human approval, structured execution, and follow-up tracking, the
project aims to make meeting outcomes more reliable and accountable.

------------------------------------------------------------------------

## Development Note

This document describes the proposed architecture and implementation
plan. The presence of a feature in this document does not mean it has
already been implemented. Update the project status, screenshots,
integration claims, and evaluation results as the working application
develops.
