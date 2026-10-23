import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  checkBackendHealth,
  fetchMeetings,
  fetchDecisions,
  fetchActionItems,
  fetchExportSummary,
  fetchTrackingDashboard,
} from '../services/api';

/**
 * Custom hook to manage core Meet2Momentum data models and backend sync.
 */
export function useMeet2MomentumData() {
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);

  // Core Data States
  const [meetings, setMeetings] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [actionItems, setActionItems] = useState([]);

  // Loading States
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [isLoadingOutcomes, setIsLoadingOutcomes] = useState(false);
  const [meetingsError, setMeetingsError] = useState('');

  // Summaries & Dashboard
  const [exportSummary, setExportSummary] = useState(null);
  const [trackingData, setTrackingData] = useState(null);

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

  return {
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
    setMeetings,
    setActionItems,
  };
}
