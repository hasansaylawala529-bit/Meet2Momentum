import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import TranscriptWorkspace from './components/TranscriptWorkspace';
import MeetingHistory from './components/MeetingHistory';
import {
  checkBackendHealth,
  fetchMeetings,
  fetchDecisions,
  fetchActionItems,
  extractMeetingOutcomes,
  approveActionItem,
  rejectActionItem,
  updateActionItem,
  fetchExportSummary,
  dispatchExport,
  exportSingleActionItem,
  downloadExportCsv,
  downloadExportJson,
  fetchTrackingDashboard,
  fetchWorkspaceAuditLog,
  fetchTaskHistory,
  updateTaskProgress,
} from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Core Data States
  const [meetings, setMeetings] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [actionItems, setActionItems] = useState([]);

  // Loading States
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [isLoadingOutcomes, setIsLoadingOutcomes] = useState(false);
  const [meetingsError, setMeetingsError] = useState('');

  // Processing & Feedback States
  const [processingMeetingId, setProcessingMeetingId] = useState(null);
  const [extractionErrors, setExtractionErrors] = useState({});
  const [globalNotice, setGlobalNotice] = useState(null);
  const [activeActionCategory, setActiveActionCategory] = useState('all');
  const [actionApprovalFilter, setActionApprovalFilter] = useState('all');
  const [taskProgressFilter, setTaskProgressFilter] = useState('all');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    owner: '',
    due_date: '',
  });
  const [confirmRejectTaskId, setConfirmRejectTaskId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Phase 4: Execution & Export States
  const [exportSummary, setExportSummary] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportBlockedItems, setExportBlockedItems] = useState([]);

  // Phase 5: Tracking & Accountability States
  const [trackingData, setTrackingData] = useState(null);
  const [historyModalTask, setHistoryModalTask] = useState(null);
  const [selectedTaskHistory, setSelectedTaskHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [updatingProgressTaskId, setUpdatingProgressTaskId] = useState(null);

  // Fast meeting lookup map
  const meetingMap = useMemo(() => {
    return new Map(meetings.map((m) => [m.meeting_id, m]));
  }, [meetings]);

  // Aggregate extraction stats per meeting
  const processedMeetingStats = useMemo(() => {
    const stats = {};
    for (const d of decisions) {
      if (!stats[d.meeting_id]) {
        stats[d.meeting_id] = { decisions: 0, commitments: 0, suggestions: 0, unresolved: 0 };
      }
      stats[d.meeting_id].decisions += 1;
    }
    for (const a of actionItems) {
      if (!stats[a.meeting_id]) {
        stats[a.meeting_id] = { decisions: 0, commitments: 0, suggestions: 0, unresolved: 0 };
      }
      if (a.category === 'commitment') stats[a.meeting_id].commitments += 1;
      else if (a.category === 'suggestion') stats[a.meeting_id].suggestions += 1;
      else if (a.category === 'unresolved_question') stats[a.meeting_id].unresolved += 1;
    }
    return stats;
  }, [decisions, actionItems]);

  // Backend sync functions
  const loadMeetingsData = useCallback(async () => {
    setIsLoadingMeetings(true);
    setMeetingsError('');
    try {
      const data = await fetchMeetings();
      setMeetings(data);
      setIsConnected(true);
    } catch (err) {
      setMeetingsError(err.message || 'Unable to load meeting records.');
      setIsConnected(false);
    } finally {
      setIsLoadingMeetings(false);
      setIsCheckingHealth(false);
    }
  }, []);

  const loadExportSummaryData = useCallback(async () => {
    try {
      const summary = await fetchExportSummary();
      setExportSummary(summary);
    } catch (err) {
      console.error('Failed to load export summary:', err);
    }
  }, []);

  const loadTrackingData = useCallback(async () => {
    try {
      const tracking = await fetchTrackingDashboard();
      setTrackingData(tracking);
    } catch (err) {
      console.error('Failed to load tracking dashboard:', err);
    }
  }, []);

  const loadOutcomesData = useCallback(async () => {
    setIsLoadingOutcomes(true);
    try {
      const [decisionsData, actionsData, summaryData, tracking] = await Promise.all([
        fetchDecisions(),
        fetchActionItems(),
        fetchExportSummary().catch(() => null),
        fetchTrackingDashboard().catch(() => null),
      ]);
      setDecisions(decisionsData);
      setActionItems(actionsData);
      if (summaryData) setExportSummary(summaryData);
      if (tracking) setTrackingData(tracking);
    } catch (err) {
      console.error('Failed to load meeting outcomes:', err);
    } finally {
      setIsLoadingOutcomes(false);
    }
  }, []);

  useEffect(() => {
    checkBackendHealth()
      .then(() => {
        setIsConnected(true);
        loadMeetingsData();
        loadOutcomesData();
      })
      .catch(() => {
        setIsConnected(false);
        setIsCheckingHealth(false);
      });
  }, [loadMeetingsData, loadOutcomesData]);

  const handleMeetingSaved = (newMeeting) => {
    setMeetings((prev) => [newMeeting, ...prev]);
  };

  // AI Meeting Intelligence Extraction Handler
  const handleProcessMeeting = async (meeting) => {
    setProcessingMeetingId(meeting.meeting_id);
    setExtractionErrors((prev) => {
      const copy = { ...prev };
      delete copy[meeting.meeting_id];
      return copy;
    });
    setGlobalNotice(null);

    try {
      const result = await extractMeetingOutcomes(meeting.meeting_id);
      // Reload outcomes and meetings from backend SQLite database
      await Promise.all([loadMeetingsData(), loadOutcomesData()]);

      setGlobalNotice({
        type: 'success',
        message: `Extracted ${result.total_decisions} decisions and ${result.total_action_items} action items (${result.commitments_count} confirmed commitments) from "${meeting.title}". AI proposes. Humans approve.`,
      });
    } catch (err) {
      const msg = err.message || 'AI extraction failed.';
      setExtractionErrors((prev) => ({
        ...prev,
        [meeting.meeting_id]: msg,
      }));
      setGlobalNotice({
        type: 'error',
        message: `Extraction failed for "${meeting.title}": ${msg}`,
      });
    } finally {
      setProcessingMeetingId(null);
    }
  };

  // Phase 3: Human Approval and Action Item Editing Handlers
  const handleApproveItem = async (taskId) => {
    setActionLoadingId(taskId);
    try {
      const updated = await approveActionItem(taskId);
      setActionItems((prev) =>
        prev.map((item) => (item.task_id === taskId ? updated : item))
      );
      loadExportSummaryData();
      setGlobalNotice({
        type: 'success',
        message: `Action item approved. Commitment Firewall: Eligible for execution.`,
      });
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `Approval failed: ${err.message}`,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectItem = async (taskId) => {
    setActionLoadingId(taskId);
    setConfirmRejectTaskId(null);
    try {
      const updated = await rejectActionItem(taskId);
      setActionItems((prev) =>
        prev.map((item) => (item.task_id === taskId ? updated : item))
      );
      loadExportSummaryData();
      setGlobalNotice({
        type: 'success',
        message: `Action item rejected. Commitment Firewall: Blocked from execution.`,
      });
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `Rejection failed: ${err.message}`,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleStartEdit = (item) => {
    setEditingTaskId(item.task_id);
    setEditFormData({
      title: item.title || '',
      description: item.description || '',
      owner: item.owner || '',
      due_date: item.due_date || '',
    });
    setConfirmRejectTaskId(null);
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditFormData({
      title: '',
      description: '',
      owner: '',
      due_date: '',
    });
  };

  const handleSaveEdit = async (taskId) => {
    if (!editFormData.title.trim()) {
      setGlobalNotice({
        type: 'error',
        message: 'Action item title cannot be empty.',
      });
      return;
    }

    setActionLoadingId(taskId);
    try {
      const updated = await updateActionItem(taskId, editFormData);
      setActionItems((prev) =>
        prev.map((item) => (item.task_id === taskId ? updated : item))
      );
      setEditingTaskId(null);
      loadExportSummaryData();
      const isResetToPending = updated.approval_status === 'pending';
      setGlobalNotice({
        type: 'success',
        message: isResetToPending
          ? `Changes saved. Material edits reset item back to Pending Review for human re-approval.`
          : `Action item updated successfully.`,
      });
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `Failed to update action item: ${err.message}`,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Phase 4: Execution & Export Engine Handlers
  const handleExportSingleItem = async (taskId) => {
    setActionLoadingId(taskId);
    try {
      const result = await exportSingleActionItem(taskId);
      setActionItems((prev) =>
        prev.map((item) => (item.task_id === taskId ? result.item : item))
      );
      await loadExportSummaryData();
      setGlobalNotice({
        type: 'success',
        message: `Commitment "${result.item.title}" successfully dispatched to downstream execution!`,
      });
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `Export blocked by Commitment Firewall: ${err.message}`,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDispatchBatchExport = async () => {
    setIsExporting(true);
    setExportBlockedItems([]);
    try {
      const result = await dispatchExport();
      await Promise.all([loadOutcomesData(), loadExportSummaryData()]);
      if (result.blocked_items && result.blocked_items.length > 0) {
        setExportBlockedItems(result.blocked_items);
        setGlobalNotice({
          type: 'success',
          message: `Dispatched ${result.dispatched_count} approved commitments. Note: ${result.blocked_items.length} unapproved items were protected and blocked by Commitment Firewall.`,
        });
      } else {
        setGlobalNotice({
          type: 'success',
          message: `Successfully dispatched all ${result.dispatched_count} approved commitments to execution!`,
        });
      }
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `Export dispatch failed: ${err.message}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadCsv = async (meetingId = null) => {
    try {
      await downloadExportCsv(meetingId);
      setGlobalNotice({
        type: 'success',
        message: 'Commitments CSV export downloaded successfully.',
      });
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `CSV download failed: ${err.message}`,
      });
    }
  };

  const handleDownloadJson = async (meetingId = null) => {
    try {
      await downloadExportJson(meetingId);
      setGlobalNotice({
        type: 'success',
        message: 'Commitments JSON export downloaded successfully.',
      });
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `JSON download failed: ${err.message}`,
      });
    }
  };

  // Phase 5: Progress Update & History Handlers
  const handleUpdateTaskProgress = async (taskId, newStatus, note = null) => {
    setUpdatingProgressTaskId(taskId);
    try {
      const updated = await updateTaskProgress(taskId, newStatus, note);
      setActionItems((prev) =>
        prev.map((item) => (item.task_id === taskId ? updated : item))
      );
      loadTrackingData();
      loadExportSummaryData();
      const statusLabel = newStatus === 'in_progress' ? 'In Progress' : newStatus === 'completed' ? 'Completed' : 'Pending';
      setGlobalNotice({
        type: 'success',
        message: `Task progress updated to "${statusLabel}". Transition recorded in audit history.`,
      });
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: err.message || 'Failed to update task progress.',
      });
    } finally {
      setUpdatingProgressTaskId(null);
    }
  };

  const handleOpenTaskHistory = async (task) => {
    setHistoryModalTask(task);
    setIsLoadingHistory(true);
    try {
      const history = await fetchTaskHistory(task.task_id);
      setSelectedTaskHistory(history);
    } catch (err) {
      console.error('Failed to load task history:', err);
      setSelectedTaskHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleCloseTaskHistory = () => {
    setHistoryModalTask(null);
    setSelectedTaskHistory([]);
  };

  // Filtered Action Items by Category, Approval Status, AND Execution Progress
  const filteredActionItems = useMemo(() => {
    return actionItems.filter((i) => {
      const matchesCategory =
        activeActionCategory === 'all' || i.category === activeActionCategory;
      const matchesApproval =
        actionApprovalFilter === 'all' || i.approval_status === actionApprovalFilter;
      const matchesProgress =
        taskProgressFilter === 'all'
          ? true
          : taskProgressFilter === 'overdue'
          ? Boolean(i.is_overdue)
          : (i.task_status || 'pending') === taskProgressFilter;
      return matchesCategory && matchesApproval && matchesProgress;
    });
  }, [actionItems, activeActionCategory, actionApprovalFilter, taskProgressFilter]);

  // Derived counts for overview metrics & filters
  const confirmedCommitmentsCount = useMemo(() => {
    return actionItems.filter((i) => i.category === 'commitment').length;
  }, [actionItems]);

  const approvedCommitmentsCount = useMemo(() => {
    return actionItems.filter(
      (i) => i.category === 'commitment' && i.approval_status === 'approved'
    ).length;
  }, [actionItems]);

  const pendingReviewCount = useMemo(() => {
    return actionItems.filter((i) => i.approval_status === 'pending').length;
  }, [actionItems]);

  const approvedTotalCount = useMemo(() => {
    return actionItems.filter((i) => i.approval_status === 'approved').length;
  }, [actionItems]);

  const rejectedTotalCount = useMemo(() => {
    return actionItems.filter((i) => i.approval_status === 'rejected').length;
  }, [actionItems]);

  const overdueItemsCount = useMemo(() => {
    return trackingData?.overdue_count ?? actionItems.filter((i) => i.is_overdue).length;
  }, [trackingData, actionItems]);

  const followUpsList = useMemo(() => {
    return actionItems.filter(
      (i) => i.category === 'unresolved_question' || i.clarification_required
    );
  }, [actionItems]);

  return (
    <div className="saas-app-layout">
      {/* Colorful Light Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        meetingCount={meetings.length}
        decisionCount={decisions.length}
        actionCount={actionItems.length}
        followupCount={followUpsList.length}
        exportCount={exportSummary?.pending_export_count || 0}
        overdueCount={overdueItemsCount}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Viewport */}
      <div className="saas-main-viewport">
        <Header
          activeTab={activeTab}
          isConnected={isConnected}
          isChecking={isCheckingHealth}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onNewMeetingClick={() => setActiveTab('meetings')}
        />

        <main className="saas-page-content">
          {/* Global Notification Banner */}
          {globalNotice && (
            <div className={`global-notice-bar ${globalNotice.type}`} role="status">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {globalNotice.type === 'success' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
                <span>{globalNotice.message}</span>
              </div>
              <button
                type="button"
                className="notice-dismiss-btn"
                onClick={() => setGlobalNotice(null)}
                title="Dismiss message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="overview-container">
              {/* Product Hero Banner */}
              <div className="overview-hero-card">
                <div className="hero-content">
                  <h2 className="hero-title">Meeting-to-Execution Workspace</h2>
                  <p className="hero-desc">
                    Capture meeting discussions, identify confirmed decisions, and turn commitments into trackable action items with human approval.
                  </p>
                </div>
                <div className="hero-action-box">
                  <button
                    type="button"
                    className="saas-btn saas-btn-primary"
                    onClick={() => setActiveTab('meetings')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>Add Meeting Transcript</span>
                  </button>
                </div>
              </div>

              {/* Meaningful Colored Metric Cards */}
              <div className="metrics-grid">
                <div className="metric-card theme-teal">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-teal)' }}>TOTAL MEETINGS</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">{meetings.length}</div>
                  <div className="metric-footer">Recorded in workspace</div>
                </div>

                <div className="metric-card theme-lavender">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-lavender)' }}>DECISIONS</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 14 14" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">{decisions.length}</div>
                  <div className="metric-footer">{decisions.length > 0 ? 'Extracted from transcripts' : 'Awaiting meeting processing'}</div>
                </div>

                <div className="metric-card theme-green">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-green)' }}>CONFIRMED COMMITMENTS</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-mint)', color: 'var(--color-green)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">{confirmedCommitmentsCount}</div>
                  <div className="metric-footer">{confirmedCommitmentsCount > 0 ? `${approvedCommitmentsCount} approved by reviewer` : 'Awaiting meeting processing'}</div>
                </div>

                <div className="metric-card theme-blue">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-blue)' }}>PENDING REVIEW</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-blue)', color: 'var(--color-blue)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">{pendingReviewCount}</div>
                  <div className="metric-footer">{pendingReviewCount > 0 ? 'Awaiting human approval' : 'All items reviewed'}</div>
                </div>

                <div className="metric-card theme-amber">
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-amber)' }}>PENDING FOLLOW-UPS</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-amber)', color: 'var(--color-amber)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">{followUpsList.length}</div>
                  <div className="metric-footer">{followUpsList.length > 0 ? 'Requires owner or date confirmation' : 'No unresolved items'}</div>
                </div>

                <div 
                  className="metric-card theme-blue" 
                  style={{ cursor: 'pointer' }}
                  onClick={() => setActiveTab('export')}
                  title="Click to view Execution & Export Center"
                >
                  <div className="metric-header">
                    <span className="metric-label" style={{ color: 'var(--color-blue)' }}>READY TO EXPORT</span>
                    <div className="metric-icon-box" style={{ backgroundColor: 'var(--bg-pale-blue)', color: 'var(--color-blue)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </div>
                  </div>
                  <div className="metric-value">{exportSummary?.pending_export_count || 0}</div>
                  <div className="metric-footer">
                    {exportSummary?.exported_count ? `${exportSummary.exported_count} already exported` : 'Firewall-cleared commitments'}
                  </div>
                </div>
              </div>

              {/* Recent Meetings Table */}
              <div className="panel-card" style={{ marginBottom: '1.5rem', borderTop: '3px solid var(--color-teal)' }}>
                <div className="panel-card-header">
                  <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 className="panel-title">Recent Meetings</h3>
                    <p className="panel-subtitle">Latest transcripts and notes added to the workspace</p>
                  </div>
                  {meetings.length > 0 && (
                    <button
                      type="button"
                      className="saas-btn saas-btn-secondary saas-btn-sm"
                      onClick={() => setActiveTab('meetings')}
                    >
                      View All Meetings &rarr;
                    </button>
                  )}
                </div>

                <div className="panel-card-body">
                  {meetings.length === 0 ? (
                    <div className="saas-empty-state">
                      <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                      </div>
                      <h4 className="empty-state-title">No Meetings Added Yet</h4>
                      <p className="empty-state-desc">
                        Add your first meeting transcript or notes to view records and begin tracking outcomes.
                      </p>
                      <button
                        type="button"
                        className="saas-btn saas-btn-primary saas-btn-sm"
                        style={{ marginTop: '0.85rem' }}
                        onClick={() => setActiveTab('meetings')}
                      >
                        Add Meeting Transcript
                      </button>
                    </div>
                  ) : (
                    <div className="recent-meetings-table-wrapper">
                      <table className="saas-table">
                        <thead>
                          <tr>
                            <th>Meeting Title</th>
                            <th>Reference</th>
                            <th>Meeting Date</th>
                            <th>AI Outcomes</th>
                            <th>Date Added</th>
                          </tr>
                        </thead>
                        <tbody>
                          {meetings.slice(0, 5).map((m) => {
                            const stats = processedMeetingStats[m.meeting_id];
                            return (
                              <tr key={m.meeting_id}>
                                <td style={{ fontWeight: 600, color: 'var(--text-main)' }}>{m.title}</td>
                                <td><code className="id-code-pill">{m.meeting_id}</code></td>
                                <td>{m.meeting_date || '—'}</td>
                                <td>
                                  {stats ? (
                                    <span className="badge-category commitment" style={{ textTransform: 'none' }}>
                                      ✓ {stats.decisions} dec, {stats.commitments} com
                                    </span>
                                  ) : (
                                    <span className="status-badge-recorded">Ready to extract</span>
                                  )}
                                </td>
                                <td>{new Date(m.created_at).toLocaleDateString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Workflow Banner */}
              <div className="overview-workflow-banner">
                <div className="workflow-banner-title">How Meet2Momentum Works</div>
                <div className="workflow-steps-row">
                  <div className="workflow-step-item">
                    <div className="step-circle circle-teal">1</div>
                    <div className="step-label">Add Transcript</div>
                    <div className="step-sublabel">Paste notes or upload .txt</div>
                  </div>
                  <div className="workflow-step-divider">&rarr;</div>
                  <div className="workflow-step-item">
                    <div className="step-circle circle-lavender">2</div>
                    <div className="step-label">Extract Outcomes</div>
                    <div className="step-sublabel">Gemini AI grounded extraction</div>
                  </div>
                  <div className="workflow-step-divider">&rarr;</div>
                  <div className="workflow-step-item">
                    <div className="step-circle circle-blue">3</div>
                    <div className="step-label">Review & Approve</div>
                    <div className="step-sublabel">Confirm owners & dates</div>
                  </div>
                  <div className="workflow-step-divider">&rarr;</div>
                  <div className="workflow-step-item">
                    <div className="step-circle circle-amber">4</div>
                    <div className="step-label">Track Follow-ups</div>
                    <div className="step-sublabel">Monitor execution</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MEETINGS */}
          {activeTab === 'meetings' && (
            <div className="meetings-workspace-grid">
              <TranscriptWorkspace onMeetingSaved={handleMeetingSaved} />
              <MeetingHistory
                meetings={meetings}
                isLoading={isLoadingMeetings}
                error={meetingsError}
                onRefresh={loadMeetingsData}
                onProcessMeeting={handleProcessMeeting}
                processingMeetingId={processingMeetingId}
                processedMeetingStats={processedMeetingStats}
                extractionErrors={extractionErrors}
              />
            </div>
          )}

          {/* TAB 3: DECISIONS */}
          {activeTab === 'decisions' && (
            <div className="feature-workspace-container">
              <div className="panel-card" style={{ borderTop: '3px solid var(--color-lavender)' }}>
                <div className="panel-card-header">
                  <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 14 14" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h2 className="panel-title">Decisions Log</h2>
                      <span className="count-pill">{decisions.length}</span>
                    </div>
                    <p className="panel-subtitle">Agreed decisions supported by verbatim evidence from meeting transcripts</p>
                  </div>
                </div>

                <div className="panel-card-body">
                  {decisions.length === 0 ? (
                    <div className="saas-empty-state">
                      <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </div>
                      <h3 className="empty-state-title">No Decisions Extracted Yet</h3>
                      <p className="empty-state-desc">
                        Select a saved meeting in the Meetings Workspace and click "Process with AI" to extract confirmed decisions with exact transcript citations.
                      </p>
                      <button
                        type="button"
                        className="saas-btn saas-btn-primary saas-btn-sm"
                        style={{ marginTop: '1rem' }}
                        onClick={() => setActiveTab('meetings')}
                      >
                        Go to Meetings Workspace
                      </button>
                    </div>
                  ) : (
                    <div className="outcomes-stream">
                      {decisions.map((dec) => {
                        const meeting = meetingMap.get(dec.meeting_id);
                        return (
                          <div key={dec.decision_id} className="outcome-card card-decision">
                            <div className="outcome-card-header">
                              <div className="outcome-card-title-group">
                                <h3 className="outcome-title">{dec.title}</h3>
                                <div className="outcome-meeting-ref">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                  <span>From: <strong>{meeting ? meeting.title : dec.meeting_id}</strong></span>
                                  {meeting?.meeting_date && <span>• {meeting.meeting_date}</span>}
                                </div>
                              </div>
                              <div className="outcome-meta-badges">
                                {dec.evidence_verified ? (
                                  <span className="evidence-badge verified" title="Evidence matched verbatim in original transcript">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    <span>Grounded in Transcript</span>
                                  </span>
                                ) : (
                                  <span className="evidence-badge unverified" title="Evidence excerpt could not be directly verified">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="12" y1="8" x2="12" y2="12" />
                                    </svg>
                                    <span>Evidence Unverified</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Rationale if present */}
                            {dec.rationale && (
                              <div className="outcome-rationale-box">
                                <strong>Supporting Rationale:</strong> {dec.rationale}
                              </div>
                            )}

                            {/* Quoted Verbatim Evidence Excerpt */}
                            {dec.source_text && (
                              <div className="evidence-quote-box">
                                <div className="evidence-header">
                                  <span>Transcript Evidence</span>
                                  <span>DEC ID: {dec.decision_id}</span>
                                </div>
                                <blockquote className="evidence-quote-text">
                                  "{dec.source_text}"
                                </blockquote>
                              </div>
                            )}

                            <div className="outcome-card-footer">
                              <span>Recorded {new Date(dec.created_at).toLocaleDateString()}</span>
                              <span>Decision ID: {dec.decision_id}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ACTION ITEMS */}
          {activeTab === 'actions' && (
            <div className="feature-workspace-container">
              <div className="panel-card" style={{ borderTop: '3px solid var(--color-green)' }}>
                <div className="panel-card-header">
                  <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-mint)', color: 'var(--color-green)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 11 12 14 22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h2 className="panel-title">Action Items & Commitments</h2>
                      <span className="count-pill">{actionItems.length}</span>
                    </div>
                    <p className="panel-subtitle">Categorized outcomes: confirmed commitments, suggestions, and unresolved questions</p>
                  </div>
                </div>

                <div className="panel-card-body">
                  {/* Category Guide Cards */}
                  <div className="categories-guide-grid">
                    <div className="category-guide-card guide-commitment">
                      <span className="category-dot green" />
                      <div>
                        <strong>Confirmed Commitments</strong>
                        <p>Explicit undertakings and agreed responsibilities</p>
                      </div>
                    </div>
                    <div className="category-guide-card guide-suggestion">
                      <span className="category-dot peach" />
                      <div>
                        <strong>Suggestions & Ideas</strong>
                        <p>Exploratory proposals requiring team agreement</p>
                      </div>
                    </div>
                    <div className="category-guide-card guide-unresolved">
                      <span className="category-dot amber" />
                      <div>
                        <strong>Unresolved Questions</strong>
                        <p>Open questions needing owner or deadline clarification</p>
                      </div>
                    </div>
                  </div>

                  {/* Category Filter Toolbar */}
                  <div className="filter-toolbar">
                    <div className="filter-pills-cluster">
                      <button
                        type="button"
                        className={`filter-pill ${activeActionCategory === 'all' ? 'active' : ''}`}
                        onClick={() => setActiveActionCategory('all')}
                      >
                        All Categories ({actionItems.length})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${activeActionCategory === 'commitment' ? 'active theme-green' : ''}`}
                        onClick={() => setActiveActionCategory('commitment')}
                      >
                        Commitments ({actionItems.filter((i) => i.category === 'commitment').length})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${activeActionCategory === 'suggestion' ? 'active theme-peach' : ''}`}
                        onClick={() => setActiveActionCategory('suggestion')}
                      >
                        Suggestions ({actionItems.filter((i) => i.category === 'suggestion').length})
                      </button>
                      <button
                        type="button"
                        className={`filter-pill ${activeActionCategory === 'unresolved_question' ? 'active theme-amber' : ''}`}
                        onClick={() => setActiveActionCategory('unresolved_question')}
                      >
                        Unresolved Questions ({actionItems.filter((i) => i.category === 'unresolved_question').length})
                      </button>
                    </div>

                    <div style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                      Core Principle: <em>AI proposes. Humans approve.</em>
                    </div>
                  </div>

                  {/* Human Approval Status Filter Toolbar */}
                  <div className="filter-toolbar" style={{ marginTop: '0.5rem', paddingTop: '0.65rem', borderTop: '1px dashed var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Approval Status:
                      </span>
                      <div className="filter-pills-cluster">
                        <button
                          type="button"
                          className={`filter-pill ${actionApprovalFilter === 'all' ? 'active' : ''}`}
                          onClick={() => setActionApprovalFilter('all')}
                        >
                          All ({actionItems.length})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill ${actionApprovalFilter === 'pending' ? 'active theme-blue' : ''}`}
                          onClick={() => setActionApprovalFilter('pending')}
                        >
                          Pending Review ({pendingReviewCount})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill ${actionApprovalFilter === 'approved' ? 'active theme-green' : ''}`}
                          onClick={() => setActionApprovalFilter('approved')}
                        >
                          Approved ({approvedTotalCount})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill ${actionApprovalFilter === 'rejected' ? 'active' : ''}`}
                          style={actionApprovalFilter === 'rejected' ? { backgroundColor: 'var(--bg-pale-red)', color: 'var(--color-red)', borderColor: 'var(--border-red)' } : {}}
                          onClick={() => setActionApprovalFilter('rejected')}
                        >
                          Rejected ({rejectedTotalCount})
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.775rem', color: 'var(--color-teal)', fontWeight: 500 }}>
                      Commitment Firewall: <strong>Deterministic Verification</strong>
                    </div>
                  </div>

                  {/* Phase 5: Execution Progress Filter Toolbar */}
                  <div className="filter-toolbar" style={{ marginTop: '0.5rem', paddingTop: '0.65rem', borderTop: '1px dashed var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Execution Progress:
                      </span>
                      <div className="filter-pills-cluster">
                        <button
                          type="button"
                          className={`filter-pill ${taskProgressFilter === 'all' ? 'active' : ''}`}
                          onClick={() => setTaskProgressFilter('all')}
                        >
                          All ({actionItems.length})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill ${taskProgressFilter === 'pending' ? 'active' : ''}`}
                          onClick={() => setTaskProgressFilter('pending')}
                        >
                          Pending ({actionItems.filter((i) => (i.task_status || 'pending') === 'pending').length})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill ${taskProgressFilter === 'in_progress' ? 'active theme-blue' : ''}`}
                          onClick={() => setTaskProgressFilter('in_progress')}
                        >
                          In Progress ({actionItems.filter((i) => i.task_status === 'in_progress').length})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill ${taskProgressFilter === 'completed' ? 'active theme-green' : ''}`}
                          onClick={() => setTaskProgressFilter('completed')}
                        >
                          Completed ({actionItems.filter((i) => i.task_status === 'completed').length})
                        </button>
                        <button
                          type="button"
                          className={`filter-pill ${taskProgressFilter === 'overdue' ? 'active' : ''}`}
                          style={taskProgressFilter === 'overdue' ? { backgroundColor: 'var(--bg-pale-red)', color: 'var(--color-red)', borderColor: 'var(--border-red)' } : {}}
                          onClick={() => setTaskProgressFilter('overdue')}
                        >
                          ⚠️ Overdue ({overdueItemsCount})
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.775rem', color: 'var(--color-lavender)', fontWeight: 500 }}>
                      Completion Rate: <strong>{trackingData ? `${trackingData.completion_rate_percent}%` : 'Calculating...'}</strong>
                    </div>
                  </div>

                  {filteredActionItems.length === 0 ? (
                    <div className="saas-empty-state">
                      <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-mint)', color: 'var(--color-green)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 11 12 14 22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                      </div>
                      <h3 className="empty-state-title">No Items Match The Selected Filters</h3>
                      <p className="empty-state-desc">
                        {actionItems.length === 0
                          ? 'Add a meeting transcript and click "Process with AI" to extract categorized action items.'
                          : 'Try selecting a different category or approval filter above to view items.'}
                      </p>
                      {actionItems.length === 0 && (
                        <button
                          type="button"
                          className="saas-btn saas-btn-primary saas-btn-sm"
                          style={{ marginTop: '1rem' }}
                          onClick={() => setActiveTab('meetings')}
                        >
                          Add Meeting Transcript
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="outcomes-stream">
                      {filteredActionItems.map((item) => {
                        const meeting = meetingMap.get(item.meeting_id);
                        const cardThemeClass =
                          item.category === 'commitment'
                            ? 'card-commitment'
                            : item.category === 'suggestion'
                            ? 'card-suggestion'
                            : 'card-unresolved';

                        const isEditing = editingTaskId === item.task_id;
                        const isConfirmingReject = confirmRejectTaskId === item.task_id;
                        const isItemLoading = actionLoadingId === item.task_id;
                        const isApproved = item.approval_status === 'approved';
                        const isRejected = item.approval_status === 'rejected';
                        const isPending = !isApproved && !isRejected;

                        return (
                          <div key={item.task_id} className={`outcome-card ${cardThemeClass}`}>
                            <div className="outcome-card-header">
                              <div className="outcome-card-title-group">
                                <h3 className="outcome-title">{item.title}</h3>
                                <div className="outcome-meeting-ref">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                  <span>From: <strong>{meeting ? meeting.title : item.meeting_id}</strong></span>
                                  {meeting?.meeting_date && <span>• {meeting.meeting_date}</span>}
                                </div>
                              </div>

                              <div className="outcome-meta-badges">
                                {item.category === 'commitment' && (
                                  <span className="badge-category commitment">✓ Confirmed Commitment</span>
                                )}
                                {item.category === 'suggestion' && (
                                  <span className="badge-category suggestion">💡 Suggestion</span>
                                )}
                                {item.category === 'unresolved_question' && (
                                  <span className="badge-category unresolved">❓ Unresolved Question</span>
                                )}

                                {/* Approval Badge */}
                                {isApproved && (
                                  <span className="badge-approval approved" title="Approved by human reviewer">
                                    ✓ Approved
                                  </span>
                                )}
                                {isRejected && (
                                  <span className="badge-approval rejected" title="Rejected by human reviewer">
                                    ✕ Rejected
                                  </span>
                                )}
                                {isPending && (
                                  <span className="badge-approval pending" title="Awaiting human review">
                                    ⏳ Pending Review
                                  </span>
                                )}

                                {/* Commitment Firewall Status Badge */}
                                {isApproved ? (
                                  <span className="badge-firewall eligible" title="Commitment Firewall: Eligible for downstream execution">
                                    🛡️ Firewall: Eligible
                                  </span>
                                ) : isRejected ? (
                                  <span className="badge-firewall rejected" title="Commitment Firewall: Blocked (Rejected)">
                                    🛡️ Firewall: Blocked
                                  </span>
                                ) : (
                                  <span className="badge-firewall blocked" title="Commitment Firewall: Blocked (Pending approval)">
                                    🛡️ Firewall: Blocked
                                  </span>
                                )}

                                {/* Execution Status Badge */}
                                {item.execution_status === 'exported' ? (
                                  <span className="badge-execution exported" title={`Dispatched downstream at ${item.exported_at || ''}`}>
                                    🚀 Exported
                                  </span>
                                ) : isApproved ? (
                                  <span className="badge-execution ready" title="Firewall passed — Ready for execution dispatch">
                                    ⚡ Ready for Export
                                  </span>
                                ) : isRejected ? (
                                  <span className="badge-execution rejected" title="Firewall blocked — Item rejected">
                                    🚫 Blocked
                                  </span>
                                ) : (
                                  <span className="badge-execution blocked" title="Firewall blocked — Approval required before execution">
                                    🔒 Blocked
                                  </span>
                                )}

                                {/* Phase 5: Progress Status Badge */}
                                {item.task_status === 'completed' ? (
                                  <span className="progress-status-badge completed" title={`Completed at ${item.completed_at ? new Date(item.completed_at).toLocaleString() : ''}`}>
                                    ✓ Completed
                                  </span>
                                ) : item.task_status === 'in_progress' ? (
                                  <span className="progress-status-badge in_progress" title="Execution in progress">
                                    ⚙️ In Progress
                                  </span>
                                ) : (
                                  <span className="progress-status-badge pending" title="Task pending execution">
                                    ⏸️ Pending
                                  </span>
                                )}

                                {/* Phase 5: Schedule & Overdue Intelligence Badge */}
                                {item.task_status === 'completed' ? null : item.is_overdue ? (
                                  <span className="badge-schedule overdue" title="Deadline is in the past">
                                    ⚠️ Overdue
                                  </span>
                                ) : item.schedule_status === 'due_soon' ? (
                                  <span className="badge-schedule due-soon" title="Deadline is within 48 hours">
                                    ⏳ Due Soon
                                  </span>
                                ) : item.due_date ? (
                                  <span className="badge-schedule on-track" title="Deadline is scheduled">
                                    📅 On Track
                                  </span>
                                ) : null}

                                {/* Phase 6.2: Duplicate Candidate Badge */}
                                {(item.duplicate_of || item.duplicate_note) && (
                                  <span className="badge-detection duplicate" title={item.duplicate_note || 'Potential duplicate item'}>
                                    📑 Potential Duplicate
                                  </span>
                                )}

                                {/* Phase 6.2: Conflict Candidate Badge */}
                                {item.conflict_flag && (
                                  <span className="badge-detection conflict" title={item.conflict_note || 'Possible conflicting commitment'}>
                                    ⚡ Possible Conflict
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Edit Form Mode */}
                            {isEditing ? (
                              <div className="action-item-edit-box">
                                <div className="edit-box-header">
                                  <span>Edit Action Item Details</span>
                                  {isApproved && (
                                    <span className="edit-warning-hint">
                                      ⚠️ Material edits will automatically reset approval status to Pending Review.
                                    </span>
                                  )}
                                </div>

                                <div className="edit-input-group">
                                  <label className="edit-input-label">Title <span style={{ color: 'var(--color-red)' }}>*</span></label>
                                  <input
                                    type="text"
                                    className="edit-input-field"
                                    value={editFormData.title}
                                    onChange={(e) => setEditFormData((prev) => ({ ...prev, title: e.target.value }))}
                                    placeholder="Action item title..."
                                    disabled={isItemLoading}
                                  />
                                </div>

                                <div className="edit-input-group">
                                  <label className="edit-input-label">Description / Context</label>
                                  <textarea
                                    className="edit-input-field"
                                    rows={2}
                                    value={editFormData.description}
                                    onChange={(e) => setEditFormData((prev) => ({ ...prev, description: e.target.value }))}
                                    placeholder="Detailed description or context..."
                                    disabled={isItemLoading}
                                    style={{ resize: 'vertical' }}
                                  />
                                </div>

                                <div className="edit-inputs-row">
                                  <div className="edit-input-group">
                                    <label className="edit-input-label">Assigned Owner</label>
                                    <input
                                      type="text"
                                      className="edit-input-field"
                                      value={editFormData.owner}
                                      onChange={(e) => setEditFormData((prev) => ({ ...prev, owner: e.target.value }))}
                                      placeholder="e.g. Sarah Chen"
                                      disabled={isItemLoading}
                                    />
                                  </div>
                                  <div className="edit-input-group">
                                    <label className="edit-input-label">Due Date / Timeframe</label>
                                    <input
                                      type="text"
                                      className="edit-input-field"
                                      value={editFormData.due_date}
                                      onChange={(e) => setEditFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                                      placeholder="e.g. Friday 5pm, 2026-11-01"
                                      disabled={isItemLoading}
                                    />
                                  </div>
                                </div>

                                <div className="edit-actions-row">
                                  <button
                                    type="button"
                                    className="saas-btn saas-btn-secondary saas-btn-sm"
                                    onClick={handleCancelEdit}
                                    disabled={isItemLoading}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="saas-btn saas-btn-primary saas-btn-sm"
                                    onClick={() => handleSaveEdit(item.task_id)}
                                    disabled={isItemLoading}
                                  >
                                    {isItemLoading ? 'Saving...' : 'Save Changes'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Description if distinct from title */}
                                {item.description && item.description.trim() !== item.title.trim() && (
                                  <p className="outcome-desc-text">{item.description}</p>
                                )}

                                {/* Attributes: Owner and Deadline */}
                                <div className="outcome-attributes-row">
                                  {item.owner ? (
                                    <span className="attribute-tag" title="Assigned owner from conversation">
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                      </svg>
                                      <span>Owner: <strong>{item.owner}</strong></span>
                                    </span>
                                  ) : (
                                    <span className="attribute-tag missing" title="Owner is not explicitly specified in the transcript">
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                      </svg>
                                      <span>Owner needed</span>
                                    </span>
                                  )}

                                  {item.due_date ? (
                                    <span className="attribute-tag" title="Extracted timeframe or deadline">
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                      </svg>
                                      <span>Deadline: <strong>{item.due_date}</strong></span>
                                    </span>
                                  ) : (
                                    <span className="attribute-tag missing" title="Deadline is not explicitly specified in the transcript">
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                      </svg>
                                      <span>Deadline needed</span>
                                    </span>
                                  )}
                                </div>

                                {/* Clarification Warning Banner */}
                                {item.clarification_required && (
                                  <div className="clarification-banner">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="12" y1="8" x2="12" y2="12" />
                                      <line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <div>
                                      <strong>Clarification Needed:</strong> {item.clarification_note || 'Missing assigned owner or explicit deadline requires human confirmation.'}
                                    </div>
                                  </div>
                                )}

                                {/* Phase 6.2: Conflict Warning Banner */}
                                {item.conflict_flag && (
                                  <div className="conflict-warning-banner">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                      <line x1="12" y1="9" x2="12" y2="13" />
                                      <line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    <div>
                                      <strong>Possible Conflict:</strong> {item.conflict_note || 'This commitment conflicts in owner, deadline, or outcome with another recorded item.'}
                                    </div>
                                  </div>
                                )}

                                {/* Phase 6.2: Duplicate Candidate Warning Banner */}
                                {(item.duplicate_of || item.duplicate_note) && (
                                  <div className="duplicate-warning-banner">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    <div>
                                      <strong>Potential Duplicate:</strong> {item.duplicate_note || `Similar to item #${item.duplicate_of}. Review before approval.`}
                                    </div>
                                  </div>
                                )}

                                {/* Transcript Evidence Quote Box */}
                                {item.source_text && (
                                  <div className="evidence-quote-box">
                                    <div className="evidence-header">
                                      <span>Transcript Evidence</span>
                                      {item.evidence_verified ? (
                                        <span className="evidence-badge verified">
                                          ✓ Grounded in Transcript
                                        </span>
                                      ) : (
                                        <span className="evidence-badge unverified">
                                          ⚠ Evidence Unverified
                                        </span>
                                      )}
                                    </div>
                                    <blockquote className="evidence-quote-text">
                                      "{item.source_text}"
                                    </blockquote>
                                  </div>
                                )}

                                {/* Action Review & Human Approval Bar */}
                                <div className="action-review-bar">
                                  {isPending && (
                                    <>
                                      {isConfirmingReject ? (
                                        <div className="reject-confirm-bar" style={{ width: '100%', justifyContent: 'space-between' }}>
                                          <span>Reject this item? It will be blocked from execution.</span>
                                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                                            <button
                                              type="button"
                                              className="btn-reject"
                                              onClick={() => handleRejectItem(item.task_id)}
                                              disabled={isItemLoading}
                                            >
                                              {isItemLoading ? 'Rejecting...' : 'Yes, Reject'}
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-edit-action"
                                              onClick={() => setConfirmRejectTaskId(null)}
                                              disabled={isItemLoading}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="review-actions-cluster">
                                            <button
                                              type="button"
                                              className="btn-approve"
                                              onClick={() => handleApproveItem(item.task_id)}
                                              disabled={isItemLoading}
                                              title="Approve this item for execution"
                                            >
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                              </svg>
                                              <span>{isItemLoading ? 'Approving...' : 'Approve'}</span>
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-reject"
                                              onClick={() => setConfirmRejectTaskId(item.task_id)}
                                              disabled={isItemLoading}
                                              title="Reject this item"
                                            >
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                              </svg>
                                              <span>Reject</span>
                                            </button>
                                            <button
                                              type="button"
                                              className="btn-edit-action"
                                              onClick={() => handleStartEdit(item)}
                                              disabled={isItemLoading}
                                              title="Edit title, owner, or deadline"
                                            >
                                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M12 20h9" />
                                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                              </svg>
                                              <span>Edit</span>
                                            </button>
                                          </div>
                                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            Awaiting Human Review
                                          </span>
                                        </>
                                      )}
                                    </>
                                  )}

                                  {isApproved && (
                                    <>
                                      <div className="review-actions-cluster">
                                        <button
                                          type="button"
                                          className="btn-edit-action"
                                          onClick={() => handleStartEdit(item)}
                                          disabled={isItemLoading}
                                          title="Edit action item details"
                                        >
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                          </svg>
                                          <span>Edit Item</span>
                                        </button>

                                        {item.execution_status !== 'exported' ? (
                                          <button
                                            type="button"
                                            className="btn-export-action"
                                            onClick={() => handleExportSingleItem(item.task_id)}
                                            disabled={isItemLoading}
                                            title="Dispatch this approved commitment to downstream execution"
                                          >
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                              <polyline points="7 10 12 15 17 10" />
                                              <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                            <span>{isItemLoading ? 'Exporting...' : 'Export'}</span>
                                          </button>
                                        ) : (
                                          <span style={{ fontSize: '0.75rem', color: 'var(--color-blue)', fontWeight: 600 }}>
                                            🚀 Exported {item.exported_at ? new Date(item.exported_at).toLocaleDateString() : ''}
                                          </span>
                                        )}
                                      </div>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--color-green)', fontWeight: 500 }}>
                                        ✓ Approved &amp; Firewall Eligible
                                      </span>
                                    </>
                                  )}

                                  {isRejected && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-red)', fontWeight: 500 }}>
                                      ✕ Rejected by Reviewer • Blocked by Firewall
                                    </span>
                                  )}
                                </div>

                                {/* Phase 5: Task Progress Control & Audit Trail Bar */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px dashed var(--border-color)', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.725rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                      Progress:
                                    </span>
                                    <div className="progress-switcher">
                                      <button
                                        type="button"
                                        className={`progress-btn ${(item.task_status || 'pending') === 'pending' ? 'active pending' : ''}`}
                                        onClick={() => handleUpdateTaskProgress(item.task_id, 'pending')}
                                        disabled={updatingProgressTaskId === item.task_id}
                                        title="Mark task as pending"
                                      >
                                        Pending
                                      </button>
                                      <button
                                        type="button"
                                        className={`progress-btn ${item.task_status === 'in_progress' ? 'active in_progress' : ''}`}
                                        onClick={() => handleUpdateTaskProgress(item.task_id, 'in_progress')}
                                        disabled={updatingProgressTaskId === item.task_id}
                                        title="Mark task as in progress"
                                      >
                                        In Progress
                                      </button>
                                      <button
                                        type="button"
                                        className={`progress-btn ${item.task_status === 'completed' ? 'active completed' : ''}`}
                                        onClick={() => handleUpdateTaskProgress(item.task_id, 'completed')}
                                        disabled={updatingProgressTaskId === item.task_id}
                                        title="Mark task as completed"
                                      >
                                        ✓ Completed
                                      </button>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className="btn-history-action"
                                    onClick={() => handleOpenTaskHistory(item)}
                                    title="View chronological lifecycle audit trail"
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 14 14" />
                                    </svg>
                                    <span>Audit History</span>
                                  </button>
                                </div>
                              </>
                            )}

                            <div className="outcome-card-footer">
                              <span>Added {new Date(item.created_at).toLocaleDateString()}</span>
                              <span>Task ID: {item.task_id}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: FOLLOW-UPS */}
          {activeTab === 'followups' && (
            <div className="feature-workspace-container">
              <div className="panel-card" style={{ borderTop: '3px solid var(--color-amber)' }}>
                <div className="panel-card-header">
                  <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-amber)', color: 'var(--color-amber)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h2 className="panel-title">Follow-up Tracking</h2>
                      <span className="count-pill">{followUpsList.length}</span>
                    </div>
                    <p className="panel-subtitle">Items requiring owner clarification, deadline assignment, or unresolved questions</p>
                  </div>
                </div>

                <div className="panel-card-body">
                  {followUpsList.length === 0 ? (
                    <div className="saas-empty-state">
                      <div className="empty-state-icon-box" style={{ backgroundColor: 'var(--bg-pale-amber)', color: 'var(--color-amber)' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <h3 className="empty-state-title">No Pending Follow-ups</h3>
                      <p className="empty-state-desc">
                        All extracted commitments have assigned owners and deadlines. Any open questions or ambiguous items will appear here.
                      </p>
                      <button
                        type="button"
                        className="saas-btn saas-btn-primary saas-btn-sm"
                        style={{ marginTop: '1rem' }}
                        onClick={() => setActiveTab('meetings')}
                      >
                        Go to Meetings Workspace
                      </button>
                    </div>
                  ) : (
                    <div className="outcomes-stream">
                      {followUpsList.map((item) => {
                        const meeting = meetingMap.get(item.meeting_id);
                        return (
                          <div key={item.task_id} className="outcome-card card-unresolved">
                            <div className="outcome-card-header">
                              <div className="outcome-card-title-group">
                                <h3 className="outcome-title">{item.title}</h3>
                                <div className="outcome-meeting-ref">
                                  <span>From: <strong>{meeting ? meeting.title : item.meeting_id}</strong></span>
                                </div>
                              </div>
                              <div className="outcome-meta-badges">
                                <span className="badge-category unresolved">
                                  {item.category === 'unresolved_question' ? '❓ Unresolved Question' : '⚠ Clarification Needed'}
                                </span>
                              </div>
                            </div>

                            <div className="clarification-banner">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              <div>
                                <strong>Action Needed:</strong> {item.clarification_note || 'Confirm owner and target completion date with the team.'}
                              </div>
                            </div>

                            {item.source_text && (
                              <div className="evidence-quote-box">
                                <div className="evidence-header">
                                  <span>Transcript Context</span>
                                </div>
                                <blockquote className="evidence-quote-text">
                                  "{item.source_text}"
                                </blockquote>
                              </div>
                            )}

                            <div className="outcome-card-footer">
                              <span>Added {new Date(item.created_at).toLocaleDateString()}</span>
                              <span>Task ID: {item.task_id}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: EXECUTION & EXPORT CENTER */}
          {activeTab === 'export' && (
            <div className="feature-workspace-container">
              <div className="export-center-container">
                {/* Hero Explanation Banner */}
                <div className="export-hero-banner">
                  <div className="export-hero-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="export-hero-title">Deterministic Commitment Firewall Execution &amp; Export</h2>
                    <p className="export-hero-desc">
                      Downstream task creation and pipeline exports are deterministically protected by the Commitment Firewall.
                      Only human-approved commitments with verbatim transcript evidence can cross the execution boundary.
                      Unreviewed (<span style={{ color: 'var(--color-blue)', fontWeight: 600 }}>pending</span>) or rejected items are strictly blocked.
                    </p>
                  </div>
                </div>

                {/* Export Pipeline Metrics Grid */}
                <div className="export-metrics-grid">
                  <div className="export-metric-card">
                    <div>
                      <div className="export-metric-val" style={{ color: 'var(--color-green)' }}>
                        {exportSummary?.pending_export_count || 0}
                      </div>
                      <div className="export-metric-label">Ready for Export</div>
                      <div className="export-metric-desc">Approved commitments cleared by firewall awaiting execution</div>
                    </div>
                    <div className="export-metric-icon ready">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                  </div>

                  <div className="export-metric-card">
                    <div>
                      <div className="export-metric-val" style={{ color: 'var(--color-blue)' }}>
                        {exportSummary?.exported_count || 0}
                      </div>
                      <div className="export-metric-label">Exported to Pipeline</div>
                      <div className="export-metric-desc">Confirmed commitments successfully dispatched downstream</div>
                    </div>
                    <div className="export-metric-icon exported">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>

                  <div className="export-metric-card">
                    <div>
                      <div className="export-metric-val" style={{ color: 'var(--color-red)' }}>
                        {exportSummary?.blocked_firewall_count || 0}
                      </div>
                      <div className="export-metric-label">Blocked by Firewall</div>
                      <div className="export-metric-desc">Unapproved or rejected items protected from premature execution</div>
                    </div>
                    <div className="export-metric-icon blocked">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                  </div>

                  <div className="export-metric-card">
                    <div>
                      <div className="export-metric-val" style={{ color: 'var(--color-lavender)' }}>
                        {exportSummary?.approved_count || 0}
                      </div>
                      <div className="export-metric-label">Total Approved</div>
                      <div className="export-metric-desc">Human-verified commitments recorded in workspace</div>
                    </div>
                    <div className="export-metric-icon total">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Firewall Blocked Alert Notification if any */}
                {exportBlockedItems.length > 0 && (
                  <div className="export-blocked-alert">
                    <div className="export-blocked-alert-header">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span>Commitment Firewall Enforcement: {exportBlockedItems.length} items were blocked from execution</span>
                    </div>
                    <ul className="export-blocked-list">
                      {exportBlockedItems.map((b) => (
                        <li key={b.task_id}>
                          <strong>Task {b.task_id}:</strong> {b.reason === 'approval_pending' ? 'Item is pending human approval' : b.reason === 'item_rejected' ? 'Item was explicitly rejected' : b.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Execution Actions Toolbar */}
                <div className="export-actions-card">
                  <div className="export-actions-info">
                    <h3 className="export-actions-title">Pipeline Actions</h3>
                    <p className="export-actions-subtitle">
                      Export structured records with full audit traceability or dispatch approved commitments.
                    </p>
                  </div>

                  <div className="export-actions-group">
                    <button
                      type="button"
                      className="saas-btn saas-btn-secondary saas-btn-sm"
                      onClick={() => handleDownloadCsv()}
                      title="Download audit-ready CSV of all approved commitments"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download CSV</span>
                    </button>

                    <button
                      type="button"
                      className="saas-btn saas-btn-secondary saas-btn-sm"
                      onClick={() => handleDownloadJson()}
                      title="Download structured JSON payload with full decision-to-execution traceability"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                      <span>Download JSON</span>
                    </button>

                    <button
                      type="button"
                      className="saas-btn saas-btn-primary saas-btn-sm"
                      onClick={handleDispatchBatchExport}
                      disabled={isExporting || (exportSummary?.pending_export_count || 0) === 0}
                      title="Dispatch all firewall-cleared commitments to downstream execution"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      <span>
                        {isExporting 
                          ? 'Dispatching...' 
                          : `Dispatch All Ready (${exportSummary?.pending_export_count || 0})`}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Auditable Traceability Table */}
                <div className="export-table-card">
                  <div className="export-table-header-bar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h3 className="export-table-title">Traceability &amp; Execution Pipeline Table</h3>
                      <span className="count-pill">{actionItems.filter(i => i.category === 'commitment').length} Commitments</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      RFC 4180 / JSON Schema Compliant
                    </span>
                  </div>

                  <div className="export-table-wrapper">
                    {actionItems.filter(i => i.category === 'commitment').length === 0 ? (
                      <div className="saas-empty-state" style={{ padding: '2.5rem' }}>
                        <p className="empty-state-desc">No commitments found in workspace. Extract commitments from meetings first.</p>
                      </div>
                    ) : (
                      <table className="export-table">
                        <thead>
                          <tr>
                            <th>Firewall Gate</th>
                            <th>Commitment</th>
                            <th>Meeting</th>
                            <th>Owner</th>
                            <th>Deadline</th>
                            <th>Transcript Evidence</th>
                            <th>Execution Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {actionItems
                            .filter((i) => i.category === 'commitment')
                            .map((item) => {
                              const meeting = meetingMap.get(item.meeting_id);
                              const isApproved = item.approval_status === 'approved';
                              const isExported = item.execution_status === 'exported';

                              return (
                                <tr key={item.task_id}>
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                      {isApproved ? (
                                        <span className="badge-approval approved" style={{ fontSize: '0.7rem' }}>
                                          ✓ Approved
                                        </span>
                                      ) : item.approval_status === 'rejected' ? (
                                        <span className="badge-approval rejected" style={{ fontSize: '0.7rem' }}>
                                          ✕ Rejected
                                        </span>
                                      ) : (
                                        <span className="badge-approval pending" style={{ fontSize: '0.7rem' }}>
                                          ⏳ Pending
                                        </span>
                                      )}

                                      {isApproved ? (
                                        <span className="badge-firewall eligible" style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}>
                                          🛡️ Cleared
                                        </span>
                                      ) : (
                                        <span className="badge-firewall blocked" style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}>
                                          🛡️ Blocked
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  <td>
                                    <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                                      {item.title}
                                    </div>
                                    {item.description && item.description !== item.title && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '280px' }}>
                                        {item.description}
                                      </div>
                                    )}
                                  </td>

                                  <td>
                                    <span style={{ fontWeight: 500 }}>
                                      {meeting ? meeting.title : item.meeting_id}
                                    </span>
                                  </td>

                                  <td>
                                    {item.owner ? (
                                      <span style={{ fontWeight: 600 }}>{item.owner}</span>
                                    ) : (
                                      <span style={{ color: 'var(--color-amber)', fontStyle: 'italic' }}>Unassigned</span>
                                    )}
                                  </td>

                                  <td>
                                    {item.due_date ? (
                                      <span>{item.due_date}</span>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>No date</span>
                                    )}
                                  </td>

                                  <td>
                                    {item.source_text ? (
                                      <div 
                                        className="export-evidence-cell" 
                                        title={item.source_text}
                                      >
                                        "{item.source_text}"
                                      </div>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                                    )}
                                  </td>

                                  <td>
                                    {isExported ? (
                                      <span className="badge-execution exported">
                                        🚀 Exported
                                      </span>
                                    ) : isApproved ? (
                                      <span className="badge-execution ready">
                                        ⚡ Ready
                                      </span>
                                    ) : (
                                      <span className="badge-execution blocked">
                                        🔒 Blocked
                                      </span>
                                    )}
                                  </td>

                                  <td>
                                    {isExported ? (
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                        {item.exported_at ? new Date(item.exported_at).toLocaleDateString() : 'Done'}
                                      </span>
                                    ) : isApproved ? (
                                      <button
                                        type="button"
                                        className="btn-export-action"
                                        onClick={() => handleExportSingleItem(item.task_id)}
                                        disabled={actionLoadingId === item.task_id}
                                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                                      >
                                        <span>{actionLoadingId === item.task_id ? '...' : 'Export'}</span>
                                      </button>
                                    ) : (
                                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        Approve First
                                      </span>
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
              </div>
            </div>
          )}

          {/* TAB 7: EXECUTION TRACKING & ACCOUNTABILITY */}
          {activeTab === 'tracking' && (
            <div className="feature-workspace-container">
              <div className="export-center-container">
                {/* Hero Banner */}
                <div className="export-hero-banner" style={{ borderLeft: '4px solid var(--color-lavender)' }}>
                  <div className="export-hero-icon" style={{ backgroundColor: 'var(--bg-pale-lavender)', color: 'var(--color-lavender)' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="export-hero-title">Execution Tracking &amp; Accountability Intelligence</h2>
                    <p className="export-hero-desc">
                      Real-time visibility into commitment delivery, intelligent deadline evaluation, overdue task detection, unassigned ownership triage, and tamper-evident audit history across all meeting outcomes.
                    </p>
                  </div>
                </div>

                {/* Tracking KPI Metric Cards */}
                <div className="tracking-kpi-grid">
                  {/* Completion Rate */}
                  <div className="tracking-kpi-card accent-rate">
                    <div className="tracking-kpi-header">
                      <span className="tracking-kpi-label">Completion Rate</span>
                      <div className="tracking-kpi-icon-box" style={{ backgroundColor: 'var(--bg-pale-mint)', color: 'var(--color-green)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                    </div>
                    <div className="tracking-kpi-value" style={{ color: 'var(--color-green)' }}>
                      {trackingData ? `${trackingData.completion_rate_percent}%` : '0%'}
                    </div>
                    <div className="tracking-kpi-subtext">
                      {trackingData?.completed_count || 0} of {trackingData?.total_commitments || 0} commitments completed
                    </div>
                    <div className="progress-bar-container">
                      <div
                        className="progress-bar-fill"
                        style={{ width: `${Math.min(100, trackingData?.completion_rate_percent || 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Total Commitments */}
                  <div className="tracking-kpi-card accent-commitments">
                    <div className="tracking-kpi-header">
                      <span className="tracking-kpi-label">Commitments</span>
                      <div className="tracking-kpi-icon-box" style={{ backgroundColor: 'var(--bg-pale-blue)', color: 'var(--color-blue)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 11l3 3L22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                      </div>
                    </div>
                    <div className="tracking-kpi-value">
                      {trackingData?.total_commitments || 0}
                    </div>
                    <div className="tracking-kpi-subtext">
                      {trackingData?.total_items || 0} total action items recorded
                    </div>
                  </div>

                  {/* In Progress */}
                  <div className="tracking-kpi-card accent-progress">
                    <div className="tracking-kpi-header">
                      <span className="tracking-kpi-label">In Progress</span>
                      <div className="tracking-kpi-icon-box" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </div>
                    </div>
                    <div className="tracking-kpi-value" style={{ color: 'var(--color-teal)' }}>
                      {trackingData?.in_progress_count || 0}
                    </div>
                    <div className="tracking-kpi-subtext">
                      Active execution underway
                    </div>
                  </div>

                  {/* Overdue */}
                  <div className="tracking-kpi-card accent-overdue">
                    <div className="tracking-kpi-header">
                      <span className="tracking-kpi-label">Overdue</span>
                      <div className="tracking-kpi-icon-box" style={{ backgroundColor: 'var(--bg-pale-red)', color: 'var(--color-red)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      </div>
                    </div>
                    <div className="tracking-kpi-value" style={{ color: 'var(--color-red)' }}>
                      {trackingData?.overdue_count || 0}
                    </div>
                    <div className="tracking-kpi-subtext">
                      {trackingData?.due_soon_count ? `${trackingData.due_soon_count} due within 48h` : 'Requires delivery attention'}
                    </div>
                  </div>

                  {/* Unassigned */}
                  <div className="tracking-kpi-card accent-unassigned">
                    <div className="tracking-kpi-header">
                      <span className="tracking-kpi-label">Unassigned</span>
                      <div className="tracking-kpi-icon-box" style={{ backgroundColor: 'var(--bg-pale-amber)', color: 'var(--color-amber)' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="8.5" cy="7" r="4" />
                          <line x1="20" y1="8" x2="20" y2="14" />
                          <line x1="23" y1="11" x2="17" y2="11" />
                        </svg>
                      </div>
                    </div>
                    <div className="tracking-kpi-value" style={{ color: 'var(--color-amber)' }}>
                      {trackingData?.unassigned_owner_count || 0}
                    </div>
                    <div className="tracking-kpi-subtext">
                      Commitments without owner
                    </div>
                  </div>
                </div>

                {/* Intelligence Sections: Overdue & Unassigned */}
                <div className="tracking-sections-grid">
                  {/* Overdue Attention Panel */}
                  <div className="tracking-panel" style={{ borderTop: '3px solid var(--color-red)' }}>
                    <div className="tracking-panel-header">
                      <div className="tracking-panel-title-group">
                        <span style={{ color: 'var(--color-red)' }}>⚠️</span>
                        <h3 className="tracking-panel-title">Overdue Commitments</h3>
                      </div>
                      <span className="badge-schedule overdue">
                        {trackingData?.overdue_items?.length || 0} Attention Needed
                      </span>
                    </div>

                    <div className="tracking-panel-body">
                      {(!trackingData?.overdue_items || trackingData.overdue_items.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)' }}>
                          <span style={{ fontSize: '1.75rem', display: 'block', marginBottom: '0.4rem' }}>🎉</span>
                          <strong style={{ color: 'var(--color-green)' }}>No Overdue Commitments!</strong>
                          <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>All active commitments are currently on track or completed.</p>
                        </div>
                      ) : (
                        <div>
                          {trackingData.overdue_items.map((item) => (
                            <div key={item.task_id} className="attention-item-row" style={{ borderLeft: '3px solid var(--color-red)' }}>
                              <div className="attention-item-info">
                                <div className="attention-item-title">{item.title}</div>
                                <div className="attention-item-meta">
                                  <span>👤 {item.owner || 'Unassigned'}</span>
                                  <span>📅 Due: <strong>{item.due_date || 'Past'}</strong></span>
                                  <span style={{ color: 'var(--color-red)', fontWeight: 600 }}>
                                    {item.days_overdue} {item.days_overdue === 1 ? 'day' : 'days'} overdue
                                  </span>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                                <button
                                  type="button"
                                  className="attention-action-btn"
                                  style={{ color: 'var(--color-teal)' }}
                                  onClick={() => handleUpdateTaskProgress(item.task_id, 'in_progress')}
                                  title="Mark In Progress"
                                >
                                  In Progress
                                </button>
                                <button
                                  type="button"
                                  className="attention-action-btn"
                                  style={{ color: 'var(--color-green)', fontWeight: 600 }}
                                  onClick={() => handleUpdateTaskProgress(item.task_id, 'completed')}
                                  title="Mark Completed"
                                >
                                  ✓ Done
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Unassigned Commitments Attention Panel */}
                  <div className="tracking-panel" style={{ borderTop: '3px solid var(--color-amber)' }}>
                    <div className="tracking-panel-header">
                      <div className="tracking-panel-title-group">
                        <span style={{ color: 'var(--color-amber)' }}>👤</span>
                        <h3 className="tracking-panel-title">Unassigned Commitments</h3>
                      </div>
                      <span className="badge-schedule due-soon">
                        {trackingData?.unassigned_items?.length || 0} Need Owner
                      </span>
                    </div>

                    <div className="tracking-panel-body">
                      {(!trackingData?.unassigned_items || trackingData.unassigned_items.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)' }}>
                          <span style={{ fontSize: '1.75rem', display: 'block', marginBottom: '0.4rem' }}>✓</span>
                          <strong style={{ color: 'var(--color-green)' }}>All Commitments Assigned</strong>
                          <p style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Every confirmed commitment in the workspace has a designated owner.</p>
                        </div>
                      ) : (
                        <div>
                          {trackingData.unassigned_items.map((item) => (
                            <div key={item.task_id} className="attention-item-row" style={{ borderLeft: '3px solid var(--color-amber)' }}>
                              <div className="attention-item-info">
                                <div className="attention-item-title">{item.title}</div>
                                <div className="attention-item-meta">
                                  <span style={{ color: 'var(--color-amber)', fontWeight: 600 }}>⚠️ Owner missing</span>
                                  {item.due_date && <span>📅 Deadline: {item.due_date}</span>}
                                  <span>Status: {item.task_status}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="attention-action-btn"
                                onClick={() => {
                                  setActiveTab('actions');
                                  const original = actionItems.find((a) => a.task_id === item.task_id);
                                  if (original) handleStartEdit(original);
                                }}
                                title="Assign an owner to this commitment"
                              >
                                Assign Owner →
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Workspace-Wide Audit Trail Activity Log */}
                <div className="export-table-card">
                  <div className="export-table-header-bar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <h3 className="export-table-title">Recent Workspace Audit Trail Activity</h3>
                      <span className="count-pill">{trackingData?.recent_history?.length || 0} Events</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Immutable Lifecycle Event Log
                    </span>
                  </div>

                  <div className="export-table-wrapper">
                    {(!trackingData?.recent_history || trackingData.recent_history.length === 0) ? (
                      <div className="saas-empty-state" style={{ padding: '2.5rem' }}>
                        <p className="empty-state-desc">No audit log records found yet.</p>
                      </div>
                    ) : (
                      <table className="activity-feed-table">
                        <thead>
                          <tr>
                            <th>Event</th>
                            <th>Task ID</th>
                            <th>Details &amp; Transition</th>
                            <th>Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trackingData.recent_history.map((event) => (
                            <tr key={event.history_id}>
                              <td>
                                <span className={`history-event-badge ${event.event_type}`}>
                                  {event.event_type.replace('_', ' ')}
                                </span>
                              </td>
                              <td>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  {event.task_id}
                                </span>
                              </td>
                              <td>
                                <div>
                                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-main)' }}>
                                    {event.details || 'Lifecycle state updated'}
                                  </span>
                                  {event.old_value && event.new_value && (
                                    <div className="history-transition-tag">
                                      <span>{event.old_value}</span>
                                      <span>→</span>
                                      <strong style={{ color: 'var(--color-blue)' }}>{event.new_value}</strong>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {new Date(event.created_at).toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Task History Modal Dialog */}
          {historyModalTask && (
            <div className="history-modal-overlay" onClick={handleCloseTaskHistory}>
              <div className="history-modal-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="history-modal-header">
                  <div className="history-modal-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-lavender)' }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 14 14" />
                    </svg>
                    <span>Task Lifecycle Audit Trail</span>
                  </div>
                  <button
                    type="button"
                    className="history-modal-close"
                    onClick={handleCloseTaskHistory}
                    aria-label="Close modal"
                  >
                    &times;
                  </button>
                </div>

                <div className="history-modal-body">
                  <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                      {historyModalTask.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="count-pill" style={{ fontSize: '0.7rem' }}>ID: {historyModalTask.task_id}</span>
                      <span className={`progress-status-badge ${historyModalTask.task_status || 'pending'}`}>
                        {historyModalTask.task_status || 'pending'}
                      </span>
                      <span className={`badge-approval ${historyModalTask.approval_status}`}>
                        {historyModalTask.approval_status}
                      </span>
                    </div>
                  </div>

                  {isLoadingHistory ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                      Loading task audit trail...
                    </div>
                  ) : selectedTaskHistory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                      No history events recorded for this task yet.
                    </div>
                  ) : (
                    <div className="history-timeline">
                      {selectedTaskHistory.map((item) => (
                        <div key={item.history_id} className="history-timeline-item">
                          <div className={`history-timeline-marker ${item.event_type}`} />
                          <div className="history-timeline-content">
                            <div className="history-timeline-header">
                              <span className={`history-event-badge ${item.event_type}`}>
                                {item.event_type.replace('_', ' ')}
                              </span>
                              <span className="history-time-stamp">
                                {new Date(item.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="history-details-text">
                              {item.details || 'Lifecycle transition recorded.'}
                            </p>
                            {item.old_value && item.new_value && (
                              <div className="history-transition-tag">
                                <span>{item.old_value}</span>
                                <span>→</span>
                                <strong style={{ color: 'var(--color-blue)' }}>{item.new_value}</strong>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
