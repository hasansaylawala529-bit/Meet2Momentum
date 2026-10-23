# Meet2Momentum — Hackathon Demonstration Guide

> **Core Principle:** *"AI proposes. Humans approve. The system enforces."*  
> **Problem Statement:** Convert meeting transcripts into evidence-grounded, human-approved, trackable execution without allowing unverified AI hallucinations or unapproved commitments into production.

---

## 1. Lifecycle Separation Architecture

Meet2Momentum enforces a strict boundary between three independent lifecycles:

| Lifecycle Field | Valid States | Controlled By | Meaning & Rules |
| :--- | :--- | :--- | :--- |
| **`approval_status`** | `pending`, `approved`, `rejected` | Human Reviewer | Gated by the Commitment Firewall. Only `approved` items can execute or advance. Material edits automatically reset status back to `pending`. |
| **`execution_status`** | `not_exported`, `exported` | Export Dispatch Engine | Records whether an approved commitment has been dispatched downstream with a UTC timestamp. |
| **`task_status`** | `pending`, `in_progress`, `completed` | Operational Assignee | Tracks delivery progress. Guarded by the firewall: unapproved items cannot enter `in_progress` or `completed`. Tasks marked `completed` gain completed immunity from overdue flags. |

---

## 2. Step-by-Step Demonstration Sequence

### Step 1: Open Application & Load Demo Transcript
1. Open the web UI at `http://127.0.0.1:5173`.
2. Navigate to the **Meetings** tab in the left sidebar.
3. In the **Sample Transcripts** presets bar, click the preset **`Sprint Alignment & Pipeline Review`**.
4. **What appears in the UI:**
   * Title: `Sprint Alignment Meeting: October 25`
   * Transcript text populates into the editor showing:
     * Two duplicate commitments by Riya (deploy auth service by Wednesday 5pm).
     * One conflicting commitment by Vikram (different deadline: Friday).
     * One conflicting commitment by Aman (different owner: Aman).
     * One generic action item ("Follow up with infrastructure team").
     * One unassigned action item with missing deadline ("update staging SSL certificates").
5. Click **Save Meeting Record**.
   * Meeting card appears in the **Saved Meetings History** panel with status `Unprocessed`.

---

### Step 2: Trigger Gemini AI Extraction
1. On the saved meeting card, click **Process with AI**.
2. **What appears in the UI:**
   * Extraction spinner runs with real-time feedback.
   * On completion, a green toast announces extraction success.
   * Counters in the sidebar navigation update dynamically (Decisions, Action Items, Follow-ups).

---

### Step 3: Inspect Ground-Truth Evidence & Decisions
1. Click **Decisions** in the sidebar (Tab 3).
2. **What appears in the UI:**
   * Cards showing extracted decisions.
   * Each card features a dashed **Transcript Evidence** quote box showing the exact verbatim sentence cited from the transcript.
   * Green **`✓ Grounded in Transcript`** badge confirms the deterministic evidence check passed.

---

### Step 4: Review Action Items, Duplicates & Conflicts
1. Click **Action Items** in the sidebar (Tab 4).
2. Filter by category using the category pills (**Commitments**, **Suggestions**, **Unresolved Questions**).
3. **What appears in the UI:**
   * **Potential Duplicate Candidate:**
     * Lavender badge **`📑 Potential Duplicate`** appears in the header.
     * Lavender banner below the attributes states:  
       `Potential Duplicate: Potential duplicate of '...' — 100% title similarity.`
   * **Possible Conflict Detected:**
     * Amber/orange badge **`⚡ Possible Conflict`** appears in the header.
     * Amber banner details the exact conflict:  
       `Possible Conflict: Conflict with '...': Assigned owner conflict: 'Aman' vs 'Riya'` or `Deadline conflict: 'Friday' vs 'Wednesday 5pm'`.
   * **Generic Action Item:**
     * "Follow up with the infrastructure team" is displayed **without** false-positive duplicate or conflict warnings because generic phrasing is filtered.
   * **Clarification Warning:**
     * SSL certificates task displays amber **`Owner needed`** and **`Deadline needed`** tags and a **`Clarification Needed`** banner.

---

### Step 5: Material Edit & Approval Reset
1. Find any commitment and click the **Edit** action button.
2. In the inline edit box, modify the **Assigned Owner** or **Deadline**.
3. Notice the warning banner:  
   `⚠️ Material edits will automatically reset approval status to Pending Review.`
4. Click **Save Changes**.
5. **What appears in the UI:**
   * The item's approval badge shows **`⏳ Pending Review`**.
   * The Commitment Firewall status immediately reads **`🛡️ Firewall: Blocked (Pending approval)`**.
   * Duplicate and conflict relationships are deterministically re-evaluated in real time.

