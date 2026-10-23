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
