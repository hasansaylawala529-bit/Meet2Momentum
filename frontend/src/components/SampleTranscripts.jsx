import React from 'react';

const SAMPLES = [
  {
    title: "Product Sprint Planning",
    date: "2026-10-23",
    transcript: `Project meeting: October 23

Riya will complete the login page by October 25.
Aman will finish API integration by October 27.
We should consider adding dark mode next week.
We still need to decide who will test the application.
Riya will complete the login page by October 25.`
  },
  {
    title: "Architecture & Database Review",
    date: "2026-10-24",
    transcript: `Product Architecture Review: October 24

Vikram agreed to benchmark database query response times by Monday.
Neha proposed exploring Redis for caching if query times exceed 100ms.
Question remaining: Do we need multi-tenant database support for Phase 1?
Decision confirmed: Single database with strict foreign keys.`
  }
];

export default function SampleTranscripts({ onSelectSample }) {
  return (
    <div className="preset-container">
      <div className="preset-header">
        <div className="preset-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>SAMPLE TRANSCRIPTS</span>
        </div>
        <span className="preset-hint">
          Click to populate notes into editor
        </span>
      </div>

      <div className="preset-chips">
        {SAMPLES.map((sample, idx) => (
          <button
            key={idx}
            type="button"
            className="preset-chip"
            onClick={() => onSelectSample(sample)}
            title="Load this sample meeting into the editor"
          >
            <span className="preset-chip-bullet" />
            <span className="preset-chip-title">{sample.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
