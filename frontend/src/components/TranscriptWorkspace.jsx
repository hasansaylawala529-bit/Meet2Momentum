import React, { useState } from 'react';
import { createMeeting } from '../services/api';
import SampleTranscripts from './SampleTranscripts';

export default function TranscriptWorkspace({ onMeetingSaved }) {
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [transcript, setTranscript] = useState('');
  const [fileName, setFileName] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [apiError, setApiError] = useState('');
  const [successInfo, setSuccessInfo] = useState(null);

  const handleFileUpload = (e) => {
    setValidationError('');
    setApiError('');
    setSuccessInfo(null);

    const file = e.target.files && e.target.files[0];
    if (!file) return;

    // Check extension
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setValidationError('Only plain text (.txt) files are supported in Phase 1.');
      e.target.value = '';
      return;
    }

    // Limit size to 2MB
    if (file.size > 2 * 1024 * 1024) {
      setValidationError('File size exceeds 2MB limit. Please provide a smaller transcript file.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      if (!text || !text.trim()) {
        setValidationError(`Uploaded file "${file.name}" is empty or contains whitespace only.`);
        return;
      }
      setTranscript(text);
      setFileName(file.name);
      if (!title) {
        // Auto-suggest title from filename if empty
        const suggested = file.name.replace(/\.txt$/i, '').replace(/[_-]/g, ' ');
        setTitle(suggested);
      }
    };
    reader.onerror = () => {
      setValidationError('Unable to read selected file. Please verify file permissions or paste text directly.');
    };
    reader.readAsText(file);
  };

  const handleClearFile = (e) => {
    e.stopPropagation();
    setFileName('');
  };

  const handleSelectSample = (sample) => {
    setTitle(sample.title);
    setMeetingDate(sample.date);
    setTranscript(sample.transcript);
    setFileName('');
    setValidationError('');
    setApiError('');
    setSuccessInfo(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');
    setApiError('');
    setSuccessInfo(null);

    // Frontend validation
    if (!title.trim()) {
      setValidationError('Please enter a meeting title.');
      return;
    }
    if (!transcript.trim()) {
      setValidationError('Please enter or upload transcript text.');
      return;
    }

    setIsLoading(true);
    try {
      const saved = await createMeeting({
        title,
        transcript,
        meetingDate: meetingDate || null
      });

      setSuccessInfo({
        id: saved.meeting_id,
        title: saved.title,
        created_at: saved.created_at
      });

      // Clear input fields on successful persistence
      setTitle('');
      setMeetingDate('');
      setTranscript('');
      setFileName('');

      // Notify parent to refresh meeting history
      if (onMeetingSaved) {
        onMeetingSaved(saved);
      }
    } catch (err) {
      // Preserve the user's text on error
      setApiError(err.message || 'An unexpected error occurred while saving the meeting.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <h2>Meeting Transcript Ingestion</h2>
          <p>Paste notes or upload a .txt file. Raw text is verified and persisted to SQLite.</p>
        </div>
      </div>

      <div className="card-body">
        {/* Sample Demo Presets */}
        <SampleTranscripts onSelectSample={handleSelectSample} />

        {/* Alerts */}
        {validationError && (
          <div className="alert alert-warning" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div>{validationError}</div>
          </div>
        )}

        {apiError && (
          <div className="alert alert-error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <div>
              <strong>Submission Failed:</strong> {apiError}
              <div style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>Your text has been preserved. Please verify backend status and try again.</div>
            </div>
          </div>
        )}

        {successInfo && (
          <div className="alert alert-success" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <div>
              <strong>Meeting Persisted Successfully:</strong> "{successInfo.title}"
              <div style={{ marginTop: '0.2rem', fontSize: '0.75rem' }}>
                ID: <code style={{ backgroundColor: '#BBF7D0', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{successInfo.id}</code> &bull; Saved to SQLite at {new Date(successInfo.created_at).toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="meeting-title">
              Meeting Title <span className="required">*</span>
            </label>
            <input
              id="meeting-title"
              type="text"
              className="form-input"
              placeholder="e.g. Weekly Engineering Sync — Sprint 42"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isLoading}
              maxLength={255}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="meeting-date">
              Meeting Date <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(Optional)</span>
            </label>
            <input
              id="meeting-date"
              type="date"
              className="form-input"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* File Upload Zone */}
          <div className={`upload-zone ${fileName ? 'has-file' : ''}`}>
            <input
              id="transcript-file-upload"
              type="file"
              accept=".txt,text/plain"
              className="upload-input-hidden"
              onChange={handleFileUpload}
              disabled={isLoading}
              title="Upload meeting transcript text file"
            />
            <div className="upload-prompt">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <div className="upload-prompt-title">
                {fileName ? 'Click or drop another file to replace' : 'Click or drag a .txt transcript file here'}
              </div>
              <div className="upload-prompt-subtitle">
                Plain text (.txt) up to 2MB. Supports transcripts from Zoom, Teams, Meet, or manual notes.
              </div>
              {fileName && (
                <div className="upload-file-tag">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                  </svg>
                  <span>Loaded: {fileName}</span>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1E40AF', marginLeft: '0.25rem', fontWeight: 700 }}
                    title="Clear file tag"
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="meeting-transcript">
              Transcript / Meeting Notes <span className="required">*</span>
            </label>
            <textarea
              id="meeting-transcript"
              className="form-textarea"
              placeholder="Paste raw conversation, speaker turns, or meeting notes here. You can edit uploaded text before saving."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              disabled={isLoading}
              rows={8}
              required
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span>Character count: {transcript.length.toLocaleString()}</span>
              <span>Evidence preservation: Unmodified raw text is stored for verification</span>
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setTitle('');
                setMeetingDate('');
                setTranscript('');
                setFileName('');
                setValidationError('');
                setApiError('');
              }}
              disabled={isLoading || (!title && !transcript)}
            >
              Clear Form
            </button>

            <button
              id="submit-meeting-button"
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  <span>Saving to SQLite...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  <span>Save Meeting Transcript</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
