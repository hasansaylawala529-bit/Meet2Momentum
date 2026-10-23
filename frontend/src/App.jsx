import React, { useState, useMemo, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import {
  Overview,
  Meetings,
  Decisions,
  ActionItems,
  FollowUps,
  ExecutionExport,
  Tracking,
} from './pages';
import { useMeet2MomentumData } from './hooks/useMeet2MomentumData';
import { useActionItemActions } from './hooks/useActionItemActions';
import { useTaskHistoryModal } from './hooks/useTaskHistoryModal';

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [globalNotice, setGlobalNotice] = useState(null);

  // Theme State: 'light' | 'dark'
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('m2m-theme') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('m2m-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Sidebar Collapse State (auto-collapsed on <= 1024px)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 1024;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) {
        setIsSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global search text
  const [globalSearchText, setGlobalSearchText] = useState('');

  // Filter states for Action Items navigation from Overview StatCards
  const [actionApprovalFilter, setActionApprovalFilter] = useState('all');
  const [taskProgressFilter, setTaskProgressFilter] = useState('all');
  const [activeActionCategory, setActiveActionCategory] = useState('all');

  const handleNavigate = (tab, filters = {}) => {
    if (tab === 'followups') {
      setActiveActionCategory('unresolved_question');
      setActiveTab('actions');
      return;
    }
    if (filters.approvalFilter) setActionApprovalFilter(filters.approvalFilter);
    if (filters.progressFilter) setTaskProgressFilter(filters.progressFilter);
    if (filters.categoryFilter) setActiveActionCategory(filters.categoryFilter);
    setActiveTab(tab);
  };

  // Core Data Hook
  const {
    isConnected,
    isCheckingHealth,
    meetings,
    decisions,
    actionItems,
    isLoadingMeetings,
    isLoadingOutcomes,
    meetingsError,
    exportSummary,
    trackingData,
    meetingMap,
    processedMeetingStats,
    loadMeetingsData,
    loadOutcomesData,
    loadExportSummaryData,
    loadTrackingData,
    handleMeetingSaved,
    setActionItems,
  } = useMeet2MomentumData();

  // Action Items Workflow Hook
  const {
    processingMeetingId,
    extractionErrors,
    actionLoadingId,
    isExporting,
    exportBlockedItems,
    updatingProgressTaskId,
    editingTaskId,
    editFormData,
    setEditFormData,
    confirmRejectTaskId,
    setConfirmRejectTaskId,
    handleProcessMeeting,
    handleApproveItem,
    handleRejectItem,
    handleStartEdit,
    handleCancelEdit,
    handleSaveEdit,
    handleExportSingleItem,
    handleDispatchBatchExport,
    handleDispatchGitHub,
    handleSingleGitHubDispatch,
    handleDownloadCsv,
    handleDownloadJson,
    handleUpdateTaskProgress,
  } = useActionItemActions({
    setActionItems,
    loadOutcomesData,
    loadMeetingsData,
    loadExportSummaryData,
    loadTrackingData,
    setGlobalNotice,
  });

  // Task Lifecycle Audit History Modal Hook
  const {
    historyModalTask,
    selectedTaskHistory,
    isLoadingHistory,
    handleOpenTaskHistory,
    handleCloseTaskHistory,
  } = useTaskHistoryModal();

  // Derived Counts: Badges shown only where action is needed
  const pendingReviewCount = useMemo(() => {
    return actionItems.filter((i) => i.approval_status === 'pending').length;
  }, [actionItems]);

  const readyExportCount = useMemo(() => {
    return actionItems.filter(
      (i) => i.category === 'commitment' && i.approval_status === 'approved' && i.execution_status !== 'exported'
    ).length;
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
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleNavigate}
        pendingReviewCount={pendingReviewCount}
        exportCount={readyExportCount}
        overdueCount={overdueItemsCount}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* Main Viewport */}
      <div className={`saas-main-viewport ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <Header
          activeTab={activeTab}
          isConnected={isConnected}
          isChecking={isCheckingHealth}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onNewMeetingClick={() => setActiveTab('meetings')}
          globalSearchText={globalSearchText}
          onGlobalSearchChange={setGlobalSearchText}
          theme={theme}
          onToggleTheme={toggleTheme}
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
            <Overview
              meetings={meetings}
              decisions={decisions}
              actionItems={actionItems}
              exportSummary={exportSummary}
              trackingData={trackingData}
              processedMeetingStats={processedMeetingStats}
              isLoading={isLoadingMeetings || isLoadingOutcomes}
              actionLoadingId={actionLoadingId}
              handleApproveItem={handleApproveItem}
              handleRejectItem={handleRejectItem}
              handleStartEdit={handleStartEdit}
              handleCancelEdit={handleCancelEdit}
              handleSaveEdit={handleSaveEdit}
              editingTaskId={editingTaskId}
              editFormData={editFormData}
              setEditFormData={setEditFormData}
              onNavigate={handleNavigate}
            />
          )}

          {/* TAB 2: MEETINGS WORKSPACE */}
          {activeTab === 'meetings' && (
            <Meetings
              meetings={meetings}
              decisions={decisions}
              actionItems={actionItems}
              isLoadingMeetings={isLoadingMeetings}
              meetingsError={meetingsError}
              processingMeetingId={processingMeetingId}
              extractionErrors={extractionErrors}
              processedMeetingStats={processedMeetingStats}
              onMeetingSaved={handleMeetingSaved}
              onProcessMeeting={handleProcessMeeting}
              onRefreshMeetings={loadMeetingsData}
              onNavigate={handleNavigate}
            />
          )}

          {/* TAB 3: DECISIONS */}
          {activeTab === 'decisions' && (
            <Decisions
              decisions={decisions}
              meetingMap={meetingMap}
              onNavigate={handleNavigate}
            />
          )}

          {/* TAB 4: ACTION ITEMS & COMMITMENTS */}
          {activeTab === 'actions' && (
            <ActionItems
              actionItems={actionItems}
              meetingMap={meetingMap}
              trackingData={trackingData}
              activeActionCategory={activeActionCategory}
              setActiveActionCategory={setActiveActionCategory}
              actionApprovalFilter={actionApprovalFilter}
              setActionApprovalFilter={setActionApprovalFilter}
              taskProgressFilter={taskProgressFilter}
              setTaskProgressFilter={setTaskProgressFilter}
              editingTaskId={editingTaskId}
              editFormData={editFormData}
              setEditFormData={setEditFormData}
              confirmRejectTaskId={confirmRejectTaskId}
              setConfirmRejectTaskId={setConfirmRejectTaskId}
              actionLoadingId={actionLoadingId}
              updatingProgressTaskId={updatingProgressTaskId}
              handleApproveItem={handleApproveItem}
              handleRejectItem={handleRejectItem}
              handleStartEdit={handleStartEdit}
              handleCancelEdit={handleCancelEdit}
              handleSaveEdit={handleSaveEdit}
              handleExportSingleItem={handleExportSingleItem}
              handleSingleGitHubDispatch={handleSingleGitHubDispatch}
              handleUpdateTaskProgress={handleUpdateTaskProgress}
              handleOpenTaskHistory={handleOpenTaskHistory}
              onNavigate={handleNavigate}
            />
          )}

          {/* TAB 5: FOLLOW-UPS */}
          {activeTab === 'followups' && (
            <FollowUps
              followUpsList={followUpsList}
              meetingMap={meetingMap}
              onNavigate={setActiveTab}
            />
          )}

          {/* TAB 6: EXECUTION & EXPORT CENTER */}
          {activeTab === 'export' && (
            <ExecutionExport
              actionItems={actionItems}
              exportSummary={exportSummary}
              meetingMap={meetingMap}
              exportBlockedItems={exportBlockedItems}
              isExporting={isExporting}
              actionLoadingId={actionLoadingId}
              handleDownloadCsv={handleDownloadCsv}
              handleDownloadJson={handleDownloadJson}
              handleDispatchBatchExport={handleDispatchBatchExport}
              handleDispatchGitHub={handleDispatchGitHub}
              handleExportSingleItem={handleExportSingleItem}
              handleSingleGitHubDispatch={handleSingleGitHubDispatch}
            />
          )}

          {/* TAB 7: EXECUTION TRACKING & ACCOUNTABILITY */}
          {activeTab === 'tracking' && (
            <Tracking
              actionItems={actionItems}
              trackingData={trackingData}
              meetingMap={meetingMap}
              handleUpdateTaskProgress={handleUpdateTaskProgress}
              handleStartEdit={handleStartEdit}
              loadTrackingData={loadTrackingData}
              onNavigate={handleNavigate}
            />
          )}

          {/* Task Lifecycle History Modal Dialog */}
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
