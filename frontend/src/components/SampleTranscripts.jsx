import React from 'react';

const DEMO_SAMPLES = [
  {
    title: "Sprint Sync & Roadmap Commitments",
    date: "2026-10-23",
    transcript: `Project meeting: October 23

Riya will complete the login page by October 25.
Aman will finish API integration by October 27.
We should consider adding dark mode next week.
We still need to decide who will test the application.
Riya will complete the login page by October 25.`
  },
  {
    title: "Product Architecture & Review",
    date: "2026-10-24",
    transcript: `Product Architecture Review: October 24

Vikram agreed to benchmark the SQLite query response times by Monday.
Neha proposed exploring Redis for caching if query times exceed 100ms.
Question remaining: Do we need multi-tenant database support for Phase 1?
Decision confirmed: Single SQLite database with strict foreign keys.`
  }
];

export default function SampleTranscripts({ onSelectSample }) {
  return (
    <div style={{ marginBottom: '1.25rem', padding: '0.85rem', backgroundColor: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
          DEMO DATA PRESETS (Test & Evaluation only)
        </span>
        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
          Loads into form without saving automatically
        </span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {DEMO_SAMPLES.map((sample, idx) => (
          <button
            key={idx}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onSelectSample(sample)}
            title="Click to populate form"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Load Sample: {sample.title}
          </button>
        ))}
      </div>
    </div>
  );
}
