import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Button, StatusChip, Drawer, Modal } from '../components/common';

/**
 * Format relative due date text (e.g. "Tomorrow", "In 3 days", "2 days ago", or raw date).
 * Returns { text, isOverdue }.
 */
function formatRelativeDueDate(dueDateStr, isOverdueFlag) {
  if (!dueDateStr) return { text: 'No date', isOverdue: false };
  const parsed = Date.parse(dueDateStr);
  if (isNaN(parsed)) {
    return { text: dueDateStr, isOverdue: Boolean(isOverdueFlag) };
  }
  const now = new Date();
  const target = new Date(parsed);
  // Compare date boundaries
  const diffDays = Math.round(
    (new Date(target.getFullYear(), target.getMonth(), target.getDate()) -
      new Date(now.getFullYear(), now.getMonth(), now.getDate())) /
      (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return { text: 'Today', isOverdue: Boolean(isOverdueFlag) };
  if (diffDays === 1) return { text: 'Tomorrow', isOverdue: false };
  if (diffDays === -1) return { text: 'Yesterday', isOverdue: true };
  if (diffDays > 1 && diffDays <= 7) return { text: `In ${diffDays} days`, isOverdue: false };
  if (diffDays < -1) return { text: `${Math.abs(diffDays)}d overdue`, isOverdue: true };

  return {
    text: target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    isOverdue: Boolean(isOverdueFlag || diffDays < 0),
  };
}

/**
 * Derive single primary state chip to avoid redundant badges.
 */
function getDerivedState(item) {
  if (item.task_status === 'completed') {
    return { key: 'completed', label: 'Completed', type: 'progress', status: 'completed' };
  }
  if (item.execution_status === 'exported') {
    return { key: 'exported', label: 'Exported', type: 'execution', status: 'exported' };
  }
  if (item.approval_status === 'approved') {
    return { key: 'approved', label: 'Approved', type: 'approval', status: 'approved' };
  }
  if (item.approval_status === 'rejected') {
    return { key: 'rejected', label: 'Rejected', type: 'approval', status: 'rejected' };
  }
  return { key: 'pending', label: 'Pending review', type: 'approval', status: 'pending' };
}

/**
 * ActionItems Page: Dense Data Table with Unified Toolbar,
 * Single Derived State Chip, Signal Icons, Row-Click Drawer, and Keyboard Shortcuts.
 */
export default function ActionItems({
  actionItems = [],
  meetingMap = new Map(),
  trackingData = null,
  activeActionCategory: externalCategory,
  setActiveActionCategory: externalSetCategory,
  actionApprovalFilter: externalApprovalFilter,
  setActionApprovalFilter: externalSetApprovalFilter,
  taskProgressFilter: externalProgressFilter,
  setTaskProgressFilter: externalSetProgressFilter,
  editingTaskId,
  editFormData = { title: '', description: '', owner: '', due_date: '' },
  setEditFormData,
  confirmRejectTaskId,
  setConfirmRejectTaskId,
  actionLoadingId,
  updatingProgressTaskId,
  handleApproveItem,
  handleRejectItem,
  handleStartEdit,
  handleCancelEdit,
  handleSaveEdit,
  handleExportSingleItem,
  handleSingleGitHubDispatch,
  handleUpdateTaskProgress,
  handleOpenTaskHistory,
  onNavigate,
}) {
  // 1. Filter States
  const [internalCategory, setInternalCategory] = useState('all');
  const [internalApprovalFilter, setInternalApprovalFilter] = useState('all');
  const [internalProgressFilter, setInternalProgressFilter] = useState('all');

  const activeActionCategory = externalCategory !== undefined ? externalCategory : internalCategory;
  const setActiveActionCategory = externalSetCategory || setInternalCategory;

  const actionApprovalFilter = externalApprovalFilter !== undefined ? externalApprovalFilter : internalApprovalFilter;
  const setActionApprovalFilter = externalSetApprovalFilter || setInternalApprovalFilter;

  const taskProgressFilter = externalProgressFilter !== undefined ? externalProgressFilter : internalProgressFilter;
  const setTaskProgressFilter = externalSetProgressFilter || setInternalProgressFilter;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('all');
  const [selectedMeeting, setSelectedMeeting] = useState('all');

  // Density toggle: 'dense' vs 'normal'
  const [density, setDensity] = useState('dense');

  // Sorting: field + direction
  const [sortField, setSortField] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');

  // Row Selection for Bulk Actions
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  // Keyboard navigation active focus row index
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Right-side Drawer active item
  const [activeDrawerItem, setActiveDrawerItem] = useState(null);
  const [isDrawerEditing, setIsDrawerEditing] = useState(false);
  const [drawerFormData, setDrawerFormData] = useState({ title: '', description: '', owner: '', due_date: '' });

  // Confirmation modal on reject
  const [rejectModalTask, setRejectModalTask] = useState(null);

  // Distinct Owners & Meetings for Dropdowns
  const distinctOwners = useMemo(() => {
    const set = new Set();
    actionItems.forEach((i) => {
      if (i.owner && i.owner.trim()) set.add(i.owner.trim());
    });
    return Array.from(set).sort();
  }, [actionItems]);

  const distinctMeetings = useMemo(() => {
    const list = [];
    meetingMap.forEach((m) => {
      list.push(m);
    });
    return list;
  }, [meetingMap]);

  // Keep active drawer item updated if actionItems state updates
  useEffect(() => {
    if (activeDrawerItem) {
      const refreshed = actionItems.find((i) => i.task_id === activeDrawerItem.task_id);
      if (refreshed) setActiveDrawerItem(refreshed);
    }
  }, [actionItems, activeDrawerItem]);

  // Handle Sort Change
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter & Search Logic
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return actionItems.filter((i) => {
      // Category filter
      if (activeActionCategory !== 'all' && i.category !== activeActionCategory) return false;

      // Approval filter
      if (actionApprovalFilter !== 'all' && i.approval_status !== actionApprovalFilter) return false;

      // Progress / Overdue / Unassigned filter
      if (taskProgressFilter !== 'all') {
        if (taskProgressFilter === 'overdue' && !i.is_overdue) return false;
        else if (taskProgressFilter === 'unassigned' && (i.owner && i.owner.trim())) return false;
        else if (taskProgressFilter !== 'overdue' && taskProgressFilter !== 'unassigned' && (i.task_status || 'pending') !== taskProgressFilter) {
          return false;
        }
      }

      // Owner filter
      if (selectedOwner !== 'all') {
        if (selectedOwner === 'unassigned') {
          if (i.owner && i.owner.trim()) return false;
        } else if ((i.owner || '').trim().toLowerCase() !== selectedOwner.toLowerCase()) {
          return false;
        }
      }

      // Meeting filter
      if (selectedMeeting !== 'all' && i.meeting_id !== selectedMeeting) return false;

      // Text Search query
      if (query) {
        const meeting = meetingMap.get(i.meeting_id);
        const matchTitle = (i.title || '').toLowerCase().includes(query);
        const matchDesc = (i.description || '').toLowerCase().includes(query);
        const matchOwner = (i.owner || '').toLowerCase().includes(query);
        const matchMeeting = meeting ? (meeting.title || '').toLowerCase().includes(query) : false;
        if (!matchTitle && !matchDesc && !matchOwner && !matchMeeting) return false;
      }

      return true;
    });
  }, [
    actionItems,
    activeActionCategory,
    actionApprovalFilter,
    taskProgressFilter,
    selectedOwner,
    selectedMeeting,
    searchQuery,
    meetingMap,
  ]);

  // Sorted Items
  const sortedAndFilteredItems = useMemo(() => {
    const list = [...filteredItems];
    list.sort((a, b) => {
      let valA = a[sortField] || '';
      let valB = b[sortField] || '';

      if (sortField === 'meeting') {
        const mA = meetingMap.get(a.meeting_id)?.title || '';
        const mB = meetingMap.get(b.meeting_id)?.title || '';
        valA = mA;
        valB = mB;
      } else if (sortField === 'state') {
        valA = getDerivedState(a).key;
        valB = getDerivedState(b).key;
      }

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredItems, sortField, sortDirection, meetingMap]);

  // Checkbox Selection Handlers
  const isAllSelected = sortedAndFilteredItems.length > 0 && selectedTaskIds.size === sortedAndFilteredItems.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(sortedAndFilteredItems.map((i) => i.task_id)));
    }
  };

  const handleToggleSelectRow = (taskId, e) => {
    e.stopPropagation();
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // Bulk Actions
  const handleBulkApprove = async () => {
    if (!handleApproveItem || selectedTaskIds.size === 0) return;
    setIsBulkLoading(true);
    try {
      const pendingIds = sortedAndFilteredItems
        .filter((i) => selectedTaskIds.has(i.task_id) && i.approval_status !== 'approved')
        .map((i) => i.task_id);

      for (const id of pendingIds) {
        await handleApproveItem(id);
      }
      setSelectedTaskIds(new Set());
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkRejectConfirm = async () => {
    if (!handleRejectItem || selectedTaskIds.size === 0) return;
    setIsBulkLoading(true);
    try {
      const idsToReject = Array.from(selectedTaskIds);
      for (const id of idsToReject) {
        await handleRejectItem(id);
      }
      setSelectedTaskIds(new Set());
      setRejectModalTask(null);
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkExport = async () => {
    if (!handleExportSingleItem || selectedTaskIds.size === 0) return;
    setIsBulkLoading(true);
    try {
      const readyIds = sortedAndFilteredItems
        .filter((i) => selectedTaskIds.has(i.task_id) && i.approval_status === 'approved' && i.execution_status !== 'exported')
        .map((i) => i.task_id);

      for (const id of readyIds) {
        await handleExportSingleItem(id);
      }
      setSelectedTaskIds(new Set());
    } finally {
      setIsBulkLoading(false);
    }
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing inside form inputs
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }
      if (isDrawerEditing || rejectModalTask) return;

      if (e.key === 'j') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, sortedAndFilteredItems.length - 1));
      } else if (e.key === 'k') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'a' && focusedIndex >= 0 && sortedAndFilteredItems[focusedIndex]) {
        e.preventDefault();
        const item = sortedAndFilteredItems[focusedIndex];
        if (item.approval_status !== 'approved' && handleApproveItem) {
          handleApproveItem(item.task_id);
        }
      } else if (e.key === 'r' && focusedIndex >= 0 && sortedAndFilteredItems[focusedIndex]) {
        e.preventDefault();
        const item = sortedAndFilteredItems[focusedIndex];
        setRejectModalTask(item);
      } else if (e.key === 'e' && focusedIndex >= 0 && sortedAndFilteredItems[focusedIndex]) {
        e.preventDefault();
        const item = sortedAndFilteredItems[focusedIndex];
        setActiveDrawerItem(item);
        setIsDrawerEditing(true);
        setDrawerFormData({
          title: item.title || '',
          description: item.description || '',
          owner: item.owner || '',
          due_date: item.due_date || '',
        });
      } else if (e.key === 'Enter' && focusedIndex >= 0 && sortedAndFilteredItems[focusedIndex]) {
        e.preventDefault();
        setActiveDrawerItem(sortedAndFilteredItems[focusedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, sortedAndFilteredItems, isDrawerEditing, rejectModalTask, handleApproveItem]);

  // Open Drawer on Row Click
  const handleRowClick = (item) => {
    setActiveDrawerItem(item);
    setIsDrawerEditing(false);
    setDrawerFormData({
      title: item.title || '',
      description: item.description || '',
      owner: item.owner || '',
      due_date: item.due_date || '',
    });
  };

  // Drawer Edit Handlers
  const handleSaveDrawerEdit = async () => {
    if (!activeDrawerItem) return;
    if (setEditFormData) {
      setEditFormData(drawerFormData);
    }
    if (handleSaveEdit) {
      await handleSaveEdit(activeDrawerItem.task_id);
    }
    setIsDrawerEditing(false);
  };

  // Active Filter Removers
  const activeFilters = useMemo(() => {
    const list = [];
    if (searchQuery.trim()) {
      list.push({ label: `Search: "${searchQuery}"`, clear: () => setSearchQuery('') });
    }
    if (activeActionCategory !== 'all') {
      const catLabel =
        activeActionCategory === 'commitment'
          ? 'Commitments'
          : activeActionCategory === 'suggestion'
          ? 'Suggestions'
          : 'Open questions';
      list.push({ label: `Category: ${catLabel}`, clear: () => setActiveActionCategory('all') });
    }
    if (actionApprovalFilter !== 'all') {
      list.push({ label: `Approval: ${actionApprovalFilter}`, clear: () => setActionApprovalFilter('all') });
    }
    if (taskProgressFilter !== 'all') {
      list.push({ label: `Status: ${taskProgressFilter}`, clear: () => setTaskProgressFilter('all') });
    }
    if (selectedOwner !== 'all') {
      list.push({ label: `Owner: ${selectedOwner}`, clear: () => setSelectedOwner('all') });
    }
    if (selectedMeeting !== 'all') {
      const m = meetingMap.get(selectedMeeting);
      list.push({ label: `Meeting: ${m ? m.title : selectedMeeting}`, clear: () => setSelectedMeeting('all') });
    }
    return list;
  }, [
    searchQuery,
    activeActionCategory,
    actionApprovalFilter,
    taskProgressFilter,
    selectedOwner,
    selectedMeeting,
    meetingMap,
    setActiveActionCategory,
    setActionApprovalFilter,
    setTaskProgressFilter,
  ]);

  const handleClearAllFilters = () => {
    setSearchQuery('');
    setActiveActionCategory('all');
    setActionApprovalFilter('all');
    setTaskProgressFilter('all');
    setSelectedOwner('all');
    setSelectedMeeting('all');
  };

  return (
    <div className="action-items-container">
      {/* Header Bar */}
      <div className="actions-page-header">
        <div className="actions-header-left">
          <h2 className="actions-page-title">Action Items &amp; Commitments</h2>
          <span className="count-pill">{actionItems.length}</span>
        </div>

        {/* Keyboard Shortcuts Hint */}
        <div className="actions-shortcut-hint" title="Use keyboard shortcuts to triage quickly">
          <span>Shortcuts:</span>
          <kbd>J</kbd> / <kbd>K</kbd> move
          <kbd>A</kbd> approve
          <kbd>R</kbd> reject
          <kbd>E</kbd> edit
        </div>
      </div>

      {/* 1. ONE UNIFIED TOOLBAR */}
      <div className="actions-unified-toolbar">
        <div className="toolbar-controls-row">
          <div className="toolbar-left-group">
            {/* Search Input */}
            <div className="toolbar-search-box">
              <span className="toolbar-search-icon" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                className="toolbar-search-input"
                placeholder="Search action items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="toolbar-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Segmented Control for Category */}
            <div className="segmented-control" role="tablist">
              <button
                type="button"
                className={`segmented-control-btn ${activeActionCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveActionCategory('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`segmented-control-btn ${activeActionCategory === 'commitment' ? 'active' : ''}`}
                onClick={() => setActiveActionCategory('commitment')}
              >
                Commitments
              </button>
              <button
                type="button"
                className={`segmented-control-btn ${activeActionCategory === 'suggestion' ? 'active' : ''}`}
                onClick={() => setActiveActionCategory('suggestion')}
              >
                Suggestions
              </button>
              <button
                type="button"
                className={`segmented-control-btn ${activeActionCategory === 'unresolved_question' ? 'active' : ''}`}
                onClick={() => setActiveActionCategory('unresolved_question')}
              >
                Open questions
              </button>
            </div>

            {/* Dropdowns */}
            <div className="toolbar-dropdowns-group">
              {/* Approval Status Dropdown */}
              <select
                className="toolbar-select"
                value={actionApprovalFilter}
                onChange={(e) => setActionApprovalFilter(e.target.value)}
                aria-label="Filter by approval status"
              >
                <option value="all">Approval: All</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>

              {/* Task Status Dropdown */}
              <select
                className="toolbar-select"
                value={taskProgressFilter}
                onChange={(e) => setTaskProgressFilter(e.target.value)}
                aria-label="Filter by task status"
              >
                <option value="all">Status: All</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
                <option value="unassigned">Unassigned</option>
              </select>

              {/* Owner Dropdown */}
              <select
                className="toolbar-select"
                value={selectedOwner}
                onChange={(e) => setSelectedOwner(e.target.value)}
                aria-label="Filter by owner"
              >
                <option value="all">Owner: All</option>
                <option value="unassigned">Unassigned</option>
                {distinctOwners.map((owner) => (
                  <option key={owner} value={owner}>
                    {owner}
                  </option>
                ))}
              </select>

              {/* Meeting Dropdown */}
              <select
                className="toolbar-select"
                value={selectedMeeting}
                onChange={(e) => setSelectedMeeting(e.target.value)}
                aria-label="Filter by meeting"
              >
                <option value="all">Meeting: All</option>
                {distinctMeetings.map((m) => (
                  <option key={m.meeting_id} value={m.meeting_id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Density Toggle */}
          <div className="density-toggle-group">
            <button
              type="button"
              className={`density-btn ${density === 'dense' ? 'active' : ''}`}
              onClick={() => setDensity('dense')}
              title="Compact density"
              aria-label="Compact density"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <button
              type="button"
              className={`density-btn ${density === 'normal' ? 'active' : ''}`}
              onClick={() => setDensity('normal')}
              title="Comfortable density"
              aria-label="Comfortable density"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="3" y1="4" x2="21" y2="4" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="20" x2="21" y2="20" />
              </svg>
            </button>
          </div>
        </div>

        {/* Active Filter Chips */}
        {activeFilters.length > 0 && (
          <div className="toolbar-active-chips">
            {activeFilters.map((f, idx) => (
              <span key={idx} className="active-chip">
                <span>{f.label}</span>
                <button
                  type="button"
                  className="active-chip-remove"
                  onClick={f.clear}
                  aria-label={`Remove filter ${f.label}`}
                >
                  &times;
                </button>
              </span>
            ))}
            <button
              type="button"
              className="active-chips-clear-btn"
              onClick={handleClearAllFilters}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* 2. DENSE DATA TABLE */}
      <div className="action-table-wrapper">
        <table className={`action-data-table ${density}`}>
          <thead>
            <tr>
              <th style={{ width: '36px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleToggleSelectAll}
                  aria-label="Select all rows"
                />
              </th>
              <th className="sortable" onClick={() => handleSort('title')}>
                <span>Title</span>
                {sortField === 'title' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
              <th className="sortable" onClick={() => handleSort('category')} style={{ width: '110px' }}>
                <span>Type</span>
                {sortField === 'category' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
              <th className="sortable" onClick={() => handleSort('owner')} style={{ width: '130px' }}>
                <span>Owner</span>
                {sortField === 'owner' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
              <th className="sortable" onClick={() => handleSort('due_date')} style={{ width: '120px' }}>
                <span>Due Date</span>
                {sortField === 'due_date' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
              <th className="sortable" onClick={() => handleSort('state')} style={{ width: '130px' }}>
                <span>State</span>
                {sortField === 'state' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
              <th style={{ width: '90px' }}>
                <span>Signals</span>
              </th>
              <th className="sortable" onClick={() => handleSort('meeting')} style={{ width: '150px' }}>
                <span>Meeting</span>
                {sortField === 'meeting' && (
                  <span className="sort-indicator">{sortDirection === 'asc' ? '▲' : '▼'}</span>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedAndFilteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                    No action items found
                  </p>
                  <p style={{ fontSize: '0.8rem', margin: 0 }}>
                    {actionItems.length === 0
                      ? 'Process a meeting transcript to extract commitments and action items.'
                      : 'Try adjusting your search or filters.'}
                  </p>
                  {actionItems.length === 0 && onNavigate && (
                    <Button
                      size="sm"
                      variant="primary"
                      style={{ marginTop: '0.85rem' }}
                      onClick={() => onNavigate('meetings')}
                    >
                      Go to Meetings Workspace
                    </Button>
                  )}
                </td>
              </tr>
            ) : (
              sortedAndFilteredItems.map((item, idx) => {
                const meeting = meetingMap.get(item.meeting_id);
                const derivedState = getDerivedState(item);
                const relativeDue = formatRelativeDueDate(item.due_date, item.is_overdue);
                const isSelected = selectedTaskIds.has(item.task_id);
                const isFocused = focusedIndex === idx;

                return (
                  <tr
                    key={item.task_id}
                    className={`action-table-row ${isSelected ? 'selected' : ''} ${isFocused ? 'keyboard-focused' : ''}`}
                    onClick={() => handleRowClick(item)}
                  >
                    {/* Checkbox */}
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleToggleSelectRow(item.task_id, e)}
                        aria-label={`Select item ${item.title}`}
                      />
                    </td>

                    {/* Title */}
                    <td>
                      <div className="action-title-cell" title={item.title}>
                        {item.title}
                      </div>
                    </td>

                    {/* Type / Category */}
                    <td>
                      <span className={`badge-category ${item.category === 'unresolved_question' ? 'unresolved' : item.category}`} style={{ fontSize: '11px', padding: '0.15rem 0.45rem' }}>
                        {item.category === 'commitment' ? 'Commitment' : item.category === 'suggestion' ? 'Suggestion' : 'Question'}
                      </span>
                    </td>

                    {/* Owner */}
                    <td>
                      <span className={`action-owner-cell ${!item.owner ? 'unassigned' : ''}`}>
                        {item.owner || 'Unassigned'}
                      </span>
                    </td>

                    {/* Due Date (red if overdue) */}
                    <td>
                      <span className={`action-due-date ${relativeDue.isOverdue ? 'overdue' : ''}`}>
                        {relativeDue.text}
                      </span>
                    </td>

                    {/* ONE Primary State Chip */}
                    <td>
                      <StatusChip
                        type={derivedState.type}
                        status={derivedState.status}
                        label={derivedState.label}
                      />
                    </td>

                    {/* Secondary Signal Icons */}
                    <td>
                      <div className="signal-icons-cluster">
                        {/* Duplicate icon */}
                        {(item.duplicate_of || item.duplicate_note) && (
                          <span
                            className="signal-icon duplicate"
                            title={item.duplicate_note || `Potential duplicate of #${item.duplicate_of}`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                          </span>
                        )}

                        {/* Conflict icon */}
                        {item.conflict_flag && (
                          <span
                            className="signal-icon conflict"
                            title={item.conflict_note || 'Possible conflicting commitment'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          </span>
                        )}

                        {/* Clarification icon */}
                        {item.clarification_required && (
                          <span
                            className="signal-icon clarification"
                            title={item.clarification_note || 'Missing owner or deadline'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          </span>
                        )}

                        {/* Transcript Evidence icon */}
                        {item.source_text && (
                          <span
                            className={`signal-icon ${item.evidence_verified ? 'evidence-verified' : 'evidence-unverified'}`}
                            title={item.evidence_verified ? 'Transcript evidence verified' : 'Evidence unverified'}
                          >
                            {item.evidence_verified ? (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            ) : (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                              </svg>
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Meeting */}
                    <td>
                      <div className="action-meeting-cell" title={meeting ? meeting.title : item.meeting_id}>
                        {meeting ? meeting.title : item.meeting_id}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 3. BULK ACTION BAR (Visible when 1+ rows selected) */}
      {selectedTaskIds.size > 0 && (
        <div className="bulk-floating-bar" role="toolbar" aria-label="Bulk actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="bulk-count-badge">{selectedTaskIds.size}</span>
            <span style={{ fontSize: 'var(--font-size-13)', fontWeight: 500 }}>selected</span>
          </div>

          <div className="bulk-actions-group">
            <Button
              size="sm"
              variant="primary"
              onClick={handleBulkApprove}
              loading={isBulkLoading}
              title="Approve selected items"
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setRejectModalTask('bulk')}
              disabled={isBulkLoading}
              title="Reject selected items"
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleBulkExport}
              loading={isBulkLoading}
              title="Export approved selected items"
            >
              Export
            </Button>
            <Button
              size="sm"
              variant="ghost"
              style={{ color: '#FFFFFF' }}
              onClick={() => setSelectedTaskIds(new Set())}
            >
              Deselect
            </Button>
          </div>
        </div>
      )}

      {/* 4. RIGHT-SIDE DRAWER (Opens on row click) */}
      <Drawer
        isOpen={Boolean(activeDrawerItem)}
        onClose={() => {
          setActiveDrawerItem(null);
          setIsDrawerEditing(false);
        }}
        width="460px"
        title={
          activeDrawerItem && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>Item Details</span>
              <span className="count-pill" style={{ fontSize: '11px' }}>ID: {activeDrawerItem.task_id}</span>
            </div>
          )
        }
      >
        {activeDrawerItem && (
          <div className="drawer-content-stack">
            {/* Header Meta: Title + State */}
            <div className="drawer-header-meta">
              <div style={{ flex: 1 }}>
                <h4 className="drawer-item-title">{activeDrawerItem.title}</h4>
                <div className="drawer-meeting-ref">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>
                    Meeting: <strong>{meetingMap.get(activeDrawerItem.meeting_id)?.title || activeDrawerItem.meeting_id}</strong>
                  </span>
                </div>
              </div>

              <div>
                <StatusChip
                  type={getDerivedState(activeDrawerItem).type}
                  status={getDerivedState(activeDrawerItem).status}
                  label={getDerivedState(activeDrawerItem).label}
                />
              </div>
            </div>

            {/* Warning Banners if Conflict / Duplicate / Clarification */}
            {activeDrawerItem.conflict_flag && (
              <div className="drawer-warning-banner conflict">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <strong>Possible Conflict:</strong> {activeDrawerItem.conflict_note || 'Conflicts in owner, deadline, or outcome with another recorded item.'}
                </div>
              </div>
            )}

            {(activeDrawerItem.duplicate_of || activeDrawerItem.duplicate_note) && (
              <div className="drawer-warning-banner duplicate">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <div>
                  <strong>Potential Duplicate:</strong> {activeDrawerItem.duplicate_note || `Similar to item #${activeDrawerItem.duplicate_of}. Review before approval.`}
                </div>
              </div>
            )}

            {activeDrawerItem.clarification_required && (
              <div className="drawer-warning-banner clarification">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <strong>Clarification Needed:</strong> {activeDrawerItem.clarification_note || 'Missing assigned owner or explicit deadline requires human confirmation.'}
                </div>
              </div>
            )}

            {/* Description or Edit Mode */}
            {isDrawerEditing ? (
              <div className="action-item-edit-box" style={{ margin: 0 }}>
                <div className="edit-box-header">
                  <span>Edit Action Item Details</span>
                </div>
                <div className="edit-input-group">
                  <label className="edit-input-label">Title *</label>
                  <input
                    type="text"
                    className="edit-input-field"
                    value={drawerFormData.title}
                    onChange={(e) => setDrawerFormData((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="edit-input-group">
                  <label className="edit-input-label">Description / Context</label>
                  <textarea
                    className="edit-input-field"
                    rows={3}
                    value={drawerFormData.description}
                    onChange={(e) => setDrawerFormData((prev) => ({ ...prev, description: e.target.value }))}
                    style={{ resize: 'vertical' }}
                  />
                </div>
                <div className="edit-inputs-row">
                  <div className="edit-input-group">
                    <label className="edit-input-label">Assigned Owner</label>
                    <input
                      type="text"
                      className="edit-input-field"
                      value={drawerFormData.owner}
                      onChange={(e) => setDrawerFormData((prev) => ({ ...prev, owner: e.target.value }))}
                      placeholder="e.g. Sarah Chen"
                    />
                  </div>
                  <div className="edit-input-group">
                    <label className="edit-input-label">Due Date / Timeframe</label>
                    <input
                      type="text"
                      className="edit-input-field"
                      value={drawerFormData.due_date}
                      onChange={(e) => setDrawerFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                      placeholder="e.g. Friday 5pm, 2026-11-01"
                    />
                  </div>
                </div>
                <div className="edit-actions-row">
                  <Button size="sm" variant="secondary" onClick={() => setIsDrawerEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="primary" onClick={handleSaveDrawerEdit}>
                    Save Changes
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="drawer-section-title">Description</div>
                <p style={{ fontSize: 'var(--font-size-13)', color: 'var(--text-main)', margin: '0 0 0.85rem 0', lineHeight: 1.45 }}>
                  {activeDrawerItem.description || 'No description recorded.'}
                </p>

                {/* Attributes: Owner & Due Date */}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                      Owner
                    </span>
                    <span style={{ fontSize: 'var(--font-size-13)', fontWeight: 600, color: activeDrawerItem.owner ? 'var(--text-main)' : 'var(--status-amber)' }}>
                      {activeDrawerItem.owner || 'Unassigned'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                      Due Date
                    </span>
                    <span style={{ fontSize: 'var(--font-size-13)', fontWeight: 600 }}>
                      {activeDrawerItem.due_date || 'No date set'}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, display: 'block' }}>
                      Category
                    </span>
                    <span style={{ fontSize: 'var(--font-size-13)', fontWeight: 600, textTransform: 'capitalize' }}>
                      {activeDrawerItem.category.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Verbatim Transcript Quote with verified indicator */}
            {activeDrawerItem.source_text && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <span className="drawer-section-title" style={{ margin: 0 }}>Transcript Evidence</span>
                  {activeDrawerItem.evidence_verified ? (
                    <span style={{ fontSize: '11px', color: 'var(--status-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Grounded in Transcript
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--status-amber)', fontWeight: 600 }}>
                      Evidence Unverified
                    </span>
                  )}
                </div>
                <div className="drawer-quote-box">
                  <blockquote className="drawer-quote-text">
                    "{activeDrawerItem.source_text}"
                  </blockquote>
                </div>
              </div>
            )}

            {/* Status Control: Task Progress Switcher */}
            <div>
              <div className="drawer-section-title">Progress Status</div>
              <div className="progress-switcher">
                <button
                  type="button"
                  className={`progress-btn ${(activeDrawerItem.task_status || 'pending') === 'pending' ? 'active pending' : ''}`}
                  onClick={() => handleUpdateTaskProgress && handleUpdateTaskProgress(activeDrawerItem.task_id, 'pending')}
                  disabled={updatingProgressTaskId === activeDrawerItem.task_id}
                >
                  Pending
                </button>
                <button
                  type="button"
                  className={`progress-btn ${activeDrawerItem.task_status === 'in_progress' ? 'active in_progress' : ''}`}
                  onClick={() => handleUpdateTaskProgress && handleUpdateTaskProgress(activeDrawerItem.task_id, 'in_progress')}
                  disabled={updatingProgressTaskId === activeDrawerItem.task_id}
                >
                  In Progress
                </button>
                <button
                  type="button"
                  className={`progress-btn ${activeDrawerItem.task_status === 'completed' ? 'active completed' : ''}`}
                  onClick={() => handleUpdateTaskProgress && handleUpdateTaskProgress(activeDrawerItem.task_id, 'completed')}
                  disabled={updatingProgressTaskId === activeDrawerItem.task_id}
                >
                  Completed
                </button>
              </div>
            </div>

            {/* Action Review Bar: Approve / Reject / Edit / Export */}
            <div className="drawer-actions-bar">
              {activeDrawerItem.approval_status !== 'approved' && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => handleApproveItem && handleApproveItem(activeDrawerItem.task_id)}
                  loading={actionLoadingId === activeDrawerItem.task_id}
                >
                  Approve Item
                </Button>
              )}

              {activeDrawerItem.approval_status !== 'rejected' && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setRejectModalTask(activeDrawerItem)}
                  disabled={actionLoadingId === activeDrawerItem.task_id}
                >
                  Reject Item
                </Button>
              )}

              {!isDrawerEditing && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsDrawerEditing(true)}
                >
                  Edit Details
                </Button>
              )}

              {activeDrawerItem.approval_status === 'approved' && activeDrawerItem.execution_status !== 'exported' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleExportSingleItem && handleExportSingleItem(activeDrawerItem.task_id)}
                  loading={actionLoadingId === activeDrawerItem.task_id}
                >
                  Export Now
                </Button>
              )}

              {handleOpenTaskHistory && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleOpenTaskHistory(activeDrawerItem)}
                >
                  Audit History
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* 5. CONFIRM DIALOG ON REJECT */}
      <Modal
        isOpen={Boolean(rejectModalTask)}
        onClose={() => setRejectModalTask(null)}
        title="Confirm Rejection"
        maxWidth="440px"
        footer={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRejectModalTask(null)}
              disabled={isBulkLoading || actionLoadingId === rejectModalTask?.task_id}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                if (rejectModalTask === 'bulk') {
                  handleBulkRejectConfirm();
                } else if (rejectModalTask && handleRejectItem) {
                  handleRejectItem(rejectModalTask.task_id);
                  setRejectModalTask(null);
                }
              }}
              loading={isBulkLoading || actionLoadingId === rejectModalTask?.task_id}
            >
              Yes, Reject
            </Button>
          </>
        }
      >
        <div className="confirm-dialog-content">
          <p className="confirm-dialog-desc">
            {rejectModalTask === 'bulk'
              ? `Are you sure you want to reject ${selectedTaskIds.size} selected items? They will be blocked from downstream execution.`
              : `Are you sure you want to reject "${rejectModalTask?.title}"? It will be blocked from downstream execution.`}
          </p>
        </div>
      </Modal>
    </div>
  );
}
