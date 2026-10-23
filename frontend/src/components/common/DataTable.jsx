import React from 'react';

/**
 * Reusable DataTable component for structured tabular presentations.
 */
export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  emptyMessage = 'No records found.',
  className = '',
  loading = false,
}) {
  if (loading) {
    return (
      <div className="table-loading-container" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading table data...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="saas-empty-state" style={{ padding: '2.5rem' }}>
        <p className="empty-state-desc">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="table-responsive-wrapper" style={{ width: '100%', overflowX: 'auto' }}>
      <table className={`saas-table ${className}`.trim()}>
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={col.key || idx}
                style={{
                  width: col.width,
                  textAlign: col.align || 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => {
            const rowKey = row[keyField] || rowIdx;
            return (
              <tr key={rowKey}>
                {columns.map((col, colIdx) => (
                  <td
                    key={col.key || colIdx}
                    style={{ textAlign: col.align || 'left' }}
                  >
                    {col.render ? col.render(row, rowIdx) : row[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
