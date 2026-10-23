import React, { useState, useMemo } from 'react';
import { Button, StatusChip, Skeleton, EmptyState } from '../components/common';

/**
 * Overview Page: Executive Triage Dashboard.
 * Max 4 StatCards, slim pipeline strip, "Needs your attention" triage queue,
 * and dense recent meetings table. Fits above the fold at 1440x900. No emoji.
 */
export default function Overview({
  meetings = [],
  decisions = [],
  actionItems = [],
  exportSummary = null,
  trackingData = null,
  processedMeetingStats = {},
  isLoading = false,
  actionLoadingId = null,
  handleApproveItem,
  handleRejectItem,
  handleStartEdit,
  handleCancelEdit,
  handleSaveEdit,
  editingTaskId,
  editFormData,
  setEditFormData,
  onNavigate,
}) {
  // Local fallback state for inline editing if not passed
  const [localEditingId, setLocalEditingId] = useState(null);
  const [localFormData, setLocalFormData] = useState({ title: '', owner: '', due_date: '', description: '' });

  const activeEditingId = editingTaskId !== undefined ? editingTaskId : localEditingId;
  const activeFormData = editFormData !== undefined ? editFormData : localFormData;
  const updateFormData = setEditFormData || setLocalFormData;

  const onStartInlineEdit = (item) => {
    if (handleStartEdit) {
      handleStartEdit(item);
    } else {
      setLocalEditingId(item.task_id);
      setLocalFormData({
        title: item.title || '',
        description: item.description || '',
        owner: item.owner || '',
        due_date: item.due_date || '',
      });
    }
  };

  const onCancelInlineEdit = () => {
    if (handleCancelEdit) handleCancelEdit();
    else setLocalEditingId(null);
  };

  const onSaveInlineEdit = async (taskId) => {
    if (handleSaveEdit) {
      await handleSaveEdit(taskId);
    } else {
      setLocalEditingId(null);
    }
  };

  // 1. Triage StatCard Metrics (Max 4 in one row)
  const pendingReviewCount = useMemo(() => {
    return actionItems.filter((i) => i.approval_status === 'pending').length;
  }, [actionItems]);

  const approvedReadyCount = useMemo(() => {
    return actionItems.filter(
      (i) => i.approval_status === 'approved' && i.execution_status !== 'exported'
    ).length;
  }, [actionItems]);

  const overdueCount = useMemo(() => {
    return trackingData?.overdue_count ?? actionItems.filter((i) => i.is_overdue).length;
  }, [trackingData, actionItems]);

  const unassignedCount = useMemo(() => {
    return actionItems.filter((i) => !i.owner || !i.owner.trim()).length;
  }, [actionItems]);

  // 2. Slim Pipeline Strip Counts & Proportions
  const totalExtracted = useMemo(() => actionItems.length, [actionItems]);
  const totalApproved = useMemo(() => actionItems.filter((i) => i.approval_status === 'approved').length, [actionItems]);
  const totalExported = useMemo(() => actionItems.filter((i) => i.execution_status === 'exported').length, [actionItems]);
  const totalCompleted = useMemo(() => actionItems.filter((i) => i.task_status === 'completed').length, [actionItems]);

  const pipelineProportions = useMemo(() => {
    const total = Math.max(totalExtracted, 1);
    const completedPct = Math.round((totalCompleted / total) * 100);
    const exportedPct = Math.max(0, Math.round(((totalExported - totalCompleted) / total) * 100));
    const approvedPct = Math.max(0, Math.round(((totalApproved - totalExported) / total) * 100));
    const pendingPct = Math.max(0, 100 - (completedPct + exportedPct + approvedPct));
    return { completedPct, exportedPct, approvedPct, pendingPct };
  }, [totalExtracted, totalCompleted, totalExported, totalApproved]);

  // 3. Top ~5 "Needs your attention" items (awaiting approval or clarification)
  const needsAttentionItems = useMemo(() => {
    return actionItems
      .filter((i) => i.approval_status === 'pending' || i.clarification_required || !i.owner || !i.due_date)
      .slice(0, 5);
  }, [actionItems]);

  // Fast meeting lookup map
  const meetingMap = useMemo(() => {
    return new Map(meetings.map((m) => [m.meeting_id, m]));
  }, [meetings]);

  return (
    <div className="triage-overview-container">
      {/* 1. ROW OF MAX 4 STATCARDS */}
      <div className="triage-stat-row">
        {/* Card 1: Pending Review */}
        {isLoading ? (
          <Skeleton type="rect" height="82px" />
        ) : (
          <div
            className="triage-stat-card pending"
            onClick={() => onNavigate && onNavigate('actions', { approvalFilter: 'pending', progressFilter: 'all' })}
            role="button"
            tabIndex={0}
            title="Filter Action Items by Pending Review"
          >
            <div className="triage-stat-header">
              <span className="triage-stat-label">Pending Review</span>
              <div className="triage-stat-icon-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
            <div className="triage-stat-value">{pendingReviewCount}</div>
            <div className="triage-stat-footer">Awaiting human review</div>
          </div>
        )}

        {/* Card 2: Approved & Ready */}
        {isLoading ? (
          <Skeleton type="rect" height="82px" />
        ) : (
          <div
            className="triage-stat-card approved"
            onClick={() => onNavigate && onNavigate('actions', { approvalFilter: 'approved', progressFilter: 'all' })}
            role="button"
            tabIndex={0}
            title="Filter Action Items by Approved & Ready"
          >
            <div className="triage-stat-header">
              <span className="triage-stat-label">Approved &amp; Ready</span>
              <div className="triage-stat-icon-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              </div>
            </div>
            <div className="triage-stat-value">{approvedReadyCount}</div>
            <div className="triage-stat-footer">Cleared by firewall</div>
          </div>
        )}

        {/* Card 3: Overdue */}
        {isLoading ? (
          <Skeleton type="rect" height="82px" />
        ) : (
          <div
            className="triage-stat-card overdue"
            onClick={() => onNavigate && onNavigate('actions', { progressFilter: 'overdue', approvalFilter: 'all' })}
            role="button"
            tabIndex={0}
            title="Filter Action Items by Overdue"
          >
            <div className="triage-stat-header">
              <span className="triage-stat-label">Overdue</span>
              <div className="triage-stat-icon-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            </div>
            <div className="triage-stat-value">{overdueCount}</div>
            <div className="triage-stat-footer">Requires attention</div>
          </div>
        )}

        {/* Card 4: Unassigned */}
        {isLoading ? (
          <Skeleton type="rect" height="82px" />
        ) : (
          <div
            className="triage-stat-card unassigned"
            onClick={() => onNavigate && onNavigate('actions', { progressFilter: 'unassigned', approvalFilter: 'all' })}
            role="button"
            tabIndex={0}
            title="Filter Action Items by Unassigned"
          >
            <div className="triage-stat-header">
              <span className="triage-stat-label">Unassigned</span>
              <div className="triage-stat-icon-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="18" y1="8" x2="23" y2="13" />
                  <line x1="23" y1="8" x2="18" y2="13" />
                </svg>
              </div>
            </div>
            <div className="triage-stat-value">{unassignedCount}</div>
            <div className="triage-stat-footer">Needs designated owner</div>
          </div>
        )}
      </div>

      {/* 2. SLIM PIPELINE STRIP */}
      {isLoading ? (
        <Skeleton type="rect" height="40px" />
      ) : (
        <div className="pipeline-strip">
          <div className="pipeline-stages">
            <span className="pipeline-stage">
              <span className="pipeline-stage-name">Extracted</span>
              <span className="pipeline-stage-count">{totalExtracted}</span>
            </span>
            <span className="pipeline-arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
            <span className="pipeline-stage">
              <span className="pipeline-stage-name">Approved</span>
              <span className="pipeline-stage-count">{totalApproved}</span>
            </span>
            <span className="pipeline-arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
            <span className="pipeline-stage">
              <span className="pipeline-stage-name">Exported</span>
              <span className="pipeline-stage-count">{totalExported}</span>
            </span>
            <span className="pipeline-arrow" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
            <span className="pipeline-stage">
              <span className="pipeline-stage-name">Completed</span>
              <span className="pipeline-stage-count" style={{ color: 'var(--status-green)' }}>{totalCompleted}</span>
            </span>
          </div>

          <div className="pipeline-bar-wrapper">
            <div className="pipeline-bar" title={`Pipeline breakdown: ${pipelineProportions.completedPct}% completed, ${pipelineProportions.exportedPct}% exported, ${pipelineProportions.approvedPct}% approved, ${pipelineProportions.pendingPct}% pending`}>
              <div className="pipeline-segment completed" style={{ width: `${pipelineProportions.completedPct}%` }} />
              <div className="pipeline-segment exported" style={{ width: `${pipelineProportions.exportedPct}%` }} />
              <div className="pipeline-segment approved" style={{ width: `${pipelineProportions.approvedPct}%` }} />
              <div className="pipeline-segment pending" style={{ width: `${pipelineProportions.pendingPct}%` }} />
            </div>
            <span className="pipeline-pct-label">
              {totalExtracted > 0 ? `${Math.round((totalCompleted / totalExtracted) * 100)}%` : '0%'}
            </span>
          </div>
        </div>
      )}

      {/* 3. MAIN SPLIT GRID: NEEDS ATTENTION (LEFT) & RECENT MEETINGS (RIGHT) */}
      <div className="triage-split-grid">
        {/* LEFT COLUMN: Needs your attention */}
        <div className="triage-panel-card">
          <div className="triage-panel-header">
            <div className="triage-panel-title-group">
              <h3 className="triage-panel-title">Needs Your Attention</h3>
              <span className="triage-panel-badge amber">
                {needsAttentionItems.length}
              </span>
            </div>
            <span className="triage-panel-subtitle">Awaiting approval or clarification</span>
          </div>

          <div className="triage-panel-body">
            {isLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <Skeleton type="rect" height="64px" count={3} />
              </div>
            ) : needsAttentionItems.length === 0 ? (
              <div className="triage-empty-card">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--status-green)' }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <h4>All Caught Up</h4>
                <p>No action items require approval or clarification right now.</p>
              </div>
            ) : (
              needsAttentionItems.map((item) => {
                const meeting = meetingMap.get(item.meeting_id);
                const isEditing = activeEditingId === item.task_id;
                const isItemLoading = actionLoadingId === item.task_id;
                const isPending = item.approval_status === 'pending';

                return (
                  <div key={item.task_id} className="attention-item">
                    {isEditing ? (
                      /* Inline Edit Form */
                      <div className="attention-inline-edit">
                        <input
                          type="text"
                          className="inline-edit-input"
                          value={activeFormData.title}
                          onChange={(e) => updateFormData((prev) => ({ ...prev, title: e.target.value }))}
                          placeholder="Action item title..."
                          disabled={isItemLoading}
                        />
                        <div className="inline-edit-row">
                          <input
                            type="text"
                            className="inline-edit-input"
                            value={activeFormData.owner}
                            onChange={(e) => updateFormData((prev) => ({ ...prev, owner: e.target.value }))}
                            placeholder="Owner..."
                            disabled={isItemLoading}
                          />
                          <input
                            type="text"
                            className="inline-edit-input"
                            value={activeFormData.due_date}
                            onChange={(e) => updateFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                            placeholder="Due date..."
                            disabled={isItemLoading}
                          />
                        </div>
                        <div className="inline-edit-actions">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={onCancelInlineEdit}
                            disabled={isItemLoading}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onSaveInlineEdit(item.task_id)}
                            loading={isItemLoading}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="attention-item-top">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="attention-item-title" title={item.title}>
                              {item.title}
                            </div>
                            <div className="attention-item-meeting-ref">
                              {meeting ? meeting.title : item.meeting_id}
                              {item.owner && <span> • Owner: {item.owner}</span>}
                              {item.due_date && <span> • Due: {item.due_date}</span>}
                            </div>
                          </div>

                          <div className="attention-item-badges">
                            {isPending && (
                              <StatusChip type="approval" status="pending" label="Pending Review" />
                            )}
                            {item.clarification_required && (
                              <StatusChip type="category" status="unresolved_question" label="Clarification" />
                            )}
                            {!item.owner && (
                              <span className="status-chip warning" title="Owner needed">
                                Needs Owner
                              </span>
                            )}
                            {!item.due_date && (
                              <span className="status-chip warning" title="Deadline needed">
                                Needs Date
                              </span>
                            )}
                          </div>
                        </div>

                        {item.source_text && (
                          <p className="attention-quote" title={item.source_text}>
                            "{item.source_text}"
                          </p>
                        )}

                        <div className="attention-actions-row">
                          <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-muted)' }}>
                            ID: {item.task_id}
                          </span>

                          <div className="attention-actions-group">
                            {isPending && (
                              <>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleApproveItem && handleApproveItem(item.task_id)}
                                  loading={isItemLoading}
                                  title="Approve item for execution"
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleRejectItem && handleRejectItem(item.task_id)}
                                  disabled={isItemLoading}
                                  title="Reject item"
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => onStartInlineEdit(item)}
                              disabled={isItemLoading}
                              title="Edit item title, owner, or deadline"
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Recent Meetings Dense Table */}
        <div className="triage-panel-card">
          <div className="triage-panel-header">
            <div className="triage-panel-title-group">
              <h3 className="triage-panel-title">Recent Meetings</h3>
              <span className="triage-panel-badge">
                {meetings.length}
              </span>
            </div>
            {meetings.length > 0 && onNavigate && (
              <button
                type="button"
                className="btn-add-date"
                onClick={() => onNavigate('meetings')}
                title="View all meetings in workspace"
              >
                View All &rarr;
              </button>
            )}
          </div>

          <div className="triage-panel-body" style={{ padding: 0 }}>
            {isLoading ? (
              <div style={{ padding: '1rem' }}>
                <Skeleton type="rect" height="40px" count={4} />
              </div>
            ) : meetings.length === 0 ? (
              <div className="triage-empty-card" style={{ padding: '2.5rem 1rem' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <h4>No Meetings Yet</h4>
                <p>Upload or paste notes in Meetings Workspace to start extracting outcomes.</p>
              </div>
            ) : (
              <div className="dense-table-wrapper">
                <table className="dense-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Date</th>
                      <th>Outcome Counts</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {meetings.slice(0, 6).map((m) => {
                      const stats = processedMeetingStats[m.meeting_id];
                      return (
                        <tr key={m.meeting_id}>
                          <td className="dense-table-title" title={m.title}>
                            {m.title}
                          </td>
                          <td className="dense-date-cell">
                            {m.meeting_date ? (
                              m.meeting_date
                            ) : (
                              <button
                                type="button"
                                className="btn-add-date"
                                onClick={() => onNavigate && onNavigate('meetings')}
                                title="Open in Meetings Workspace to set date"
                              >
                                Add date
                              </button>
                            )}
                          </td>
                          <td className="dense-counts-cell">
                            {stats ? (
                              <span>
                                {stats.decisions} dec, {stats.commitments} com
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>0 outcomes</span>
                            )}
                          </td>
                          <td>
                            {stats ? (
                              <span className="status-chip success">
                                Processed
                              </span>
                            ) : (
                              <span className="status-chip neutral">
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
