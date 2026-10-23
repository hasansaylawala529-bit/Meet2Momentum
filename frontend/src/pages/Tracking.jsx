import React, { useState, useMemo } from 'react';
import { Button, StatusChip, Modal } from '../components/common';
import { updateActionItem } from '../services/api';

/**
 * Event type badge styling utility
 */
function getEventBadgeDetails(eventType) {
  switch (eventType) {
    case 'approved':
      return {
        label: 'Approved',
        className: 'badge-event-approved',
        style: {
          backgroundColor: 'var(--status-green-bg)',
          color: 'var(--status-green)',
          border: '1px solid var(--status-green-border)',
        },
      };
    case 'rejected':
      return {
        label: 'Rejected',
        className: 'badge-event-rejected',
        style: {
          backgroundColor: 'var(--status-red-bg)',
          color: 'var(--status-red)',
          border: '1px solid var(--status-red-border)',
        },
      };
    case 'status_changed':
      return {
        label: 'Status changed',
        className: 'badge-event-status',
        style: {
          backgroundColor: 'var(--accent-blue-subtle)',
          color: 'var(--accent-blue)',
          border: '1px solid var(--accent-blue-border)',
        },
      };
    case 'exported':
      return {
        label: 'Exported',
        className: 'badge-event-exported',
        style: {
          backgroundColor: '#FAF5FF',
          color: '#9333EA',
          border: '1px solid #E9D5FF',
        },
      };
    case 'edited':
      return {
        label: 'Edited',
        className: 'badge-event-edited',
        style: {
          backgroundColor: 'var(--status-amber-bg)',
          color: 'var(--status-amber)',
          border: '1px solid var(--status-amber-border)',
        },
      };
    case 'extracted':
    default:
      return {
        label: eventType ? eventType.replace('_', ' ') : 'Event',
        className: 'badge-event-default',
        style: {
          backgroundColor: 'var(--slate-100)',
          color: 'var(--slate-600)',
          border: '1px solid var(--slate-200)',
        },
      };
  }
}

/**
 * Format timestamp into clean date & time (e.g. "Oct 24, 01:15 AM")
 */
function formatEventTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Execution Tracking Page:
 * - 4 compact StatCards with a thin progress bar
 * - Optional status-breakdown bar (pending / in progress / completed)
 * - Two side-by-side compact lists: Overdue and Unassigned with quick actions
 * - Filterable Activity log table directly below with pagination
 * Designed to fit above the fold at 1440x900 without scrolling past empty panels.
 */
