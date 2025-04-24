// src/api-client.js - A client for making API calls to the backend server

// Base API URL - update this for production
const API_BASE_URL = 'http://localhost:3000/api'; // Point to your Express backend

// Generic API request function
function apiRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${API_BASE_URL}${path}`;
    
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || null
    }, response => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      
      if (!response.ok || response.error) {
        return reject(new Error(response.error || `Request failed with status ${response.status}`));
      }
      
      resolve(response.data);
    });
  });
}

// Session-specific API functions
const SessionAPI = {
  // Get sessions for a professor
  getProfessorSessions: async (professorId, authToken) => {
    return apiRequest(`/sessions/professor/${professorId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
  },
  
  // Get a specific session
  getSession: async (sessionId, authToken) => {
    return apiRequest(`/sessions/${sessionId}`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
  },
  
  // Create a new session
  createSession: async (sessionData, authToken) => {
    return apiRequest('/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: sessionData
    });
  },
  
  // End a session
  endSession: async (sessionId, authToken) => {
    return apiRequest(`/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
  }
};

// Export the API clients
export { apiRequest, SessionAPI };