---

### Step 6: Human Approval & Firewall Eligibility Gate
1. On an eligible commitment, click the **Approve** button.
2. **What appears in the UI:**
   * Approval badge updates to **`✓ Approved`** (Mint green).
   * Commitment Firewall badge updates to **`🛡️ Firewall: Eligible`**.
   * Execution badge updates to **`⚡ Ready for Export`**.
   * The item is now cleared for downstream export and task execution.

---

### Step 7: Downstream Execution & Traceability Export
1. Click **Execution & Export** in the sidebar (Tab 6).
2. **What appears in the UI:**
   * Top KPI cards display real-time counts: *Ready for Export*, *Exported to Pipeline*, *Blocked by Firewall*, and *Total Approved*.
   * The interactive **Traceability Table** displays all commitments with transcript citations, approval state, and firewall status.
3. Click **Download CSV**:
   * Downloads an RFC 4180 compliant CSV file (`meet2momentum_commitments.csv`).
   * Opens in Excel/Sheets showing full metadata, verbatim evidence citations, and execution status.
4. Click **Download JSON**:
   * Downloads structured, schema-validated JSON with complete provenance.
5. Click **Dispatch All Ready**:
   * Atomically transitions eligible commitments to `execution_status = "exported"`.
   * Execution badge updates to **`🚀 Exported`** with ISO-8601 UTC timestamp.
6. Click **Dispatch to GitHub Issues**:
   * Bridges commitments directly to the project board.
   * Creates structured issues containing assigned owners, deadlines, and a verbatim **`🛡️ Ground-Truth Evidence`** quote block.
   * Generates a clickable badge (e.g. **`#104 ↗`**) linking directly to the created issue on GitHub!
   * Demonstrates how the Commitment Firewall prevents any unapproved proposal from reaching the project board.

---

### Step 8: Execution Tracking, Overdue Intelligence & Audit Trail
1. Click **Execution Tracking** in the sidebar (Tab 7).
2. **What appears in the UI:**
   * **KPI Grid:** Shows *Completion Rate %* with dynamic progress bar, *Total Commitments*, *In Progress*, *Overdue*, and *Unassigned Owners*.
   * **Overdue Intelligence:** Lists tasks whose deadlines are in the past.
   * **Unassigned Commitments Triage:** Lists commitments requiring owner assignment.
3. On an approved task, update progress from `Pending` &rarr; `In Progress` &rarr; `Completed`.
   * Notice that when marked **Completed**, the task immediately gains **completed immunity** and drops out of overdue alerts even if its due date was in the past.
4. Click **History** on any task card:
   * A modal opens displaying the immutable audit trail from SQLite (`task_history`), documenting chronological events (`extracted`, `approved`, `edited`, `status_changed`).

---

### Step 9: Commitment Firewall Enforcement Verification
1. **Blocked Progress Transitions:**
   * Attempting to advance an unapproved (`pending`) or `rejected` task to `in_progress` or `completed` is rejected by the backend with HTTP 400 (`FirewallValidationError: approval_pending` or `item_rejected`).
2. **Blocked Downstream Dispatch:**
   * Clicking "Dispatch" on an unapproved item is rejected by the firewall.
3. **No Leaks in Exports:**
   * CSV and JSON exports server-side exclude any unapproved or rejected item. Client query flags cannot bypass this gate.

---

## 3. Quick Reference: Demo Checklist

| Workflow Element | Where to Look in UI | Expected Color / Indicator |
| :--- | :--- | :--- |
| **Evidence Grounding** | Decisions & Action Items tabs | `✓ Grounded in Transcript` (Mint green tag) |
| **Duplicate Candidate** | Action Items tab | `📑 Potential Duplicate` (Lavender badge & banner) |
| **Conflict Candidate** | Action Items tab | `⚡ Possible Conflict` (Amber/orange badge & banner) |
| **Approval Reset** | Action Items tab (after editing) | `⏳ Pending Review` (Soft blue badge) |
| **Firewall Cleared** | Action Items & Export tabs | `🛡️ Firewall: Eligible` (Mint green badge) |
| **Firewall Blocked** | Action Items & Export tabs | `🛡️ Firewall: Blocked` (Soft red / amber badge) |
| **Execution Dispatch** | Execution & Export tab | `🚀 Exported` (Pale blue badge with timestamp) |
| **Overdue Task** | Execution Tracking tab | `⚠️ Overdue` (Soft red badge & alert panel) |
| **Completed Immunity** | Execution Tracking tab | `✓ Completed` (Drops from overdue counts) |
| **Audit Trail** | Action Items or Tracking tab | History Modal showing event log |
