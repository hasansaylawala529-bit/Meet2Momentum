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

    if (!file.name.toLowerCase().endsWith('.txt')) {
      setValidationError('Please select a plain text (.txt) file.');
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setValidationError('File size exceeds the 2MB limit. Please provide a smaller transcript file.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      if (!text || !text.trim()) {
        setValidationError(`The uploaded file "${file.name}" is empty.`);
        return;
      }
      setTranscript(text);
      setFileName(file.name);
      if (!title) {
        const suggested = file.name.replace(/\.txt$/i, '').replace(/[_-]/g, ' ');
        setTitle(suggested);
      }
    };
    reader.onerror = () => {
      setValidationError('Unable to read the selected file. Please verify file permissions or paste text directly.');
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

      setTitle('');
      setMeetingDate('');
      setTranscript('');
      setFileName('');

      if (onMeetingSaved) {
        onMeetingSaved(saved);
      }
    } catch (err) {
      setApiError(err.message || 'An unexpected error occurred while saving the meeting.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="panel-card" style={{ borderTop: '3px solid var(--color-teal)' }}>
      <div className="panel-card-header">
        <div className="panel-header-icon" style={{ backgroundColor: 'var(--bg-pale-teal)', color: 'var(--color-teal)' }} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </div>
        <div>
          <h2 className="panel-title">Add Meeting Transcript</h2>
          <p className="panel-subtitle">Paste discussion notes or upload a text file to record your meeting</p>
        </div>
      </div>

      <div className="panel-card-body">
        {/* Sample Presets */}
        <SampleTranscripts onSelectSample={handleSelectSample} />

        {/* Validation Alert */}
        {validationError && (
          <div className="saas-alert saas-alert-warning" role="alert">
            <div className="alert-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div className="alert-content">
              <strong>Please check your input:</strong> {validationError}
            </div>
          </div>
        )}

        {/* Error Alert */}
        {apiError && (
          <div className="saas-alert saas-alert-error" role="alert">
            <div className="alert-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <div className="alert-content">
              <strong>Could not save meeting:</strong> {apiError}
              <div className="alert-hint">Your input has been preserved in the editor. Please try again.</div>
            </div>
          </div>
        )}

        {/* Success Alert */}
        {successInfo && (
          <div className="saas-alert saas-alert-success" role="alert">
            <div className="alert-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div className="alert-content">
              <strong>Meeting saved successfully:</strong> "{successInfo.title}"
              <div className="alert-meta">
                Ref: <code className="id-code-pill">{successInfo.id}</code> &bull; Saved at {new Date(successInfo.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-row-two-col">
            <div className="saas-form-group">
              <label className="saas-label" htmlFor="meeting-title">
                Meeting Title <span className="label-required">*</span>
              </label>
              <input
                id="meeting-title"
                type="text"
                className="saas-input"
                placeholder="e.g. Weekly Product Sync"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isLoading}
                maxLength={255}
                required
              />
            </div>

            <div className="saas-form-group">
              <label className="saas-label" htmlFor="meeting-date">
                Meeting Date <span className="label-optional">(Optional)</span>
              </label>
              <input
                id="meeting-date"
                type="date"
                className="saas-input"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Upload Zone */}
          <div className="saas-form-group">
            <label className="saas-label">
              Upload Transcript File <span className="label-optional">(.txt format)</span>
            </label>
            <div className={`saas-dropzone ${fileName ? 'has-file' : ''}`}>
              <input
                id="transcript-file-upload"
                type="file"
                accept=".txt,text/plain"
                className="dropzone-hidden-input"
                onChange={handleFileUpload}
                disabled={isLoading}
                title="Select .txt file to upload"
              />
              <div className="dropzone-content">
                <div className="dropzone-icon-circle">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div className="dropzone-text-primary">
                  {fileName ? 'File attached. Click or drop to replace' : 'Click to browse or drop a .txt transcript file here'}
                </div>
                <div className="dropzone-text-secondary">
                  Supports plain text meeting notes and transcripts up to 2MB.
                </div>
                {fileName && (
                  <div className="attached-file-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                      <polyline points="13 2 13 9 20 9"/>
                    </svg>
                    <span>{fileName}</span>
                    <button
                      type="button"
                      className="file-remove-btn"
                      onClick={handleClearFile}
                      title="Remove attachment"
                    >
                      &times;
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Transcript Textarea */}
          <div className="saas-form-group">
            <div className="label-with-meta">
              <label className="saas-label" htmlFor="meeting-transcript">
                Transcript or Meeting Notes <span className="label-required">*</span>
              </label>
              <span className="editor-char-count">
                {transcript.length.toLocaleString()} characters
              </span>
            </div>
            <textarea
              id="meeting-transcript"
              className="saas-textarea"
              placeholder="Paste dialogue turns, meeting notes, or review uploaded content here. Exact text is preserved as verifiable context for decisions and tasks."
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              disabled={isLoading}
              rows={9}
              required
            />
            <div className="textarea-footer-info">
              <span className="info-item" style={{ color: 'var(--color-teal)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Original text is preserved to ground decisions and commitments
              </span>
              <span className="info-item">Supports speaker names and bullet points</span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="panel-form-actions">
            <button
              type="button"
              className="saas-btn saas-btn-secondary"
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
              Clear
            </button>

            <button
              id="submit-meeting-button"
              type="submit"
              className="saas-btn saas-btn-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="spin-animation">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  <span>Saving meeting...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  <span>Save Meeting</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
