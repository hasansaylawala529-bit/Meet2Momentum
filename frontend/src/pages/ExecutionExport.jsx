import React, { useState, useMemo } from 'react';
import { Button, StatusChip, Modal } from '../components/common';

/**
 * ExecutionExport Page: Two-column layout with Ready to Dispatch table (left),
 * Compact Summary & Plain-English Blocked list (right), and Exported Traceability table (below).
 */
export default function ExecutionExport({
  actionItems = [],
  exportSummary = null,
  meetingMap = new Map(),
  exportBlockedItems = [],
  isExporting = false,
  actionLoadingId = null,
  handleDownloadCsv,
  handleDownloadJson,
  handleDispatchBatchExport,
  handleDispatchGitHub,
  handleExportSingleItem,
  handleSingleGitHubDispatch,
  onNavigate,
}) {
  // Checkbox selection in Ready table
  const [selectedReadyIds, setSelectedReadyIds] = useState(new Set());

  // Secondary Export dropdown open state
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // Expandable evidence rows (taskId => boolean)
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState(new Set());

  // Confirm Dispatch Modal
  const [isConfirmDispatchOpen, setIsConfirmDispatchOpen] = useState(false);

  // Per-item result toast
  const [dispatchResultToast, setDispatchResultToast] = useState(null);

  // 1. Ready Items (commitments that are approved and not yet exported)
  const readyItems = useMemo(() => {
    return actionItems.filter(
      (i) => i.category === 'commitment' && i.approval_status === 'approved' && i.execution_status !== 'exported'
    );
  }, [actionItems]);

  // 2. Exported Items
  const exportedItems = useMemo(() => {
    return actionItems.filter(
      (i) => i.category === 'commitment' && i.execution_status === 'exported'
    );
  }, [actionItems]);

  // 3. Blocked Items with plain-English reasons
  const blockedItems = useMemo(() => {
    // If the server returned specific blocked evaluations from the last dispatch, show them
    if (exportBlockedItems && exportBlockedItems.length > 0) {
      return exportBlockedItems.map((b) => ({
        task_id: b.task_id,
        title: b.title || `Task #${b.task_id}`,
        reason:
          b.reason === 'approval_pending' || b.block_reason === 'approval_pending'
            ? 'Awaiting human approval before dispatch'
            : b.reason === 'item_rejected' || b.block_reason === 'item_rejected'
            ? 'Explicitly rejected by reviewer'
            : b.reason || b.block_reason || 'Blocked by firewall',
        type: b.reason === 'approval_pending' ? 'pending' : 'rejected',
      }));
    }

    // Otherwise, compute from commitments that are not approved and not exported
    return actionItems
      .filter(
        (i) => i.category === 'commitment' && i.approval_status !== 'approved' && i.execution_status !== 'exported'
      )
      .map((i) => {
        let reason = 'Awaiting human approval before dispatch';
        let type = 'pending';

        if (i.approval_status === 'rejected') {
          reason = 'Explicitly rejected by reviewer';
          type = 'rejected';
        } else if (!i.owner) {
          reason = 'Pending approval • Owner not yet assigned';
          type = 'amber';
        } else if (!i.due_date) {
          reason = 'Pending approval • Deadline not specified';
          type = 'amber';
        }

        return {
          task_id: i.task_id,
          title: i.title,
          owner: i.owner,
          due_date: i.due_date,
          reason,
          type,
        };
      });
  }, [actionItems, exportBlockedItems]);

  // Items to dispatch (either explicitly selected, or all ready items if none checked)
  const itemsToDispatch = useMemo(() => {
    if (selectedReadyIds.size > 0) {
      return readyItems.filter((i) => selectedReadyIds.has(i.task_id));
    }
    return readyItems;
  }, [readyItems, selectedReadyIds]);

  // Selection handlers
  const isAllReadySelected = readyItems.length > 0 && selectedReadyIds.size === readyItems.length;

  const handleToggleSelectAll = () => {
    if (isAllReadySelected) {
      setSelectedReadyIds(new Set());
    } else {
      setSelectedReadyIds(new Set(readyItems.map((i) => i.task_id)));
    }
  };

  const handleToggleSelectRow = (taskId, e) => {
    e.stopPropagation();
    setSelectedReadyIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleToggleExpandEvidence = (taskId) => {
    setExpandedEvidenceIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // Dispatch Confirmation Handler
  const handleConfirmAndDispatch = async () => {
    setIsConfirmDispatchOpen(false);
    if (!handleDispatchGitHub) return;

    try {
      const sentItems = [...itemsToDispatch];
      await handleDispatchGitHub();

      // Show per-item result toast
      setDispatchResultToast({
        type: 'success',
        count: sentItems.length,
        items: sentItems.map((item) => ({
          id: item.task_id,
          title: item.title,
          owner: item.owner || 'Unassigned',
        })),
      });

      setSelectedReadyIds(new Set());
    } catch (err) {
      setDispatchResultToast({
        type: 'error',
        count: 0,
        message: err.message || 'GitHub dispatch failed',
      });
    }
  };

  return (
    <div className="export-page-container">
      {/* TOP TWO-COLUMN LAYOUT */}
      <div className="export-two-column-grid">
        {/* LEFT COLUMN: Ready to Dispatch Table */}
        <div className="export-card">
          <div className="export-card-header">
            <div className="export-card-title-group">
              <h3 className="export-card-title">Ready to Dispatch</h3>
              <span className="count-pill">{readyItems.length}</span>
              {selectedReadyIds.size > 0 && (
                <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--accent-blue)', fontWeight: 600 }}>
                  ({selectedReadyIds.size} selected)
                </span>
              )}
            </div>

            <div className="export-header-actions">
              {/* Primary Dispatch to GitHub Issues Button */}
              {readyItems.length === 0 ? (
                <div
                  className="disabled-button-wrapper"
                  title="No approved commitments ready for dispatch. Approve items in Action Items first."
                >
                  <button
                    type="button"
                    className="btn-github-dispatch"
                    disabled
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span>Dispatch to GitHub Issues</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-github-dispatch"
                  onClick={() => setIsConfirmDispatchOpen(true)}
                  disabled={isExporting}
                  title={`Dispatch ${itemsToDispatch.length} approved commitment${itemsToDispatch.length === 1 ? '' : 's'} to GitHub Issues`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span>
                    {isExporting ? 'Dispatching...' : `Dispatch to GitHub Issues (${itemsToDispatch.length})`}
                  </span>
                </button>
              )}

              {/* Secondary Export Dropdown */}
              <div className="export-dropdown-container">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsExportDropdownOpen((prev) => !prev)}
                  title="Export options: CSV, JSON, Local Batch"
                >
                  <span>Export</span>
                  <span style={{ fontSize: '10px', marginLeft: '2px' }}>▾</span>
                </Button>

                {isExportDropdownOpen && (
                  <div className="export-dropdown-menu">
                    <button
                      type="button"
                      className="export-dropdown-item"
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        if (handleDownloadCsv) handleDownloadCsv();
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download CSV</span>
                    </button>

                    <button
                      type="button"
                      className="export-dropdown-item"
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        if (handleDownloadJson) handleDownloadJson();
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                      <span>Download JSON</span>
                    </button>

                    <div className="export-dropdown-divider" />

                    <button
                      type="button"
                      className="export-dropdown-item"
                      onClick={() => {
                        setIsExportDropdownOpen(false);
                        if (handleDispatchBatchExport) handleDispatchBatchExport();
                      }}
                      disabled={isExporting || readyItems.length === 0}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      <span>Local Batch Dispatch</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="export-table-container">
            {readyItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                  No commitments ready for dispatch
                </p>
                <p style={{ fontSize: '0.8rem', margin: '0 0 0.85rem 0' }}>
                  Commitments must be human-approved in the Action Items page before they can pass the Commitment Firewall.
                </p>
                {onNavigate && (
                  <Button size="sm" variant="primary" onClick={() => onNavigate('actions')}>
                    Review Action Items &rarr;
                  </Button>
                )}
              </div>
            ) : (
              <table className="clean-export-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllReadySelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all ready items"
                      />
                    </th>
                    <th>Commitment Title</th>
                    <th>Owner</th>
                    <th>Due Date</th>
                    <th>Meeting</th>
                    <th>Evidence Quote</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {readyItems.map((item) => {
                    const meeting = meetingMap.get(item.meeting_id);
                    const isSelected = selectedReadyIds.has(item.task_id);
                    const isEvidenceExpanded = expandedEvidenceIds.has(item.task_id);
                    const isItemLoading = actionLoadingId === item.task_id;

                    return (
                      <React.Fragment key={item.task_id}>
                        <tr className={isSelected ? 'selected' : ''}>
                          {/* Checkbox */}
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => handleToggleSelectRow(item.task_id, e)}
                              aria-label={`Select ${item.title}`}
                            />
                          </td>

                          {/* Title */}
                          <td>
                            <div className="export-item-title" title={item.title}>
                              {item.title}
                            </div>
                            {item.description && item.description !== item.title && (
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.description}
                              </div>
                            )}
                          </td>

                          {/* Owner */}
                          <td>
                            <span style={{ fontWeight: 600 }}>{item.owner || 'Unassigned'}</span>
                          </td>

                          {/* Due Date */}
                          <td>
                            <span>{item.due_date || 'No date'}</span>
                          </td>

                          {/* Meeting */}
                          <td>
                            <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)' }}>
                              {meeting ? meeting.title : item.meeting_id}
                            </span>
                          </td>

                          {/* Evidence with Tooltip & Toggle */}
                          <td>
                            {item.source_text ? (
                              <button
                                type="button"
                                className="evidence-pill-btn"
                                onClick={() => handleToggleExpandEvidence(item.task_id)}
                                title={item.source_text}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                                <span>{isEvidenceExpanded ? 'Hide quote' : 'View quote'}</span>
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>None</span>
                            )}
                          </td>

                          {/* Single Actions */}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="btn-export-action"
                                onClick={() => handleSingleGitHubDispatch && handleSingleGitHubDispatch(item.task_id)}
                                disabled={isItemLoading}
                                style={{ padding: '0.2rem 0.5rem', fontSize: '11px', backgroundColor: '#24292e', color: '#fff', border: 'none' }}
                                title="Dispatch single item to GitHub Issues"
                              >
                                {isItemLoading ? '...' : 'GitHub'}
                              </button>
                              <button
                                type="button"
                                className="btn-export-action"
                                onClick={() => handleExportSingleItem && handleExportSingleItem(item.task_id)}
                                disabled={isItemLoading}
                                style={{ padding: '0.2rem 0.5rem', fontSize: '11px' }}
                                title="Dispatch export locally"
                              >
                                {isItemLoading ? '...' : 'Export'}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expandable Evidence Quote Row */}
                        {isEvidenceExpanded && item.source_text && (
                          <tr>
                            <td colSpan={7} style={{ padding: '0.4rem 1rem 0.65rem 1rem', backgroundColor: 'var(--slate-50)' }}>
                              <div className="evidence-expanded-box">
                                <p className="evidence-expanded-quote">
                                  "{item.source_text}"
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Compact Summary & Blocked List */}
        <div className="export-card">
          <div className="export-card-header">
            <h4 className="export-card-title">Firewall &amp; Pipeline Status</h4>
          </div>

          {/* Compact Summary Pills */}
          <div className="summary-pills-row">
            <div className="summary-pill-box">
              <span className="summary-pill-val" style={{ color: 'var(--status-green)' }}>
                {readyItems.length}
              </span>
              <span className="summary-pill-label">Ready</span>
            </div>
            <div className="summary-pill-box">
              <span className="summary-pill-val" style={{ color: 'var(--accent-blue)' }}>
                {exportedItems.length}
              </span>
              <span className="summary-pill-label">Exported</span>
            </div>
            <div className="summary-pill-box">
              <span className="summary-pill-val" style={{ color: 'var(--status-red)' }}>
                {blockedItems.length}
              </span>
              <span className="summary-pill-label">Blocked</span>
            </div>
          </div>

          {/* Short Blocked List with Plain-English Reasons */}
          <div style={{ padding: '0.75rem 1rem 0.35rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--font-size-12)', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Blocked Commitments ({blockedItems.length})
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Protected from execution</span>
          </div>

          <div className="blocked-items-list">
            {blockedItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem', color: 'var(--text-muted)' }}>
                <p style={{ fontWeight: 600, color: 'var(--status-green)', fontSize: '0.85rem', margin: 0 }}>
                  No Blocked Commitments
                </p>
                <p style={{ fontSize: '11px', marginTop: '0.2rem' }}>
                  All confirmed commitments are either approved or already dispatched.
                </p>
              </div>
            ) : (
              blockedItems.slice(0, 6).map((item, idx) => (
                <div key={item.task_id || idx} className="blocked-item-card">
                  <div className="blocked-item-top">
                    <span className="blocked-item-title" title={item.title}>
                      {item.title}
                    </span>
                    <span className={`blocked-reason-tag ${item.type}`}>
                      {item.type === 'rejected' ? 'Rejected' : 'Pending'}
                    </span>
                  </div>
                  <span className="blocked-meta-sub">
                    {item.reason}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* BELOW: Exported Table */}
      <div className="export-card">
        <div className="export-card-header">
          <div className="export-card-title-group">
            <h3 className="export-card-title">Exported Commitments Pipeline</h3>
            <span className="count-pill">{exportedItems.length}</span>
          </div>
          <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-muted)' }}>
            Confirmed commitments successfully dispatched downstream
          </span>
        </div>

        <div className="export-table-container">
          {exportedItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
              <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                No exported commitments yet
              </p>
              <p style={{ fontSize: '0.8rem', margin: 0 }}>
                Approved commitments dispatched to GitHub or local export pipeline will appear here with issue references.
              </p>
            </div>
          ) : (
            <table className="clean-export-table">
              <thead>
                <tr>
                  <th>Commitment</th>
                  <th>Meeting</th>
                  <th>Owner</th>
                  <th>Exported Date</th>
                  <th>Status</th>
                  <th>Issue Link</th>
                </tr>
              </thead>
              <tbody>
                {exportedItems.map((item) => {
                  const meeting = meetingMap.get(item.meeting_id);
                  return (
                    <tr key={item.task_id}>
                      <td>
                        <div className="export-item-title" title={item.title}>
                          {item.title}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)' }}>
                          {meeting ? meeting.title : item.meeting_id}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{item.owner || 'Unassigned'}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-secondary)' }}>
                          {item.exported_at ? new Date(item.exported_at).toLocaleDateString() : 'Exported'}
                        </span>
                      </td>
                      <td>
                        <StatusChip type="execution" status="exported" label="Exported" />
                      </td>
                      <td>
                        {item.external_url ? (
                          <a
                            href={item.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="github-issue-link"
                            title="Open issue on GitHub"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                            <span>{item.external_id || 'GitHub Issue'} ↗</span>
                          </a>
                        ) : (
                          <span className="local-exported-tag">Local Export</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* CONFIRM DISPATCH MODAL */}
      <Modal
        isOpen={isConfirmDispatchOpen}
        onClose={() => setIsConfirmDispatchOpen(false)}
        title="Confirm GitHub Issues Dispatch"
        maxWidth="540px"
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setIsConfirmDispatchOpen(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleConfirmAndDispatch}
              loading={isExporting}
            >
              Confirm &amp; Dispatch ({itemsToDispatch.length})
            </Button>
          </>
        }
      >
        <div className="dispatch-dialog-content">
          <p className="dispatch-dialog-desc">
            The following <strong>{itemsToDispatch.length} approved commitment{itemsToDispatch.length === 1 ? '' : 's'}</strong> will be created as GitHub Issues with verbatim transcript evidence:
          </p>

          <div className="dispatch-items-preview">
            {itemsToDispatch.map((item) => (
              <div key={item.task_id} className="dispatch-preview-row">
                <span className="dispatch-preview-title">{item.title}</span>
                <div className="dispatch-preview-meta">
                  <span>Owner: <strong>{item.owner || 'Unassigned'}</strong></span>
                  {item.due_date && <span>Due: <strong>{item.due_date}</strong></span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* PER-ITEM RESULT TOAST */}
      {dispatchResultToast && (
        <div className="dispatch-results-toast">
          <div className="toast-header-row">
            <span className="toast-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--status-green)' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>GitHub Dispatch Completed</span>
            </span>
            <button
              type="button"
              className="active-chip-remove"
              onClick={() => setDispatchResultToast(null)}
              aria-label="Dismiss toast"
            >
              &times;
            </button>
          </div>
          <p style={{ fontSize: 'var(--font-size-12)', margin: '0 0 0.5rem 0', color: 'var(--text-main)' }}>
            Successfully dispatched {dispatchResultToast.count} commitment{dispatchResultToast.count === 1 ? '' : 's'} to GitHub Issues:
          </p>
          {dispatchResultToast.items && (
            <ul className="toast-item-list">
              {dispatchResultToast.items.map((i) => (
                <li key={i.id}>
                  • <strong>{i.title}</strong> (Owner: {i.owner})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
