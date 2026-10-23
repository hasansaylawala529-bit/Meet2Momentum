import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import TranscriptWorkspace from './components/TranscriptWorkspace';
import MeetingHistory from './components/MeetingHistory';
import { checkBackendHealth, fetchMeetings } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('meetings');
  const [isConnected, setIsConnected] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);
  
  const [meetings, setMeetings] = useState([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(false);
  const [meetingsError, setMeetingsError] = useState('');

  // Check health and load meetings
  const loadMeetingsData = useCallback(async () => {
    setIsLoadingMeetings(true);
    setMeetingsError('');
    try {
      const data = await fetchMeetings();
      setMeetings(data);
      setIsConnected(true);
    } catch (err) {
      setMeetingsError(err.message || 'Unable to load meeting history.');
      setIsConnected(false);
    } finally {
      setIsLoadingMeetings(false);
      setIsCheckingHealth(false);
    }
  }, []);

  useEffect(() => {
    // Initial health check
    checkBackendHealth()
      .then(() => {
        setIsConnected(true);
        loadMeetingsData();
      })
      .catch(() => {
        setIsConnected(false);
        setIsCheckingHealth(false);
      });
  }, [loadMeetingsData]);

  const handleMeetingSaved = (newMeeting) => {
    setMeetings((prev) => [newMeeting, ...prev]);
  };

  return (
    <div className="app-container">
      <Header isConnected={isConnected} isChecking={isCheckingHealth} />
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        meetingCount={meetings.length}
      />

      <main className="main-wrapper">
        {/* Core Principles Banner */}
        <div className="notice-banner">
          <div className="notice-text">
            <strong>Core Principle:</strong> AI proposes. Humans approve. The system enforces.
          </div>
          <span className="notice-tag">Phase 1 Foundation Active</span>
        </div>

        {/* Tab 1: Meetings Workspace (Active in Phase 1) */}
        {activeTab === 'meetings' && (
          <div className="grid-two-column">
            <TranscriptWorkspace onMeetingSaved={handleMeetingSaved} />
            <MeetingHistory
              meetings={meetings}
              isLoading={isLoadingMeetings}
              error={meetingsError}
              onRefresh={loadMeetingsData}
            />
          </div>
        )}

        {/* Tab 2: Overview & Architecture */}
        {activeTab === 'overview' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title-group">
                <h2>Meet2Momentum — System Architecture & Phased Blueprint</h2>
                <p>HACKNOVA'26 Problem Statement 4 Specification Reference</p>
              </div>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
                  <div style={{ fontWeight: 600, color: '#1E40AF', marginBottom: '0.35rem' }}>1. Secure Ingestion & Parsing</div>
                  <p style={{ fontSize: '0.8rem', color: '#475569' }}>
                    Multi-modal meeting intake (.txt file uploads, direct text). Raw input is preserved without modification to anchor ground-truth evidence.
                  </p>
                </div>
                <div style={{ padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
                  <div style={{ fontWeight: 600, color: '#1E40AF', marginBottom: '0.35rem' }}>2. AI Extraction & Classification</div>
                  <p style={{ fontSize: '0.8rem', color: '#475569' }}>
                    Google Gemini API identifies decisions, action items, owners, deadlines. Strictly separates confirmed commitments from suggestions and open questions.
                  </p>
                </div>
                <div style={{ padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
                  <div style={{ fontWeight: 600, color: '#1E40AF', marginBottom: '0.35rem' }}>3. Commitment Firewall</div>
                  <p style={{ fontSize: '0.8rem', color: '#475569' }}>
                    Deterministic backend enforcement gate: no task enters external execution, export, or sync without explicit human approval.
                  </p>
                </div>
              </div>

              <div style={{ padding: '1.25rem', backgroundColor: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1D4ED8', marginBottom: '0.5rem' }}>
                  Current Phase Status: Phase 1 — Secure Foundation Complete
                </h3>
                <ul style={{ paddingLeft: '1.25rem', fontSize: '0.825rem', color: '#1E3A8A', lineHeight: 1.6 }}>
                  <li><strong>Backend:</strong> FastAPI + SQLite tables initialized for meetings, decisions, and action items.</li>
                  <li><strong>Validation:</strong> Pydantic schemas enforcing category definitions (<code>commitment</code>, <code>suggestion</code>, <code>unresolved_question</code>) and approval states.</li>
                  <li><strong>Frontend:</strong> React + Vite using strict professional light theme (clean blue/slate palette, 0 dark-mode surfaces).</li>
                  <li><strong>Persistence:</strong> Real-time SQLite persistence for meeting transcripts with immediate round-trip retrieval.</li>
                  <li><strong>AI Scope:</strong> Google Gemini API extraction deferred to Phase 2 per strict specification boundaries.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Action Items (Deferred to Phase 2) */}
        {activeTab === 'actions' && (
          <div className="coming-soon-card">
            <span className="coming-soon-phase">Phase 2 Deliverable</span>
            <h2 className="coming-soon-title" style={{ marginTop: '0.85rem' }}>Action Items & Commitment Classifier</h2>
            <p className="coming-soon-desc">
              Automatic extraction of action items, owners, deadlines, and classification into 
              <strong> Confirmed Commitments</strong>, <strong>Suggestions</strong>, and <strong>Unresolved Questions</strong> will be introduced in Phase 2 via Google Gemini API.
            </p>
            <div style={{ display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#DCFCE7', color: '#15803D', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 500 }}>
                ✓ Database Schema Initialized
              </span>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#DCFCE7', color: '#15803D', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 500 }}>
                ✓ Pydantic Domain Validation Ready
              </span>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#FEF3C7', color: '#B45309', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 500 }}>
                ⏳ Awaiting Phase 2 AI Extractor
              </span>
            </div>
          </div>
        )}

        {/* Tab 4: Decisions (Deferred to Phase 2) */}
        {activeTab === 'decisions' && (
          <div className="coming-soon-card">
            <span className="coming-soon-phase">Phase 2 Deliverable</span>
            <h2 className="coming-soon-title" style={{ marginTop: '0.85rem' }}>Decisions & Evidence Verification</h2>
            <p className="coming-soon-desc">
              Extracted meeting decisions with exact citation sentences linked to raw transcript evidence will populate here following Phase 2 implementation.
            </p>
            <div style={{ display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#DCFCE7', color: '#15803D', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 500 }}>
                ✓ SQLite Decisions Table Ready
              </span>
              <span style={{ fontSize: '0.75rem', backgroundColor: '#FEF3C7', color: '#B45309', padding: '0.25rem 0.5rem', borderRadius: '4px', fontWeight: 500 }}>
                ⏳ Awaiting Phase 2 Decision Extractor
              </span>
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <div>Meet2Momentum &bull; HACKNOVA'26 Problem Statement 4 &bull; AI Proposes &bull; Humans Approve &bull; The System Enforces</div>
      </footer>
    </div>
  );
}
