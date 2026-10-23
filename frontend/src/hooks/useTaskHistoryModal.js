import { useState } from 'react';
import { fetchTaskHistory } from '../services/api';

/**
 * Custom hook to manage the Task Lifecycle Audit Trail modal.
 */
export function useTaskHistoryModal() {
  const [historyModalTask, setHistoryModalTask] = useState(null);
  const [selectedTaskHistory, setSelectedTaskHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

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

  return {
    historyModalTask,
    selectedTaskHistory,
    isLoadingHistory,
    handleOpenTaskHistory,
    handleCloseTaskHistory,
  };
}
