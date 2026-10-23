const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

/**
 * Health check endpoint
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return await res.json();
  } catch (error) {
    throw new Error('Unable to connect to Meet2Momentum backend server.');
  }
}

/**
 * Ingest and persist a new meeting record
 */
export async function createMeeting({ title, transcript, meetingDate }) {
  if (!title || !title.trim()) {
    throw new Error('Meeting title is required.');
  }
  if (!transcript || !transcript.trim()) {
    throw new Error('Transcript text cannot be empty.');
  }

  const payload = {
    title: title.trim(),
    transcript: transcript.trim(),
    meeting_date: meetingDate ? meetingDate.trim() : null
  };

  const res = await fetch(`${API_BASE_URL}/api/meetings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let errorDetail = 'Failed to save meeting.';
    try {
      const errorJson = await res.json();
      if (errorJson.detail) {
        if (Array.isArray(errorJson.detail)) {
          errorDetail = errorJson.detail.map(d => d.msg || d).join(', ');
        } else {
          errorDetail = errorJson.detail;
        }
      }
    } catch {
      errorDetail = `Server responded with status ${res.status}`;
    }
    throw new Error(errorDetail);
  }

  return await res.json();
}

/**
 * Retrieve all saved meetings
 */
export async function fetchMeetings() {
  const res = await fetch(`${API_BASE_URL}/api/meetings`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    throw new Error('Failed to retrieve meetings history.');
  }

  return await res.json();
}

/**
 * Trigger AI extraction for a saved meeting transcript
 */
export async function extractMeetingOutcomes(meetingId) {
  if (!meetingId) {
    throw new Error('Meeting ID is required for AI extraction.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(`${API_BASE_URL}/api/meetings/${encodeURIComponent(meetingId)}/extract`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      let errorDetail = 'Failed to extract meeting intelligence.';
      try {
        const err = await res.json();
        if (err.detail) {
          errorDetail = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
        }
      } catch {
        errorDetail = `Server responded with error status ${res.status}`;
      }
      throw new Error(errorDetail);
    }

    return await res.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Extraction request timed out after 45 seconds. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch all decisions across workspace or for a specific meeting
 */
export async function fetchDecisions(meetingId = null) {
  const url = meetingId
    ? `${API_BASE_URL}/api/decisions?meeting_id=${encodeURIComponent(meetingId)}`
    : `${API_BASE_URL}/api/decisions`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    throw new Error('Failed to retrieve decisions.');
  }

  return await res.json();
}

/**
 * Fetch all action items across workspace or filtered by meeting/category
 */
export async function fetchActionItems(meetingId = null, category = null) {
  const params = new URLSearchParams();
  if (meetingId) params.append('meeting_id', meetingId);
  if (category) params.append('category', category);

  const queryString = params.toString();
  const url = queryString ? `${API_BASE_URL}/api/action-items?${queryString}` : `${API_BASE_URL}/api/action-items`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    throw new Error('Failed to retrieve action items.');
  }

  return await res.json();
}
