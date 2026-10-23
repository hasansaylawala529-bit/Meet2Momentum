import React from 'react';

/**
 * Standard StatusChip component for approval, execution, progress, and category indicators.
 */
export default function StatusChip({
  type = 'approval', // 'approval' | 'firewall' | 'execution' | 'progress' | 'category' | 'count'
  status = 'pending',
  label,
  icon,
  className = '',
  title,
  style = {},
}) {
  let chipClass = '';
  let defaultLabel = label;
  let defaultIcon = icon;

  if (type === 'approval') {
    chipClass = `badge-approval ${status}`;
    if (!defaultLabel) {
      if (status === 'approved') defaultLabel = 'Approved';
      else if (status === 'rejected') defaultLabel = 'Rejected';
      else defaultLabel = 'Pending Review';
    }
  } else if (type === 'firewall') {
    chipClass = `badge-firewall ${status}`;
    if (!defaultLabel) {
      defaultLabel = status === 'eligible' ? 'Firewall: Eligible' : 'Firewall: Blocked';
    }
  } else if (type === 'execution') {
    chipClass = `badge-execution ${status}`;
    if (!defaultLabel) {
      if (status === 'exported') defaultLabel = 'Exported';
      else if (status === 'ready') defaultLabel = 'Ready';
      else defaultLabel = 'Blocked';
    }
  } else if (type === 'progress') {
    chipClass = `progress-status-badge ${status}`;
    if (!defaultLabel) {
      if (status === 'in_progress') defaultLabel = 'In Progress';
      else if (status === 'completed') defaultLabel = 'Completed';
      else defaultLabel = 'Pending';
    }
  } else if (type === 'category') {
    chipClass = `badge-category ${status === 'unresolved_question' ? 'unresolved' : status}`;
    if (!defaultLabel) {
      if (status === 'commitment') defaultLabel = 'Confirmed Commitment';
      else if (status === 'suggestion') defaultLabel = 'Suggestion';
      else defaultLabel = 'Unresolved Question';
    }
  } else if (type === 'count') {
    chipClass = 'count-pill';
    defaultLabel = defaultLabel || status;
  }

  return (
    <span
      className={`${chipClass} ${className}`.trim()}
      title={title}
      style={style}
    >
      {defaultIcon && <span className="chip-icon">{defaultIcon}</span>}
      <span>{defaultLabel}</span>
    </span>
  );
}
