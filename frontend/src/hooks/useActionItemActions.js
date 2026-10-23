import { useState } from 'react';
import {
  extractMeetingOutcomes,
  approveActionItem,
  rejectActionItem,
  updateActionItem,
  exportSingleActionItem,
  dispatchExport,
  dispatchGitHubBatch,
  dispatchSingleGitHub,
  downloadExportCsv,
  downloadExportJson,
  updateTaskProgress,
} from '../services/api';

/**
 * Custom hook to manage action item workflows: approve, reject, edit, export, progress, and AI extraction.
 */
export function useActionItemActions({
  setActionItems,
  loadOutcomesData,
  loadMeetingsData,
  loadExportSummaryData,
  loadTrackingData,
  setGlobalNotice,
}) {
  const [processingMeetingId, setProcessingMeetingId] = useState(null);
  const [extractionErrors, setExtractionErrors] = useState({});
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportBlockedItems, setExportBlockedItems] = useState([]);
  const [updatingProgressTaskId, setUpdatingProgressTaskId] = useState(null);

  // Edit form state
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    owner: '',
    due_date: '',
  });
  const [confirmRejectTaskId, setConfirmRejectTaskId] = useState(null);

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

  const handleDispatchGitHub = async () => {
    setIsExporting(true);
    setExportBlockedItems([]);
    try {
      const result = await dispatchGitHubBatch();
      await Promise.all([loadOutcomesData(), loadExportSummaryData()]);
      if (result.blocked_items && result.blocked_items.length > 0) {
        setExportBlockedItems(result.blocked_items);
        setGlobalNotice({
          type: 'success',
          message: `Dispatched ${result.dispatched_count} commitments to GitHub Issues (${result.target_repo}). ${result.blocked_items.length} unapproved items were safely blocked by Commitment Firewall.`,
        });
      } else {
        setGlobalNotice({
          type: 'success',
          message: `Successfully created ${result.dispatched_count} GitHub Issues on ${result.target_repo}!`,
        });
      }
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `GitHub dispatch failed: ${err.message}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleSingleGitHubDispatch = async (taskId) => {
    setActionLoadingId(taskId);
    try {
      const updated = await dispatchSingleGitHub(taskId);
      await Promise.all([loadOutcomesData(), loadExportSummaryData()]);
      setGlobalNotice({
        type: 'success',
        message: `Commitment #${taskId} dispatched to GitHub Issues: ${updated.external_url || 'Created'}`,
      });
    } catch (err) {
      setGlobalNotice({
        type: 'error',
        message: `Failed to dispatch to GitHub: ${err.message}`,
      });
    } finally {
      setActionLoadingId(null);
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

  return {
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
  };
}