export default function Tracking({
  actionItems = [],
  trackingData = null,
  meetingMap = new Map(),
  handleUpdateTaskProgress,
  handleStartEdit,
  loadTrackingData,
  onNavigate,
}) {
  // Filters for Activity Log Table
  const [activitySearchQuery, setActivitySearchQuery] = useState('');
  const [activityEventType, setActivityEventType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // Reassign Modal State
  const [reassignItem, setReassignItem] = useState(null);
  const [newOwnerName, setNewOwnerName] = useState('');
  const [isSubmittingReassign, setIsSubmittingReassign] = useState(false);
  const [reassignError, setReassignError] = useState('');

  // Quick Action In-Progress state
  const [loadingTaskId, setLoadingTaskId] = useState(null);

  // Fast task lookup map
  const taskMap = useMemo(() => {
    return new Map(actionItems.map((item) => [item.task_id, item]));
  }, [actionItems]);

  // Derived Metrics & Fallbacks
  const commitments = useMemo(() => {
    return actionItems.filter((i) => i.category === 'commitment');
  }, [actionItems]);

  const totalCommitments = trackingData?.total_commitments ?? commitments.length;
  const completedCount =
    trackingData?.completed_count ??
    commitments.filter((i) => i.task_status === 'completed').length;
  const inProgressCount =
    trackingData?.in_progress_count ??
    commitments.filter((i) => i.task_status === 'in_progress').length;
  const pendingCount =
    trackingData?.pending_count ??
    commitments.filter((i) => !i.task_status || i.task_status === 'pending').length;
  const overdueCount =
    trackingData?.overdue_count ?? commitments.filter((i) => i.is_overdue).length;
  const unassignedCount =
    trackingData?.unassigned_owner_count ??
    commitments.filter(
      (i) => !i.owner || !i.owner.trim() || i.owner.toLowerCase() === 'unassigned'
    ).length;
  const completionRate =
    trackingData?.completion_rate_percent ??
    (totalCommitments > 0 ? Math.round((completedCount / totalCommitments) * 100) : 0);
  const dueSoonCount = trackingData?.due_soon_count || 0;

  // Status Breakdown Bar Proportions
  const statusProportions = useMemo(() => {
    const total = Math.max(totalCommitments, 1);
    const completedPct = Math.round((completedCount / total) * 100);
    const inProgressPct = Math.round((inProgressCount / total) * 100);
    const pendingPct = Math.max(0, 100 - (completedPct + inProgressPct));
    return { completedPct, inProgressPct, pendingPct };
  }, [totalCommitments, completedCount, inProgressCount]);

  // Overdue Items list
  const overdueItems = useMemo(() => {
    if (trackingData?.overdue_items && trackingData.overdue_items.length > 0) {
      return trackingData.overdue_items;
    }
    return commitments
      .filter((i) => i.is_overdue)
      .map((i) => ({
        task_id: i.task_id,
        meeting_id: i.meeting_id,
        title: i.title,
        owner: i.owner || 'Unassigned',
        due_date: i.due_date,
        days_overdue: 1,
        task_status: i.task_status || 'pending',
      }));
  }, [trackingData, commitments]);

  // Unassigned Items list
  const unassignedItems = useMemo(() => {
    if (trackingData?.unassigned_items && trackingData.unassigned_items.length > 0) {
      return trackingData.unassigned_items;
    }
    return commitments
      .filter(
        (i) => !i.owner || !i.owner.trim() || i.owner.toLowerCase() === 'unassigned'
      )
      .map((i) => ({
        task_id: i.task_id,
        meeting_id: i.meeting_id,
        title: i.title,
        due_date: i.due_date,
        task_status: i.task_status || 'pending',
      }));
  }, [trackingData, commitments]);

  // Activity Log filtering & pagination
  const allHistory = useMemo(() => {
    return trackingData?.recent_history || [];
  }, [trackingData]);

  const filteredHistory = useMemo(() => {
    return allHistory.filter((event) => {
      // Event type filter
      if (activityEventType !== 'all' && event.event_type !== activityEventType) {
        return false;
      }
      // Task search filter
      if (activitySearchQuery.trim()) {
        const query = activitySearchQuery.toLowerCase().trim();
        const task = taskMap.get(event.task_id);
        const titleMatch = task && task.title ? task.title.toLowerCase().includes(query) : false;
        const idMatch = event.task_id ? event.task_id.toLowerCase().includes(query) : false;
        const detailsMatch = event.details ? event.details.toLowerCase().includes(query) : false;
        if (!titleMatch && !idMatch && !detailsMatch) return false;
      }
      return true;
    });
  }, [allHistory, activityEventType, activitySearchQuery, taskMap]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, currentPage, pageSize]);

  // Handlers
  const handleMarkDone = async (taskId) => {
    if (!handleUpdateTaskProgress) return;
    setLoadingTaskId(taskId);
    try {
      await handleUpdateTaskProgress(taskId, 'completed');
      if (loadTrackingData) await loadTrackingData();
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleOpenReassignModal = (item) => {
    setReassignItem(item);
    setNewOwnerName(item.owner && item.owner !== 'Unassigned' ? item.owner : '');
    setReassignError('');
  };

  const handleCloseReassignModal = () => {
    setReassignItem(null);
    setNewOwnerName('');
    setReassignError('');
  };

  const handleSaveReassign = async (e) => {
    e?.preventDefault();
    if (!newOwnerName.trim()) {
      setReassignError('Please specify an owner name.');
      return;
    }
    if (!reassignItem) return;

    setIsSubmittingReassign(true);
    setReassignError('');
    try {
      const original = taskMap.get(reassignItem.task_id) || reassignItem;
      await updateActionItem(reassignItem.task_id, {
        title: original.title || reassignItem.title,
        description: original.description || '',
        owner: newOwnerName.trim(),
        due_date: original.due_date || reassignItem.due_date || null,
      });
      if (loadTrackingData) await loadTrackingData();
      setReassignItem(null);
    } catch (err) {
      setReassignError(err.message || 'Failed to update owner.');
    } finally {
      setIsSubmittingReassign(false);
    }
  };

  return (
    <div className="tracking-page-container">
      {/* 1. 4 COMPACT STAT CARDS */}
      <div className="tracking-kpi-grid">
        {/* Card 1: Completion rate */}
        <div className="tracking-kpi-card accent-rate">
          <div className="tracking-kpi-header">
            <span className="tracking-kpi-label">Completion rate</span>
            <div
              className="tracking-kpi-icon-box"
              style={{ backgroundColor: 'var(--status-green-bg)', color: 'var(--status-green)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <div className="tracking-kpi-value" style={{ color: 'var(--status-green)' }}>
            {completionRate}%
          </div>
          <div className="tracking-kpi-subtext">
            {completedCount} of {totalCommitments} commitments completed
          </div>
          <div className="thin-progress-bar">
            <div
              className="thin-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, completionRate))}%` }}
            />
          </div>
        </div>

        {/* Card 2: In progress */}
        <div
          className="tracking-kpi-card accent-progress interactive"
          onClick={() => onNavigate && onNavigate('actions', { progressFilter: 'in_progress' })}
          title="Filter Action Items by In Progress"
        >
          <div className="tracking-kpi-header">
            <span className="tracking-kpi-label">In progress</span>
            <div
              className="tracking-kpi-icon-box"
              style={{ backgroundColor: 'var(--accent-blue-subtle)', color: 'var(--accent-blue)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="tracking-kpi-value" style={{ color: 'var(--accent-blue)' }}>
            {inProgressCount}
          </div>
          <div className="tracking-kpi-subtext">
            Active execution underway
          </div>
        </div>

        {/* Card 3: Overdue */}
        <div
          className="tracking-kpi-card accent-overdue interactive"
          onClick={() => onNavigate && onNavigate('actions')}
          title="Review overdue tasks in Action Items"
        >
          <div className="tracking-kpi-header">
            <span className="tracking-kpi-label">Overdue</span>
            <div
              className="tracking-kpi-icon-box"
              style={{ backgroundColor: 'var(--status-red-bg)', color: 'var(--status-red)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="tracking-kpi-value" style={{ color: overdueCount > 0 ? 'var(--status-red)' : 'var(--text-main)' }}>
            {overdueCount}
          </div>
          <div className="tracking-kpi-subtext">
            {dueSoonCount > 0 ? `${dueSoonCount} due within 48h` : 'Requires delivery attention'}
          </div>
        </div>

        {/* Card 4: Unassigned */}
        <div
          className="tracking-kpi-card accent-unassigned interactive"
          onClick={() => onNavigate && onNavigate('actions')}
          title="Review unassigned tasks in Action Items"
        >
          <div className="tracking-kpi-header">
            <span className="tracking-kpi-label">Unassigned</span>
            <div
              className="tracking-kpi-icon-box"
              style={{ backgroundColor: 'var(--status-amber-bg)', color: 'var(--status-amber)' }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
          </div>
          <div className="tracking-kpi-value" style={{ color: unassignedCount > 0 ? 'var(--status-amber)' : 'var(--text-main)' }}>
            {unassignedCount}
          </div>
          <div className="tracking-kpi-subtext">
            Commitments lacking owner
          </div>
        </div>
      </div>

      {/* 2. OPTIONAL CLEAN STATUS-BREAKDOWN BAR */}
      <div className="tracking-status-bar-container">
        <div className="tracking-status-bar">
          <div
            className="status-bar-segment completed"
            style={{ width: `${statusProportions.completedPct}%` }}
            title={`Completed: ${completedCount} (${statusProportions.completedPct}%)`}
          />
          <div
            className="status-bar-segment in-progress"
            style={{ width: `${statusProportions.inProgressPct}%` }}
            title={`In progress: ${inProgressCount} (${statusProportions.inProgressPct}%)`}
          />
          <div
            className="status-bar-segment pending"
            style={{ width: `${statusProportions.pendingPct}%` }}
            title={`Pending: ${pendingCount} (${statusProportions.pendingPct}%)`}
          />
        </div>

        <div className="tracking-status-legend">
          <div className="legend-group">
            <span className="legend-item">
              <span className="legend-dot completed" />
              <span>Completed: <strong>{completedCount}</strong> ({statusProportions.completedPct}%)</span>
            </span>
            <span className="legend-item">
              <span className="legend-dot in-progress" />
              <span>In progress: <strong>{inProgressCount}</strong> ({statusProportions.inProgressPct}%)</span>
            </span>
            <span className="legend-item">
              <span className="legend-dot pending" />
              <span>Pending: <strong>{pendingCount}</strong> ({statusProportions.pendingPct}%)</span>
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {totalCommitments} total commitments
          </span>
        </div>
      </div>

      {/* 3. TWO SIDE-BY-SIDE COMPACT LISTS: OVERDUE & UNASSIGNED */}
      <div className="tracking-lists-grid">
        {/* Left List: Overdue */}
        <div className="tracking-compact-card">
          <div className="tracking-card-header">
            <div className="tracking-card-title-group">
              <h3 className="tracking-card-title">Overdue</h3>
              <span className="count-pill" style={{ color: overdueItems.length > 0 ? 'var(--status-red)' : 'inherit' }}>
                {overdueItems.length}
              </span>
            </div>
            {overdueItems.length > 0 && onNavigate && (
              <button
                type="button"
                className="clean-text-link"
                style={{ fontSize: '11px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => onNavigate('actions')}
              >
                View in table &rarr;
              </button>
            )}
          </div>

          <div className="tracking-list-scroll">
            {overdueItems.length === 0 ? (
              <p className="compact-empty-line">No overdue commitments.</p>
            ) : (
              overdueItems.map((item) => {
                const isLoading = loadingTaskId === item.task_id;
                return (
                  <div key={item.task_id} className="tracking-row">
                    <div className="tracking-row-info">
                      <div className="tracking-row-title" title={item.title}>
                        {item.title}
                      </div>
                      <div className="tracking-row-meta">
                        <span>{item.owner || 'Unassigned'}</span>
                        <span>•</span>
                        <span style={{ color: 'var(--status-red)', fontWeight: 600 }}>
                          {item.days_overdue ? `${item.days_overdue}d overdue` : 'Past due'}
                        </span>
                        {item.due_date && (
                          <>
                            <span>•</span>
                            <span>Due {item.due_date}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="tracking-quick-action-btn btn-done"
                        onClick={() => handleMarkDone(item.task_id)}
                        disabled={isLoading}
                        title="Mark task completed"
                      >
                        {isLoading ? '...' : 'Mark done'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right List: Unassigned */}
        <div className="tracking-compact-card">
          <div className="tracking-card-header">
            <div className="tracking-card-title-group">
              <h3 className="tracking-card-title">Unassigned</h3>
              <span className="count-pill" style={{ color: unassignedItems.length > 0 ? 'var(--status-amber)' : 'inherit' }}>
                {unassignedItems.length}
              </span>
            </div>
            {unassignedItems.length > 0 && onNavigate && (
              <button
                type="button"
                className="clean-text-link"
                style={{ fontSize: '11px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => onNavigate('actions')}
              >
                View in table &rarr;
              </button>
            )}
          </div>

          <div className="tracking-list-scroll">
            {unassignedItems.length === 0 ? (
              <p className="compact-empty-line">All commitments are assigned to owners.</p>
            ) : (
              unassignedItems.map((item) => (
                <div key={item.task_id} className="tracking-row">
                  <div className="tracking-row-info">
                    <div className="tracking-row-title" title={item.title}>
                      {item.title}
                    </div>
                    <div className="tracking-row-meta">
                      <span style={{ color: 'var(--status-amber)', fontWeight: 600 }}>No owner</span>
                      <span>•</span>
                      <span>{item.due_date ? `Due ${item.due_date}` : 'No deadline'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="tracking-quick-action-btn btn-reassign"
                      onClick={() => handleOpenReassignModal(item)}
                      title="Assign an owner to this commitment"
                    >
                      Reassign
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 4. FILTERABLE ACTIVITY LOG TABLE DIRECTLY BELOW */}
      <div className="activity-log-card">
        {/* Header & Toolbar */}
        <div className="activity-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <h3 className="tracking-card-title">Activity log</h3>
            <span className="count-pill">{filteredHistory.length}</span>
          </div>

          <div className="activity-filters-group">
            {/* Task or ID Search */}
            <input
              type="text"
              className="activity-search-input"
              placeholder="Filter by task or ID..."
              value={activitySearchQuery}
              onChange={(e) => {
                setActivitySearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter activity by task or ID"
            />

            {/* Event Type Filter */}
            <select
              className="activity-select-filter"
              value={activityEventType}
              onChange={(e) => {
                setActivityEventType(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Filter activity by event type"
            >
              <option value="all">All events</option>
              <option value="status_changed">Status changed</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="edited">Edited</option>
              <option value="exported">Exported</option>
              <option value="extracted">Extracted</option>
            </select>

            {(activitySearchQuery || activityEventType !== 'all') && (
              <button
                type="button"
                className="clean-text-link"
                style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.35rem' }}
                onClick={() => {
                  setActivitySearchQuery('');
                  setActivityEventType('all');
                  setCurrentPage(1);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table Body */}
        {filteredHistory.length === 0 ? (
          <p className="compact-empty-line">No activity records match your filter criteria.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="clean-activity-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Event</th>
                  <th>Task</th>
                  <th>Details</th>
                  <th style={{ width: '100px' }}>User</th>
                  <th style={{ width: '140px' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHistory.map((event) => {
                  const task = taskMap.get(event.task_id);
                  const badge = getEventBadgeDetails(event.event_type);

                  return (
                    <tr key={event.history_id}>
                      {/* Event badge */}
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            lineHeight: 1.2,
                            ...badge.style,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>

                      {/* Task title and ID */}
                      <td>
                        <div className="activity-task-cell">
                          <span
                            className="activity-task-title"
                            title={task?.title || event.task_id}
                          >
                            {task?.title || `Task #${event.task_id}`}
                          </span>
                          <span className="activity-task-id-tag">
                            #{event.task_id}
                          </span>
                        </div>
                      </td>

                      {/* Details & Transition */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--text-main)' }}>
                            {event.details || 'Lifecycle transition recorded.'}
                          </span>
                          {event.old_value && event.new_value && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '11px',
                                color: 'var(--text-secondary)',
                                backgroundColor: 'var(--slate-100)',
                                padding: '0.1rem 0.35rem',
                                borderRadius: '3px',
                                border: '1px solid var(--slate-200)',
                              }}
                            >
                              <span>{event.old_value}</span>
                              <span>&rarr;</span>
                              <strong style={{ color: 'var(--accent-blue)' }}>{event.new_value}</strong>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actor / User */}
                      <td>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          {event.event_type === 'extracted' ? 'System' : 'Reviewer'}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatEventTime(event.created_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {filteredHistory.length > pageSize && (
          <div className="activity-pagination">
            <span>
              Showing {Math.min((currentPage - 1) * pageSize + 1, filteredHistory.length)}–
              {Math.min(currentPage * pageSize, filteredHistory.length)} of {filteredHistory.length} events
            </span>

            <div className="activity-pagination-buttons">
              <button
                type="button"
                className="page-nav-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                &larr; Previous
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0 0.35rem' }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                className="page-nav-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* QUICK REASSIGN MODAL */}
      <Modal
        isOpen={Boolean(reassignItem)}
        onClose={handleCloseReassignModal}
        title="Reassign Commitment Owner"
        maxWidth="460px"
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCloseReassignModal}
              disabled={isSubmittingReassign}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleSaveReassign}
              loading={isSubmittingReassign}
            >
              Save Assignment
            </Button>
          </>
        }
      >
        {reassignItem && (
          <form onSubmit={handleSaveReassign} className="reassign-dialog-body">
            <div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Commitment
              </span>
              <p style={{ margin: '0.2rem 0 0 0', fontWeight: 600, color: 'var(--text-main)', fontSize: 'var(--font-size-13)' }}>
                {reassignItem.title}
              </p>
            </div>

            <label className="reassign-input-label">
              <span>Owner Name</span>
              <input
                type="text"
                className="reassign-input"
                placeholder="e.g. Sarah Connor or Hasan"
                value={newOwnerName}
                onChange={(e) => setNewOwnerName(e.target.value)}
                autoFocus
              />
            </label>

            {reassignError && (
              <p style={{ color: 'var(--status-red)', fontSize: 'var(--font-size-12)', margin: 0 }}>
                {reassignError}
              </p>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
