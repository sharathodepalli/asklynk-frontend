/**
 * AskLynk Chrome Extension - Content Script
 * 
 * This script handles the UI components and interactions for the AskLynk extension,
 * including chat functionality, session management, and AI assistant integration.
 */

// Global state variables
let chatContainerCreated = false;
let chatVisible = false;
let currentUser = null;
let isInitialized = false;
let geminiContext = {
  sessionTitle: '',
  sessionDescription: '',
  sessionId: '',
  messages: []
};

// Voice capture state variables
let voiceRecognition = null;
let isVoiceCapturing = false;
let currentSessionId = null;
let lastTranscriptTime = 0;
const TRANSCRIPT_DEBOUNCE_TIME = 1000; // 1 second debounce

// Enhanced voice capture with chunked processing
let voiceTranscriptBuffer = '';
let bufferStartTime = 0;
const CHUNK_DURATION = 7000; // 7 seconds per chunk
let chunkTimer = null;
let consecutiveSilenceCount = 0;
const MAX_SILENCE_CHUNKS = 3; // Stop after 3 silent chunks

// ==================== UTILITY FUNCTIONS ====================


/**
 * Helper function to safely extract array data from API responses
 * @param {Object} response - The API response object
 * @param {Array} defaultArray - Default array to return if extraction fails
 * @returns {Array} The extracted array or the default array
 */
function extractArrayFromResponse(response, defaultArray = []) {
  if (!response || !response.ok) {
    return defaultArray;
  }
  
  // Check different possible response structures
  if (Array.isArray(response.data)) {
    return response.data;
  } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
    return response.data.data;
  } else if (response.data && typeof response.data === 'object') {
    // Try to find any array property
    const arrayProps = Object.keys(response.data).filter(key => 
      Array.isArray(response.data[key])
    );
    
    if (arrayProps.length > 0) {
      return response.data[arrayProps[0]];
    }
  }
  
  console.warn('Could not extract array from response:', response);
  return defaultArray;
}

/**
 * Gets the authentication token from the background script
 * @returns {Promise<string|null>} Authentication token or null if not authenticated
 */
async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'REFRESH_TOKEN' }, (response) => {
      if (response && response.success && response.token) {
        resolve(response.token);
      } else {
        console.error('Failed to retrieve token from background');
        resolve(null);
      }
    });
  });
}

/**
 * Gets the user session token specifically for voice transcript API calls
 * This should use the actual Supabase user session token, not the anon key
 * @returns {Promise<string|null>} User session token or null if not authenticated
 */
async function getUserSessionToken() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_USER_SESSION_TOKEN' }, (response) => {
      if (response && response.success && response.sessionToken) {
        console.log('✅ User session token retrieved for voice API');
        resolve(response.sessionToken);
      } else {
        console.error('❌ Failed to retrieve user session token, falling back to regular auth token');
        // Fallback to regular auth token
        getAuthToken().then(resolve);
      }
    });
  });
}

/**
 * Store the user's Supabase session token for voice transcript API calls
 * This should be called after successful Supabase authentication
 * @param {string} sessionToken - The user's Supabase session access_token
 */
async function storeUserSessionToken(sessionToken) {
  if (!sessionToken) {
    console.error('❌ Cannot store empty session token');
    return false;
  }
  
  // Validate token format (should not be anon key)
  if (sessionToken.includes('"role":"anon"')) {
    console.error('❌ WRONG TOKEN: This is an anonymous key, not a user session token!');
    console.error('❌ Expected user session token with role: "authenticated"');
    return false;
  }
  
  console.log('✅ Storing user session token for voice API:', sessionToken.substring(0, 20) + '...');
  
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({
      type: 'SET_USER_SESSION_TOKEN',
      sessionToken: sessionToken
    }, (response) => {
      if (response && response.success) {
        console.log('✅ User session token stored successfully');
        resolve(true);
      } else {
        console.error('❌ Failed to store user session token:', response?.error);
        resolve(false);
      }
    });
  });
}

/**
 * Get and store the proper Supabase user session token
 * This function should be called after user successfully logs in
 * Call this from browser console: getAndStoreSupabaseSessionToken()
 */
window.getAndStoreSupabaseSessionToken = async function() {
  console.log('🔑 Getting Supabase user session token...');
  
  // Check if Supabase is available
  if (typeof window.supabase === 'undefined') {
    console.error('❌ Supabase not available. Please ensure Supabase client is loaded.');
    console.log('💡 Alternative: Manually set token with setTestUserSessionToken("your_token_here")');
    return;
  }
  
  try {
    // Get current session from Supabase
    const { data: { session }, error } = await window.supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Error getting Supabase session:', error);
      return;
    }
    
    if (!session) {
      console.error('❌ No active Supabase session found. Please log in first.');
      return;
    }
    
    if (!session.access_token) {
      console.error('❌ No access token in session');
      return;
    }
    
    console.log('✅ Found Supabase session for user:', session.user.email);
    console.log('✅ Session token:', session.access_token.substring(0, 20) + '...');
    
    // Store the user session token
    const stored = await storeUserSessionToken(session.access_token);
    
    if (stored) {
      console.log('🎉 SUCCESS: User session token stored! Voice transcripts will now use the correct token.');
      console.log('🧪 Test voice capture now - it should save to database');
    }
    
  } catch (error) {
    console.error('❌ Error accessing Supabase session:', error);
  }
};

/**
 * Checks the user's authentication state
 */
function checkAuthState() {
  chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response) => {
    console.log("Auth check response:", response);
    if (response && response.isLoggedIn) {
      currentUser = response.user;
      console.log('User is authenticated:', currentUser);
      
      // Update UI if chat container exists
      if (chatContainerCreated) {
        updateChatUI();
      }
      
      // Update floating button appearance
      updateDraggableButton(); 
    } else {
      console.log('User is not authenticated');
    }
  });
}


/**
 * Helper function to capitalize the first letter of a string
 * @param {string} string - The input string
 * @returns {string} String with first letter capitalized
 */
function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// At the beginning of your JavaScript code (around line ~100)

// Function to ensure a session is open before showing the anonymous dashboard
function ensureSessionData(callback) {
  chrome.storage.local.get(['activeSession', 'authState'], (result) => {
    if (result.activeSession && result.authState && result.authState.token) {
      // Session data exists, proceed with callback
      callback(result.activeSession.id, result.authState.token);
    } else {
      // No session data, prompt user to join a session
      const container = document.getElementById('lynkk-anonymous-content');
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 24px; color: #64748b;">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p style="margin: 0; font-size: 15px;">No active session</p>
            <p style="margin: 8px 0 0; font-size: 13px;">Please join a session first</p>
            <button id="lynkk-join-session-btn" style="margin-top: 16px; background-color: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer;">
              Join a Session
            </button>
          </div>
        `;

        // Add click handler for the join session button
        const joinBtn = document.getElementById('lynkk-join-session-btn');
        if (joinBtn) {
          joinBtn.addEventListener('click', () => {
            // Switch to the main dashboard to show join session UI
            const dashboardContainer = document.getElementById('lynkk-dashboard-container');
            if (dashboardContainer) {
              renderStudentDashboard(dashboardContainer);
            }
          });
        }
      }
    }
  });
}

/**
 * Shows a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (info, success, error)
 */
function showToast(message, type = 'info') {
  // Remove any existing toast
  const existingToast = document.getElementById('lynkk-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.id = 'lynkk-toast';
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.left = '50%';
  toast.style.transform = 'translateX(-50%)';
  toast.style.padding = '10px 20px';
  toast.style.borderRadius = '6px';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '500';
  toast.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
  toast.style.zIndex = '10000';
  toast.style.transition = 'opacity 0.3s ease';
  
  // Set color based on type
  if (type === 'error') {
    toast.style.backgroundColor = '#FEE2E2';
    toast.style.color = '#B91C1C';
    toast.style.border = '1px solid #FECACA';
  } else if (type === 'success') {
    toast.style.backgroundColor = '#D1FAE5';
    toast.style.color = '#065F46';
    toast.style.border = '1px solid #A7F3D0';
  } else {
    toast.style.backgroundColor = '#EFF6FF';
    toast.style.color = '#1E40AF';
    toast.style.border = '1px solid #DBEAFE';
  }
  
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    
    // Remove from DOM after fade out
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

/**
 * Helper function to format AI response with line breaks
 * @param {string} text - The AI response text
 * @returns {string} Formatted text with HTML line breaks
 */
function formatAIResponse(text) {
  return text.replace(/\n/g, '<br>');
}

// ==================== VOICE CAPTURE FUNCTIONS ====================

/**
 * Initialize voice recognition for professor's speech capture with chunked processing
 */
function initializeVoiceCapture() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Speech recognition not supported in this browser');
    showToast('Voice capture not supported in this browser', 'error');
    return false;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceRecognition = new SpeechRecognition();
  
  // Configure speech recognition for continuous chunked processing
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;
  voiceRecognition.lang = 'en-US';
  voiceRecognition.maxAlternatives = 1;
  
  // Handle speech recognition results with chunked processing
  voiceRecognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    
    console.log('Voice recognition onresult triggered, results count:', event.results.length);
    
    // Process all results from the last result index
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
        console.log('Final transcript detected:', transcript);
      } else {
        interimTranscript += transcript;
        console.log('Interim transcript:', transcript);
      }
    }
    
    // Add final transcript to buffer
    if (finalTranscript.trim()) {
      console.log('Adding final transcript to buffer:', finalTranscript.trim());
      addToTranscriptBuffer(finalTranscript.trim());
      consecutiveSilenceCount = 0; // Reset silence counter on speech
    }
    
    // Update UI with current recognition status
    updateVoiceRecognitionUI(interimTranscript);
  };
  
  voiceRecognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    
    switch (event.error) {
      case 'not-allowed':
        showToast('Microphone access denied. Please allow microphone permissions.', 'error');
        stopVoiceCapture();
        break;
      case 'no-speech':
        console.log('No speech detected, continuing...');
        consecutiveSilenceCount++;
        break;
      case 'network':
        showToast('Network error during voice recognition. Retrying...', 'error');
        // Auto-retry after network error
        setTimeout(() => {
          if (isVoiceCapturing) {
            restartVoiceRecognition();
          }
        }, 2000);
        break;
      default:
        console.warn('Speech recognition error:', event.error);
    }
  };
  
  voiceRecognition.onend = () => {
    console.log('Voice recognition ended');
    
    // Auto-restart if still capturing and not too many consecutive silent chunks
    if (isVoiceCapturing && currentSessionId && consecutiveSilenceCount < MAX_SILENCE_CHUNKS) {
      setTimeout(() => {
        if (isVoiceCapturing) {
          try {
            voiceRecognition.start();
          } catch (error) {
            console.error('Error restarting voice recognition:', error);
            // Try to restart after a longer delay
            setTimeout(() => {
              if (isVoiceCapturing) {
                restartVoiceRecognition();
              }
            }, 5000);
          }
        }
      }, 100);
    } else if (consecutiveSilenceCount >= MAX_SILENCE_CHUNKS) {
      console.log('Stopping voice capture due to prolonged silence');
      stopVoiceCapture();
      showToast('Voice capture paused due to silence. Click to restart.', 'info');
    }
  };
  
  voiceRecognition.onstart = () => {
    console.log('Voice recognition started');
    updateVoiceRecognitionUI('Listening...');
  };
  
  return true;
}

/**
 * Add transcript to buffer and manage chunked processing
 * @param {string} transcript - The new transcript to add
 */
function addToTranscriptBuffer(transcript) {
  const now = Date.now();
  
  // Initialize buffer timing if this is the first transcript
  if (!bufferStartTime) {
    bufferStartTime = now;
    startChunkTimer();
  }
  
  // Add transcript to buffer with spacing
  if (voiceTranscriptBuffer) {
    voiceTranscriptBuffer += ' ' + transcript;
  } else {
    voiceTranscriptBuffer = transcript;
  }
  
  console.log('Added to buffer:', transcript);
  console.log('Current buffer length:', voiceTranscriptBuffer.length);
  
  // Check if buffer is getting too long (safety measure)
  if (voiceTranscriptBuffer.length > 1000) {
    console.log('Buffer getting too long, processing early');
    processTranscriptChunk();
  }
}

/**
 * Start timer for chunk processing
 */
function startChunkTimer() {
  console.log('⏰ Starting chunk timer for', CHUNK_DURATION / 1000, 'seconds');
  
  if (chunkTimer) {
    clearTimeout(chunkTimer);
    console.log('⏰ Cleared existing timer');
  }
  
  chunkTimer = setTimeout(() => {
    console.log('⏰ Timer expired, processing chunk');
    processTranscriptChunk();
  }, CHUNK_DURATION);
}

/**
 * Process and send the current transcript chunk
 */
async function processTranscriptChunk() {
  console.log('processTranscriptChunk called, buffer content:', voiceTranscriptBuffer);
  
  if (!voiceTranscriptBuffer.trim()) {
    console.log('Empty buffer, skipping chunk processing');
    resetTranscriptBuffer();
    return;
  }
  
  const chunkToProcess = voiceTranscriptBuffer.trim();
  console.log('Processing transcript chunk:', chunkToProcess);
  console.log('Chunk length:', chunkToProcess.length);
  
  // Reset buffer for next chunk
  resetTranscriptBuffer();
  
  // Send to backend for processing and embedding generation
  try {
    console.log('Calling sendTranscriptToBackend with:', chunkToProcess.substring(0, 50) + '...');
    await sendTranscriptToBackend(chunkToProcess);
  } catch (error) {
    console.error('Error processing transcript chunk:', error);
    // Could implement retry logic here
  }
}

/**
 * Reset transcript buffer and timing
 */
function resetTranscriptBuffer() {
  voiceTranscriptBuffer = '';
  bufferStartTime = 0;
  if (chunkTimer) {
    clearTimeout(chunkTimer);
    chunkTimer = null;
  }
}

/**
 * Test function to manually trigger voice transcript sending
 * Can be called from browser console: testVoiceTranscriptSending()
 */
window.testVoiceTranscriptSending = async function() {
  console.log('🧪 Testing voice transcript sending...');
  
  if (!currentSessionId) {
    console.error('❌ No active session ID. Please start a session first.');
    return;
  }
  
  const testTranscript = "This is a test transcript to verify backend integration is working properly with the correct user session token.";
  console.log('🧪 Sending test transcript:', testTranscript);
  
  await sendTranscriptToBackend(testTranscript);
};

/**
 * Test function to set a user session token manually
 * Can be called from browser console: setTestUserSessionToken('your_token_here')
 */
window.setTestUserSessionToken = async function(sessionToken) {
  console.log('🧪 Setting test user session token...');
  
  if (!sessionToken) {
    console.error('❌ Please provide a session token');
    console.log('💡 Usage: setTestUserSessionToken("eyJhbGciOiJIUzI1NiIsImtpZCI6...")');
    return;
  }
  
  // Validate token format
  if (sessionToken.includes('"role":"anon"')) {
    console.error('❌ WRONG TOKEN: This appears to be an anonymous key!');
    console.error('❌ You need the user session token, not the anon key');
    console.log('💡 Get the correct token with: getAndStoreSupabaseSessionToken()');
    return;
  }
  
  const stored = await storeUserSessionToken(sessionToken);
  
  if (stored) {
    console.log('✅ Test user session token set successfully');
    console.log('🧪 Now test voice capture: testVoiceTranscriptSending()');
  }
};

/**
 * Test function to check what token is currently being used
 */
window.checkCurrentTokenType = async function() {
  console.log('🔍 Checking current token type...');
  
  try {
    const userToken = await getUserSessionToken();
    const regularToken = await getAuthToken();
    
    console.log('🔍 User session token:', userToken ? userToken.substring(0, 20) + '...' : 'NOT SET');
    console.log('🔍 Regular auth token:', regularToken ? regularToken.substring(0, 20) + '...' : 'NOT SET');
    
    if (userToken && userToken !== regularToken) {
      console.log('✅ GOOD: Using separate user session token for voice API');
      
      // Check if it's an anon key
      if (userToken.includes('"role":"anon"')) {
        console.log('❌ WARNING: User session token appears to be an anon key!');
      } else {
        console.log('✅ EXCELLENT: User session token appears to be correct');
      }
    } else {
      console.log('❌ WARNING: Voice API will use regular auth token (likely anon key)');
    }
    
  } catch (error) {
    console.error('❌ Error checking tokens:', error);
  }
};

/**
 * Test function to check current voice capture state
 */
window.checkVoiceCaptureState = function() {
  console.log('🔍 Voice Capture State Check:');
  console.log('- isVoiceCapturing:', isVoiceCapturing);
  console.log('- currentSessionId:', currentSessionId);
  console.log('- voiceRecognition:', voiceRecognition);
  console.log('- voiceTranscriptBuffer:', voiceTranscriptBuffer);
  console.log('- bufferStartTime:', bufferStartTime);
  console.log('- chunkTimer:', chunkTimer);
  console.log('- currentUser:', currentUser);
};

/**
 * Restart voice recognition with error handling
 */
function restartVoiceRecognition() {
  try {
    if (voiceRecognition) {
      voiceRecognition.stop();
    }
    setTimeout(() => {
      if (isVoiceCapturing && voiceRecognition) {
        voiceRecognition.start();
      }
    }, 1000);
  } catch (error) {
    console.error('Error in restartVoiceRecognition:', error);
  }
}

/**
 * Start voice capture for the current session with enhanced error handling
 * @param {string} sessionId - The session ID to associate with voice capture
 */
function startVoiceCapture(sessionId) {
  console.log('Attempting to start voice capture for session:', sessionId);
  
  // Validate prerequisites
  if (!currentUser || currentUser.role !== 'professor') {
    console.log('Voice capture only available for professors');
    return false;
  }
  
  if (!sessionId) {
    console.error('Cannot start voice capture: no session ID provided');
    showToast('Cannot start voice capture: no active session', 'error');
    return false;
  }
  
  if (isVoiceCapturing) {
    console.log('Voice capture already active for session:', currentSessionId);
    return true;
  }
  
  // Initialize voice recognition if not already done
  if (!voiceRecognition && !initializeVoiceCapture()) {
    showToast('Voice capture not available in this browser', 'error');
    return false;
  }
  
  try {
    // Set session state
    currentSessionId = sessionId;
    isVoiceCapturing = true;
    consecutiveSilenceCount = 0;
    resetTranscriptBuffer();
    
    // Request microphone permission and start recognition
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        console.log('Microphone permission granted');
        voiceRecognition.start();
        console.log('Voice capture started for session:', sessionId);
        showVoiceRecordingIndicator(true);
        showToast('Voice capture started - speaking will be transcribed', 'success');
      })
      .catch((error) => {
        console.error('Microphone permission denied:', error);
        isVoiceCapturing = false;
        currentSessionId = null;
        showToast('Microphone access required for voice capture', 'error');
      });
      
    return true;
  } catch (error) {
    console.error('Error starting voice capture:', error);
    isVoiceCapturing = false;
    currentSessionId = null;
    showToast('Failed to start voice capture: ' + error.message, 'error');
    return false;
  }
}

/**
 * Stop voice capture with proper cleanup
 */
function stopVoiceCapture() {
  console.log('Stopping voice capture');
  
  if (!isVoiceCapturing) {
    return;
  }
  
  // Process any remaining transcript in buffer
  if (voiceTranscriptBuffer.trim()) {
    console.log('Processing final transcript chunk before stopping');
    processTranscriptChunk();
  }
  
  // Stop recognition
  isVoiceCapturing = false;
  currentSessionId = null;
  consecutiveSilenceCount = 0;
  resetTranscriptBuffer();
  
  if (voiceRecognition) {
    try {
      voiceRecognition.stop();
    } catch (error) {
      console.error('Error stopping voice recognition:', error);
    }
  }
  
  // Update UI
  showVoiceRecordingIndicator(false);
  updateVoiceRecognitionUI('');
  
  console.log('Voice capture stopped');
  showToast('Voice capture stopped', 'info');
}

/**
 * Show/hide voice recording indicator in UI
 * @param {boolean} show - Whether to show the indicator
 */
function showVoiceRecordingIndicator(show) {
  // Remove existing indicator
  const existingIndicator = document.getElementById('lynkk-voice-indicator');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  if (!show) {
    return;
  }
  
  // Create voice recording indicator
  const indicator = document.createElement('div');
  indicator.id = 'lynkk-voice-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    animation: lynkk-pulse 2s infinite;
  `;
  
  indicator.innerHTML = `
    <div style="width: 8px; height: 8px; background: white; border-radius: 50%; animation: lynkk-blink 1s infinite;"></div>
    Recording Voice
  `;
  
  // Add CSS animations if not already present
  if (!document.querySelector('#lynkk-voice-animations')) {
    const style = document.createElement('style');
    style.id = 'lynkk-voice-animations';
    style.textContent = `
      @keyframes lynkk-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes lynkk-blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(indicator);
  
  // Add click handler to stop recording
  indicator.addEventListener('click', () => {
    if (confirm('Stop voice capture for this session?')) {
      stopVoiceCapture();
    }
  });
  
  indicator.style.cursor = 'pointer';
  indicator.title = 'Click to stop voice capture';
}

/**
 * Update voice recognition UI with current status
 * @param {string} status - Current recognition status
 */
function updateVoiceRecognitionUI(status) {
  const indicator = document.getElementById('lynkk-voice-indicator');
  if (indicator && status) {
    const statusEl = indicator.querySelector('.status-text');
    if (statusEl) {
      statusEl.textContent = status;
    } else {
      // Add status text if not present
      indicator.innerHTML += `<div class="status-text" style="font-size: 10px; opacity: 0.9;">${status}</div>`;
    }
  }
}

/**
 * Send transcript chunk to backend for processing and embedding generation
 * @param {string} transcript - The transcribed text chunk from speech
 */
async function sendTranscriptToBackend(transcript) {
  console.log('🎤 sendTranscriptToBackend called with transcript:', transcript.substring(0, 100) + '...');
  
  if (!transcript || transcript.length < 5) {
    console.log('❌ Skipping short transcript:', transcript);
    return; // Ignore very short utterances
  }
  
  console.log('✅ Sending transcript to backend (length:', transcript.length, ')');
  
  try {
    // Use user session token instead of regular auth token for voice API
    const authToken = await getUserSessionToken();
    if (!authToken) {
      console.error('❌ No user session token available for voice transcript');
      return;
    }
    
    console.log('✅ User session token retrieved:', authToken.substring(0, 10) + '...');
    
    // Validate token type for debugging
    try {
      const tokenPayload = JSON.parse(atob(authToken.split('.')[1]));
      const tokenRole = tokenPayload.role;
      const tokenIss = tokenPayload.iss;
      
      console.log('🔍 Token validation:');
      console.log('  - Role:', tokenRole);
      console.log('  - Issuer:', tokenIss);
      console.log('  - Subject (User ID):', tokenPayload.sub);
      
      if (tokenRole === 'anon') {
        console.error('❌ CRITICAL: Using ANONYMOUS token for voice API!');
        console.error('❌ This token will NOT save to database!');
        console.error('💡 Fix: Call getAndStoreSupabaseSessionToken() first');
        console.error('💡 Or use: setTestUserSessionToken("correct_user_token")');
      } else if (tokenRole === 'authenticated') {
        console.log('✅ EXCELLENT: Using USER SESSION token - will save to database!');
      } else {
        console.warn('⚠️ Unknown token role:', tokenRole);
      }
    } catch (e) {
      console.warn('⚠️ Could not decode token for validation');
    }
    
    if (!currentSessionId) {
      console.error('❌ No current session ID available');
      return;
    }
    
    console.log('✅ Current session ID:', currentSessionId);
    
    const payload = {
      transcript: transcript,
      timestamp: new Date().toISOString(),
      professorId: currentUser?.id,
      sessionId: currentSessionId,
      chunkIndex: Date.now(), // Simple chunk identifier
      processingType: 'voice_chunk' // Helps backend identify this as voice data
    };
    
    console.log('📤 Sending payload to backend:', {
      ...payload,
      transcript: payload.transcript.substring(0, 50) + '...'
    });
    
    const apiUrl = `http://localhost:3000/api/sessions/${currentSessionId}/voice-transcript`;
    console.log('🌐 API URL:', apiUrl);
    
    // Send transcript to backend for processing and embedding generation
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: apiUrl,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: payload
    }, (response) => {
      console.log('📥 Backend response received:', response);
      
      if (response && response.ok) {
        console.log('✅ Voice transcript processed successfully:', {
          chunkLength: transcript.length,
          processingTime: response.data?.processingTime,
          embeddingGenerated: response.data?.embeddingGenerated
        });
        
        // Optional: Show success indicator (but don't spam user)
        if (response.data?.embeddingGenerated) {
          console.log('🧠 Embedding generated for transcript chunk');
        }
      } else {
        console.error('❌ Error processing voice transcript. Status:', response?.status);
        console.error('❌ Error details:', response?.data);
        console.error('❌ Error message:', response?.error);
        console.error('❌ Full response object:', JSON.stringify(response, null, 2));
        
        // Show detailed error information
        if (response?.data) {
          console.error('🔍 Backend error details:', response.data);
          if (response.data.message) {
            console.error('🔍 Backend error message:', response.data.message);
          }
          if (response.data.errors) {
            console.error('🔍 Backend validation errors:', response.data.errors);
          }
        }
        
        // For important errors, show user feedback
        if (response?.error?.includes('authentication') || response?.error?.includes('session')) {
          showToast('Voice processing error: ' + response.error, 'error');
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error sending transcript to backend:', error);
  }
}

// ==================== CHAT UI FUNCTIONS ====================

/**
 * Toggles chat visibility with animation
 */
function toggleChat() {
  const chatContainer = document.getElementById("lynkk-chat-container");
  if (!chatContainer) return;
  
  chatVisible = !chatVisible;
  
  if (chatVisible) {
    // Show chat with animation
    chatContainer.style.display = "flex";
    chatContainer.style.opacity = "0";
    chatContainer.style.transform = "translateY(20px)";
    chatContainer.style.transition = "opacity 0.3s ease, transform 0.3s ease";
    
    // Trigger animation
    setTimeout(() => {
      chatContainer.style.opacity = "1";
      chatContainer.style.transform = "translateY(0)";
      
      // Focus the input field when opening chat
      const chatInput = document.getElementById('lynkk-chat-input');
      if (chatInput) {
        chatInput.focus();
      }
    }, 50);
  } else {
    // Hide chat with animation
    chatContainer.style.opacity = "0";
    chatContainer.style.transform = "translateY(20px)";
    
    // Remove from DOM after animation completes
    setTimeout(() => {
      chatContainer.style.display = "none";
    }, 300);
  }
  
  console.log('Chat visibility toggled:', chatVisible);
}

/**
 * Updates the UI based on current user information
 */
function updateChatUI() {
  console.log('Updating chat UI with user:', currentUser);
  
  if (!chatContainerCreated) return;
  
  // Get the UI elements by IDs
  const usernameElement = document.getElementById('lynkk-username');
  const userInitialElement = document.getElementById('lynkk-user-initial');
  
  // Check if the elements exist before updating them
  if (currentUser) {
    // Update username if element exists
    if (usernameElement) {
      usernameElement.textContent = currentUser.username || currentUser.full_name || 'User';
    }
    
    // Set user initial if element exists
    if (userInitialElement) {
      const initial = (currentUser.username || currentUser.full_name || 'U').charAt(0).toUpperCase();
      userInitialElement.textContent = initial;
    }
    
    // Render the appropriate dashboard
    renderRoleBasedDashboard();
  } else {
    // Update for guest user
    if (usernameElement) {
      usernameElement.textContent = 'Guest';
    }
    
    if (userInitialElement) {
      userInitialElement.textContent = 'G';
    }
  }
  
  // Update the header UI based on the user's role
  const headerElement = document.querySelector('.lynkk-user-dropdown');
  if (headerElement && currentUser) {
    // Create dropdown content if it doesn't exist
    let dropdownRoleElement = document.getElementById('lynkk-dropdown-role');
    if (!dropdownRoleElement) {
      dropdownRoleElement = document.createElement('div');
      dropdownRoleElement.id = 'lynkk-dropdown-role';
      headerElement.appendChild(dropdownRoleElement);
    }
    
    if (dropdownRoleElement) {
      dropdownRoleElement.textContent = capitalizeFirstLetter(currentUser.role || 'User');
    
      // Style based on role
      if (currentUser.role === 'professor') {
        dropdownRoleElement.style.backgroundColor = '#4a66dd';
      } else {
        dropdownRoleElement.style.backgroundColor = '#6c5ce7';
      }
    }
  }
}

/**
 * Creates the chat container UI
 */
function createChatContainer() {
  // First, check if the container already exists and remove it if needed
  const existingContainer = document.getElementById("lynkk-chat-container");
  if (existingContainer) {
    existingContainer.remove();
    chatContainerCreated = false;
  }
  
  if (chatContainerCreated) return;
  
  console.log("Creating chat container");
  
  // Check for active session and initialize Gemini
  chrome.storage.local.get(['activeSession'], (result) => {
    if (result.activeSession) {
      initGeminiContext(result.activeSession);
    }
  });

  // Create chat container
  const chatContainer = document.createElement("div");
  chatContainer.id = "lynkk-chat-container";
  chatContainer.style.position = "fixed";
  chatContainer.style.bottom = "80px";
  chatContainer.style.right = "20px";
  chatContainer.style.width = "350px";
  chatContainer.style.height = "450px";
  chatContainer.style.backgroundColor = "#fff";
  chatContainer.style.border = "1px solid #e5e7eb";
  chatContainer.style.boxShadow = "0px 4px 12px rgba(0, 0, 0, 0.1)";
  chatContainer.style.overflow = "hidden";
  chatContainer.style.zIndex = "9998";
  chatContainer.style.display = "none";
  chatContainer.style.flexDirection = "column";
  chatContainer.style.borderRadius = "12px";
  chatContainer.style.fontFamily = "Inter, system-ui, -apple-system, sans-serif";

  // Chat UI Header with size matching other components
  chatContainer.innerHTML = `
    <div style="background: linear-gradient(90deg, #4a66dd 0%, #5d7df5 100%); color: white; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
      <h3 id="lynkk-header-title" style="margin: 0; font-size: 18px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">AskLynk</h3>
      <div style="display: flex; align-items: center; gap: 10px;">
        <!-- Username dropdown trigger -->
        <div class="lynkk-user-dropdown" style="position: relative; cursor: pointer; display: flex; align-items: center; gap: 5px; padding: 4px 6px; border-radius: 4px; transition: background-color 0.2s;">
          <div style="display: flex; align-items: center; gap: 5px;">
            <div style="width: 22px; height: 22px; background-color: #3b55c0; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500;">
              <span id="lynkk-user-initial">?</span>
            </div>
            <span id="lynkk-username" style="font-weight: 500; font-size: 13px; color: white;">Loading...</span>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          
          <!-- Dropdown content (hidden by default) -->
          <div id="lynkk-dropdown-content" style="position: absolute; top: 100%; right: 0; width: 130px; background-color: white; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); margin-top: 5px; display: none; z-index: 9999;">
            <div style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">
              <span id="lynkk-dropdown-role" style="font-size: 12px; color: white; background-color: #6c5ce7; padding: 2px 6px; border-radius: 4px; display: inline-block;">...</span>
            </div>
            <div id="lynkk-logout-option" style="padding: 8px 10px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #4b5563; transition: background-color 0.2s; font-size: 13px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              <span>Logout</span>
            </div>
          </div>
        </div>
        
        <!-- Close button -->
        <button id="lynkk-chat-close" style="background: none; border: none; color: white; cursor: pointer; display: flex; padding: 2px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    </div>
    <div id="lynkk-dashboard-container" style="flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; background-color: #f5f7fa;"></div>
  `;

  // Add chat container to body
  document.body.appendChild(chatContainer);
  chatContainerCreated = true;
  
  // Add event listeners for buttons
  const closeBtn = document.getElementById('lynkk-chat-close');
  
  if (closeBtn) {
    // Remove any existing listeners first (if needed)
    const newButton = closeBtn.cloneNode(true);
    closeBtn.parentNode.replaceChild(newButton, closeBtn);
    
    // Now add the event listener to the new button
    newButton.addEventListener('click', () => {
      toggleChat();
    });
  }
  
  // Add event listener for the AskLynk title to redirect to dashboard
  const titleHeader = document.getElementById('lynkk-header-title');
  if (titleHeader) {
    titleHeader.addEventListener('click', () => {
      // Reset to the main dashboard view
      renderRoleBasedDashboard();
      
      // If we're in any sub-view like AI chat, this will take user back to dashboard
      const dashboardContainer = document.getElementById('lynkk-dashboard-container');
      if (dashboardContainer) {
        // Make sure we clear any active AI assistant views
        const assistantTab = document.getElementById('lynkk-assistant-tab');
        if (assistantTab) {
          // Simulate clicking the assistant tab to ensure we're on main view
          assistantTab.click();
        }
      }
    });
    
    // Add hover effect for the title
    titleHeader.addEventListener('mouseenter', () => {
      titleHeader.style.opacity = '0.8';
    });
    
    titleHeader.addEventListener('mouseleave', () => {
      titleHeader.style.opacity = '1';
    });
  }
  
  // Add dropdown functionality for username
  const userDropdown = document.querySelector('.lynkk-user-dropdown');
  const dropdownContent = document.getElementById('lynkk-dropdown-content');
  const logoutOption = document.getElementById('lynkk-logout-option');
  
  if (userDropdown && dropdownContent) {
    // Toggle dropdown on click
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownContent.style.display = dropdownContent.style.display === 'block' ? 'none' : 'block';
    });
    
    // Close dropdown when clicking elsewhere
    document.addEventListener('click', () => {
      if (dropdownContent.style.display === 'block') {
        dropdownContent.style.display = 'none';
      }
    });
    
    // Prevent dropdown from closing when clicking inside it
    dropdownContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Add hover effect
    userDropdown.addEventListener('mouseenter', () => {
      userDropdown.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });
    
    userDropdown.addEventListener('mouseleave', () => {
      userDropdown.style.backgroundColor = 'transparent';
    });
  }
  
  if (logoutOption) {
    // Add hover effect for logout option
    logoutOption.addEventListener('mouseenter', () => {
      logoutOption.style.backgroundColor = '#f5f5f5';
    });
    
    logoutOption.addEventListener('mouseleave', () => {
      logoutOption.style.backgroundColor = 'transparent';
    });
    
    // Logout functionality
    logoutOption.addEventListener('click', () => {
      console.log('Logout button clicked');
      
      // Confirm logout
      if (confirm('Are you sure you want to log out?')) {
        chrome.runtime.sendMessage({ type: 'LOGOUT' }, (response) => {
          console.log('Logout response:', response);
          if (response && response.success) {
            toggleChat(); // Hide chat
            currentUser = null;
            showAuthRequiredMessage();
          }
        });
      }
    });
  }
  
  // Set user info
  updateChatUI();
  
  // Add the appropriate dashboard based on user role
  renderRoleBasedDashboard();
  
  console.log('Chat container created successfully');
}

/**
 * Updates the draggable button appearance
 */
function updateDraggableButton() {
  const button = document.getElementById('lynkk-float-button');
  if (!button) return;
  
  // Update button content based on auth state
  button.innerHTML = currentUser ? 'AL' : 'AL';
  
  // Update color based on auth state
  button.style.backgroundColor = currentUser ? '#4a66dd' : '#6c757d';
  
  // Remove any existing indicators
  const existingIndicator = button.querySelector('div');
  if (existingIndicator) {
    button.removeChild(existingIndicator);
  }
  
  // Add indicator if logged in
  if (currentUser) {
    const indicator = document.createElement('div');
    indicator.style.position = 'absolute';
    indicator.style.top = '4px';
    indicator.style.right = '4px';
    indicator.style.width = '12px';
    indicator.style.height = '12px';
    indicator.style.backgroundColor = '#4CAF50';
    indicator.style.borderRadius = '50%';
    indicator.style.border = '2px solid white';
    indicator.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)';
    button.appendChild(indicator);
  }
}

/**
 * Function to position chat container relative to the button
 * @param {HTMLElement} button - The button element
 */
function positionChatContainer(button) {
  if (!chatContainerCreated || !button) return;
  
  const chatContainer = document.getElementById('lynkk-chat-container');
  if (!chatContainer) return;
  
  const buttonRect = button.getBoundingClientRect();
  const chatWidth = 350; // Width of the chat container
  const chatHeight = 450; // Height of the chat container
  
  // Get window dimensions
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Calculate position (prefer positioning above the button)
  let left = buttonRect.left + (buttonRect.width / 2) - (chatWidth / 2);
  let top = buttonRect.top - chatHeight - 20; // 20px gap
  
  // Check if chat would go off the screen to the left
  if (left < 10) {
    left = 10;
  }
  
  // Check if chat would go off the screen to the right
  if (left + chatWidth > windowWidth - 10) {
    left = windowWidth - chatWidth - 10;
  }
  
  // If chat would go off the screen at the top, position it below the button
  if (top < 10) {
    top = buttonRect.bottom + 20;
  }
  
  // If chat would go off the screen at the bottom, adjust top position
  if (top + chatHeight > windowHeight - 10) {
    // If there's not enough space below either, position it in the center of the screen
    if (buttonRect.top < windowHeight / 2) {
      top = Math.max(10, windowHeight / 2 - chatHeight / 2);
    } else {
      top = Math.max(10, windowHeight - chatHeight - 10);
    }
  }
  
  chatContainer.style.left = `${left}px`;
  chatContainer.style.top = `${top}px`;
  chatContainer.style.right = 'auto';
  chatContainer.style.bottom = 'auto';
}

/**
 * Function to show authentication required message
 */
function showAuthRequiredMessage() {
  console.log('Showing auth required message');
  
  // Remove any existing message
  const existingMessage = document.getElementById('lynkk-auth-message');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  const messageContainer = document.createElement('div');
  messageContainer.id = 'lynkk-auth-message';
  messageContainer.style.position = 'fixed';
  messageContainer.style.bottom = '80px';
  messageContainer.style.right = '20px';
  messageContainer.style.width = '280px';
  messageContainer.style.padding = '20px';
  messageContainer.style.backgroundColor = '#fff';
  messageContainer.style.border = '1px solid #e5e7eb';
  messageContainer.style.boxShadow = '0px 4px 12px rgba(0, 0, 0, 0.1)';
  messageContainer.style.borderRadius = '12px';
  messageContainer.style.zIndex = '9998';
  messageContainer.style.fontFamily = 'Inter, system-ui, -apple-system, sans-serif';
  
  messageContainer.innerHTML = `
    <div style="text-align: center; margin-bottom: 15px;">
      <div style="width: 60px; height: 60px; background-color: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      </div>
      <div style="font-weight: 600; font-size: 16px; color: #111827; margin-bottom: 5px;">Authentication Required</div>
      <p style="margin-bottom: 20px; font-size: 14px; color: #6b7280; line-height: 1.5;">Please sign in to use AskLynk Chat and access all features.</p>
    </div>
    <button id="lynkk-signin-btn" style="width: 100%; padding: 12px; background: linear-gradient(90deg, #4a66dd 0%, #5d7df5 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 14px; margin-bottom: 10px; transition: all 0.2s ease-in-out;">Sign In / Sign Up</button>
    <div style="text-align: center; margin-top: 15px;">
      <button id="lynkk-close-msg" style="background: none; border: none; cursor: pointer; color: #6b7280; font-size: 13px; transition: color 0.2s;">Close</button>
    </div>
  `;
  
  document.body.appendChild(messageContainer);
  
  // Add event listeners
  const signinBtn = document.getElementById('lynkk-signin-btn');
  const closeBtn = document.getElementById('lynkk-close-msg');
  
  if (signinBtn) {
    signinBtn.addEventListener('click', () => {
      console.log('Opening authentication page');
      chrome.runtime.sendMessage({ type: 'OPEN_AUTH_PAGE' }, (response) => {
        console.log('Response from background script:', response);
        if (chrome.runtime.lastError) {
          console.error('Error sending message:', chrome.runtime.lastError);
        }
      });
      messageContainer.remove();
    });
    
    // Add hover effect
    signinBtn.addEventListener('mouseenter', () => {
      signinBtn.style.opacity = '0.9';
    });
    
    signinBtn.addEventListener('mouseleave', () => {
      signinBtn.style.opacity = '1';
    });
  }
  
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      messageContainer.remove();
    });
    
    // Add hover effect
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = '#374151';
    });
    
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = '#6b7280';
    });
  }
  
  // Add entrance animation
  messageContainer.style.opacity = '0';
  messageContainer.style.transform = 'translateY(20px)';
  messageContainer.style.transition = 'all 0.3s ease-out';
  
  // Trigger animation
  setTimeout(() => {
    messageContainer.style.opacity = '1';
    messageContainer.style.transform = 'translateY(0)';
  }, 50);
}

// ==================== DRAGGABLE BUTTON ====================

/**
 * Creates a draggable floating button for the chat
 * @returns {HTMLElement} The created button
 */
function createDraggableChatButton() {
  console.log('Creating draggable chat button');
  
  // Check if button already exists
  if (document.getElementById('lynkk-float-button')) {
    return;
  }
  
  // Create button element
  const button = document.createElement('div');
  button.id = 'lynkk-float-button';
  
  // Set button content
  button.innerHTML = currentUser ? 'AL' : 'AL';
  
  // Style the button with improved visibility
  button.style.position = 'fixed';
  button.style.bottom = '20px';
  button.style.right = '20px';
  button.style.width = '56px';
  button.style.height = '56px';
  button.style.backgroundColor = currentUser ? '#4a66dd' : '#6c757d';
  button.style.color = 'white';
  button.style.borderRadius = '50%';
  button.style.display = 'flex';
  button.style.justifyContent = 'center';
  button.style.alignItems = 'center';
  button.style.cursor = 'grab';
  button.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
  button.style.fontSize = '24px';
  button.style.fontWeight = 'bold';
  button.style.zIndex = '9999'; // Ensure high z-index
  button.style.transition = 'all 0.2s ease';
  button.style.fontFamily = 'Inter, system-ui, -apple-system, sans-serif';
  button.style.userSelect = 'none'; // Prevent text selection during drag
  button.style.minHeight = '56px'; // Ensure minimum height
  
  // Add CSS to ensure button remains visible on all devices
  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 768px) {
      #lynkk-float-button {
        bottom: 10px !important;
        right: 10px !important;
        width: 50px !important;
        height: 50px !important;
        font-size: 20px !important;
      }
    }
    
    @media (max-width: 480px) {
      #lynkk-float-button {
        bottom: 5px !important;
        right: 5px !important;
        width: 48px !important;
        height: 48px !important;
      }
    }
    
    /* Ensure button remains visible when scrolling */
    #lynkk-float-button {
      visibility: visible !important;
      opacity: 1 !important;
      transform: none !important;
    }
  `;
  document.head.appendChild(style);
  
  // Add a small indicator dot if logged in
  if (currentUser) {
    const indicator = document.createElement('div');
    indicator.style.position = 'absolute';
    indicator.style.top = '4px';
    indicator.style.right = '4px';
    indicator.style.width = '12px';
    indicator.style.height = '12px';
    indicator.style.backgroundColor = '#4CAF50';
    indicator.style.borderRadius = '50%';
    indicator.style.border = '2px solid white';
    indicator.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)';
    button.appendChild(indicator);
  }
  
  // Make the button draggable
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  
  // Add hover effects
  button.addEventListener('mouseenter', () => {
    if (!isDragging) {
      button.style.transform = 'scale(1.05)';
      button.style.boxShadow = '0 6px 12px rgba(0,0,0,0.25)';
    }
  });
  
  button.addEventListener('mouseleave', () => {
    if (!isDragging) {
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
    }
  });
  
  // Add click handler
  button.addEventListener('click', (e) => {
    if (isDragging) {
      // Prevent opening chat while dragging
      e.stopPropagation();
      return;
    }
    
    console.log('Button clicked, checking auth...');
    
    // Re-check auth state to ensure it's current
    chrome.runtime.sendMessage({ type: 'CHECK_AUTH' }, (response) => {
      console.log('Auth check response:', response);
      
      if (response && response.isLoggedIn) {
        // User is authenticated, show chat
        currentUser = response.user;
        if (!chatContainerCreated) {
          createChatContainer();
        }
        if (!chatVisible) {
          toggleChat();
          positionChatContainer(button);
        }
      } else {
        // User is not authenticated, prompt to authenticate
        showAuthRequiredMessage();
      }
    });
  });
  
  // Mouse events for dragging
  button.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragOffsetX = e.clientX - button.getBoundingClientRect().left;
    dragOffsetY = e.clientY - button.getBoundingClientRect().top;
    button.style.cursor = 'grabbing';
    button.style.transition = 'none'; // Disable transitions during drag
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const x = e.clientX - dragOffsetX;
      const y = e.clientY - dragOffsetY;
      
      // Calculate button boundaries to keep it within the screen
      const buttonWidth = button.offsetWidth;
      const buttonHeight = button.offsetHeight;
      const maxX = window.innerWidth - buttonWidth;
      const maxY = window.innerHeight - buttonHeight;
      
      // Ensure at least 10px of the button is always visible on screen
      button.style.left = `${Math.min(Math.max(10, x), maxX - 10)}px`;
      button.style.top = `${Math.min(Math.max(10, y), maxY - 10)}px`;
      button.style.right = 'auto';
      button.style.bottom = 'auto';
      
      // Store position
      localStorage.setItem('lynkkButtonPosition', JSON.stringify({
        left: button.style.left,
        top: button.style.top
      }));
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      button.style.cursor = 'grab';
      button.style.transition = 'all 0.2s ease'; // Re-enable transitions
      
      // Check if button is partially offscreen and adjust if needed
      const rect = button.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      if (rect.right > windowWidth) {
        button.style.left = `${windowWidth - button.offsetWidth - 10}px`;
      }
      
      if (rect.bottom > windowHeight) {
        button.style.top = `${windowHeight - button.offsetHeight - 10}px`;
      }
    }
  });
  
  // Touch events for mobile - with improved handling
  button.addEventListener('touchstart', (e) => {
    isDragging = true;
    const touch = e.touches[0];
    dragOffsetX = touch.clientX - button.getBoundingClientRect().left;
    dragOffsetY = touch.clientY - button.getBoundingClientRect().top;
    button.style.transition = 'none';
  }, { passive: true });
  
  document.addEventListener('touchmove', (e) => {
    if (isDragging) {
      const touch = e.touches[0];
      const x = touch.clientX - dragOffsetX;
      const y = touch.clientY - dragOffsetY;
      
      // Calculate button boundaries with safety margins for mobile
      const buttonWidth = button.offsetWidth;
      const buttonHeight = button.offsetHeight;
      const maxX = window.innerWidth - buttonWidth;
      const maxY = window.innerHeight - buttonHeight;
      
      // Ensure at least 10px of the button is always visible on screen
      button.style.left = `${Math.min(Math.max(10, x), maxX - 10)}px`;
      button.style.top = `${Math.min(Math.max(10, y), maxY - 10)}px`;
      button.style.right = 'auto';
      button.style.bottom = 'auto';
      
      // Store position
      localStorage.setItem('lynkkButtonPosition', JSON.stringify({
        left: button.style.left,
        top: button.style.top
      }));
    }
  }, { passive: true });
  
  document.addEventListener('touchend', () => {
    if (isDragging) {
      isDragging = false;
      button.style.transition = 'all 0.2s ease';
    }
  });
  
  // Add button to the page
  document.body.appendChild(button);
  console.log('Draggable chat button created');
  
  // Restore saved position if available, but validate it's on screen
  const savedPosition = localStorage.getItem('lynkkButtonPosition');
  if (savedPosition) {
    try {
      const { left, top } = JSON.parse(savedPosition);
      const parsedLeft = parseInt(left);
      const parsedTop = parseInt(top);
      
      // Validate the saved position is within screen bounds
      if (
        !isNaN(parsedLeft) && 
        !isNaN(parsedTop) && 
        parsedLeft >= 0 && 
        parsedLeft <= window.innerWidth - 56 &&
        parsedTop >= 0 && 
        parsedTop <= window.innerHeight - 56
      ) {
        button.style.left = left;
        button.style.top = top;
        button.style.right = 'auto';
        button.style.bottom = 'auto';
      } else {
        // Reset to default position if saved position is offscreen
        button.style.left = 'auto';
        button.style.top = 'auto';
        button.style.right = '20px';
        button.style.bottom = '20px';
      }
    } catch (e) {
      console.error('Error restoring button position:', e);
    }
  }
  
  // Add entrance animation
  button.style.opacity = '0';
  button.style.transform = 'scale(0.8) translateY(20px)';
  
  // Trigger animation
  setTimeout(() => {
    button.style.opacity = '1';
    button.style.transform = 'scale(1) translateY(0)';
  }, 100);
  
  // Add a refresh handler to check button visibility on screen rotation
  window.addEventListener('orientationchange', function() {
    setTimeout(() => {
      const rect = button.getBoundingClientRect();
      if (
        rect.left < 0 || 
        rect.top < 0 || 
        rect.right > window.innerWidth || 
        rect.bottom > window.innerHeight
      ) {
        // Reset position if offscreen after rotation
        button.style.left = 'auto';
        button.style.top = 'auto';
        button.style.right = '20px';
        button.style.bottom = '20px';
      }
    }, 300);
  });
  
  return button;
}

// ==================== DASHBOARD UI SECTIONS ====================

/**
 * Renders the dashboard based on user role
 */
function renderRoleBasedDashboard() {
  if (!currentUser) return;
  
  const dashboardContainer = document.getElementById('lynkk-dashboard-container');
  if (!dashboardContainer) return;
  
  // Clear the container
  dashboardContainer.innerHTML = '';
  
  if (currentUser.role === 'professor') {
    renderProfessorDashboard(dashboardContainer);
  } else {
    renderStudentDashboard(dashboardContainer);
  }
}

/**
 * Renders the professor dashboard UI
 * @param {HTMLElement} container - The container element
 */
function renderProfessorDashboard(container) {
  container.innerHTML = `
    <div style="padding: 20px; font-family: 'Segoe UI', Roboto, -apple-system, BlinkMacSystemFont, sans-serif;">
      <div style="display: flex; margin-bottom: 24px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <button id="lynkk-assistant-tab" style="flex: 1; background-color: #4a66dd; color: white; border: none; padding: 12px 0; cursor: pointer; font-weight: 500; transition: all 0.2s ease; font-size: 14px; letter-spacing: 0.2px;">
          AI Teaching Assistant
        </button>
        <button id="lynkk-history-tab" style="flex: 1; background-color: #f5f7fa; border: none; padding: 12px 0; cursor: pointer; font-weight: 500; transition: all 0.2s ease; font-size: 14px; letter-spacing: 0.2px; color: #4a5568;">
          Session History
        </button>
      </div>
      
      <div id="lynkk-assistant-section" style="background-color: #ffffff; border-radius: 10px; padding: 28px; box-shadow: 0 3px 10px rgba(0,0,0,0.06);">
        <p style="margin-top: 0; margin-bottom: 28px; color: #4a5568; font-size: 15px; line-height: 1.5;">Create a new teaching session for your students to join.</p>
        
        <button 
          id="lynkk-create-session-btn" 
          style="background-color: #4a66dd; color: white; border: none; padding: 14px 0; border-radius: 8px; cursor: pointer; width: 100%; margin-bottom: 20px; font-weight: 500; transition: all 0.2s ease; box-shadow: 0 3px 6px rgba(74, 102, 221, 0.2); font-size: 15px;"
        >
          + Create New Session
        </button>
        
        <button 
          id="lynkk-open-ai-chat" 
          style="background-color: #28a745; display: block; width: 100%; padding: 14px 0; text-align: center; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; transition: all 0.2s ease; box-shadow: 0 3px 6px rgba(40, 167, 69, 0.2); font-size: 15px;"
        >
          AskLynk AI Assistant
        </button>
      </div>
      
      <div id="lynkk-history-section" style="display: none; background-color: #ffffff; border-radius: 10px; padding: 0; box-shadow: 0 3px 10px rgba(0,0,0,0.06); max-height: 550px; overflow: hidden; display: flex; flex-direction: column;">
        <div id="lynkk-session-list" style="color: #4a5568; font-size: 15px; padding: 20px; overflow-y: auto; flex-grow: 1;">
          <div style="text-align: center; padding: 24px 0;">
            <div class="lynkk-loading-spinner" style="display: inline-block; width: 30px; height: 30px; border: 3px solid rgba(74, 102, 221, 0.2); border-radius: 50%; border-top-color: #4a66dd; animation: lynkk-spin 1s ease-in-out infinite;"></div>
            <style>
              @keyframes lynkk-spin {
                to { transform: rotate(360deg); }
              }
            </style>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners
  const assistantTab = document.getElementById('lynkk-assistant-tab');
  const historyTab = document.getElementById('lynkk-history-tab');
  const assistantSection = document.getElementById('lynkk-assistant-section');
  const historySection = document.getElementById('lynkk-history-section');
  const createSessionBtn = document.getElementById('lynkk-create-session-btn');
  const openAIChatBtn = document.getElementById('lynkk-open-ai-chat');
  
  // Tab switching
  assistantTab.addEventListener('click', () => {
    assistantTab.style.backgroundColor = '#4a66dd';
    assistantTab.style.color = 'white';
    historyTab.style.backgroundColor = '#f5f7fa';
    historyTab.style.color = '#4a5568';
    assistantSection.style.display = 'block';
    historySection.style.display = 'none';
  });
  
  historyTab.addEventListener('click', () => {
    historyTab.style.backgroundColor = '#4a66dd';
    historyTab.style.color = 'white';
    assistantTab.style.backgroundColor = '#f5f7fa';
    assistantTab.style.color = '#4a5568';
    historySection.style.display = 'flex';
    assistantSection.style.display = 'none';
    
    // Load session history
    loadProfessorSessionHistory();
  });

  // Create session button - show modal
  createSessionBtn.addEventListener('click', () => {
    showCreateSessionModal();
  });
  
  // Open AI Chat button
  openAIChatBtn.addEventListener('click', () => {
    showStandaloneAIAssistant();
  });
  
  // Add hover effects
  createSessionBtn.addEventListener('mouseover', () => {
    createSessionBtn.style.backgroundColor = '#3b57c4';
    createSessionBtn.style.transform = 'translateY(-1px)';
    createSessionBtn.style.boxShadow = '0 4px 8px rgba(74, 102, 221, 0.3)';
  });
  createSessionBtn.addEventListener('mouseout', () => {
    createSessionBtn.style.backgroundColor = '#4a66dd';
    createSessionBtn.style.transform = 'translateY(0)';
    createSessionBtn.style.boxShadow = '0 3px 6px rgba(74, 102, 221, 0.2)';
  });
  
  openAIChatBtn.addEventListener('mouseover', () => {
    openAIChatBtn.style.backgroundColor = '#218838';
    openAIChatBtn.style.transform = 'translateY(-1px)';
    openAIChatBtn.style.boxShadow = '0 4px 8px rgba(40, 167, 69, 0.3)';
  });
  openAIChatBtn.addEventListener('mouseout', () => {
    openAIChatBtn.style.backgroundColor = '#28a745';
    openAIChatBtn.style.transform = 'translateY(0)';
    openAIChatBtn.style.boxShadow = '0 3px 6px rgba(40, 167, 69, 0.2)';
  });
}

/**
 * Renders the student dashboard UI
 * @param {HTMLElement} container - The container element
 */
function renderStudentDashboard(container) {
  container.innerHTML = `
    <div class="student-dashboard" style="display: flex; flex-direction: column; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; background-color: #f8fafc;">      
      <!-- Content Area (scrollable) -->
      <div style="flex: 1; overflow-y: auto; padding: 16px;">
        <!-- Join Session Card -->
        <div style="background-color: white; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); padding: 16px; margin-bottom: 16px;">
          <h2 style="font-size: 18px; font-weight: 600; color: #334155; margin-top: 0; margin-bottom: 8px;">Join a Session</h2>
          <p style="font-size: 14px; color: #64748b; margin-top: 0; margin-bottom: 16px;">Enter the session code provided by your professor to join a class.</p>
          
          <div style="display: flex; margin-bottom: 6px;">
            <input 
              id="lynkk-session-code" 
              type="text" 
              placeholder="Enter session code" 
              style="flex: 1; padding: 8px 10px; border: 1px solid #e2e8f0; border-radius: 6px 0 0 6px; font-size: 14px; outline: none; transition: border-color 0.2s ease;"
            />
            <button 
              id="lynkk-join-session" 
              style="display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 70px; padding: 8px 12px; background-color: #5373E7; color: white; border: none; border-radius: 0 6px 6px 0; font-weight: 500; font-size: 13px; cursor: pointer; transition: background-color 0.2s ease;"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Join
            </button>
          </div>
          <div id="lynkk-join-error" style="font-size: 13px; color: #ef4444; margin-top: 6px; display: none;"></div>
        </div>
        
        <!-- AI Assistant Card -->
        <div style="background-color: white; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); padding: 16px; margin-bottom: 16px; text-align: center;">
          <div style="width: 60px; height: 60px; background-color: #4BB4E6; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2Z"/>
              <path d="M12 8v4"/>
              <path d="M12 16h.01"/>
            </svg>
          </div>
          <h3 style="font-size: 18px; font-weight: 600; color: #334155; margin-top: 0; margin-bottom: 8px;">AskLynk AI Assistant</h3>
          <p style="font-size: 14px; color: #64748b; margin: 0 0 16px;">Get help with homework, explanations, and study materials.</p>
          <button 
            id="lynkk-open-ai-assistant" 
            style="width: 100%; padding: 8px 12px; background-color: #4BB4E6; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background-color 0.2s ease; display: flex; align-items: center; justify-content: center; gap: 6px;"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Open AskLynk AI Assistant
          </button>
        </div>
        
        <!-- Recent Sessions Section -->
        <div id="lynkk-recent-sessions" style="margin-bottom: 16px;">
          <h2 style="font-size: 16px; font-weight: 600; color: #334155; margin-top: 0; margin-bottom: 12px;">
            Recent Sessions
          </h2>
          
          <div id="lynkk-student-session-list" style="max-height: 240px; overflow-y: auto;">
            <!-- Loading spinner shown until sessions load -->
            <div class="loading-sessions" style="display: flex; justify-content: center; padding: 24px;">
              <div class="spinner" style="border: 2px solid rgba(83, 115, 231, 0.1); border-radius: 50%; border-top: 2px solid #5373E7; width: 20px; height: 20px; animation: spin 1s linear infinite;"></div>
            </div>
            <style>
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            </style>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add event listeners
  const joinSessionBtn = document.getElementById('lynkk-join-session');
  const openAIAssistantBtn = document.getElementById('lynkk-open-ai-assistant');
  const sessionCodeInput = document.getElementById('lynkk-session-code');
  
  // Focus on the session code input
  setTimeout(() => {
    if (sessionCodeInput) sessionCodeInput.focus();
  }, 100);
  
  // Load recent sessions
  loadStudentSessionHistory();
  
  // Join session button functionality
  if (joinSessionBtn) {
    joinSessionBtn.addEventListener('click', () => {
      joinSession();
    });
    
    // Complete hover effects
    joinSessionBtn.addEventListener('mouseenter', () => {
      joinSessionBtn.style.backgroundColor = '#4361c2';
    });
    
    joinSessionBtn.addEventListener('mouseleave', () => {
      joinSessionBtn.style.backgroundColor = '#5373E7';
    });
  }
  
  // Session code input functionality
  if (sessionCodeInput) {
    // Join on Enter key press
    sessionCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        joinSession();
      }
    });
    
    // Focus/blur effects
    sessionCodeInput.addEventListener('focus', () => {
      sessionCodeInput.style.borderColor = '#5373E7';
    });
    
    sessionCodeInput.addEventListener('blur', () => {
      sessionCodeInput.style.borderColor = '#e2e8f0';
    });
  }
  
  // Open AI Assistant button - Using the available function
  if (openAIAssistantBtn) {
    openAIAssistantBtn.addEventListener('click', () => {
      showStandaloneAIAssistant();
    });
    
    // Add hover effect
    openAIAssistantBtn.addEventListener('mouseenter', () => {
      openAIAssistantBtn.style.backgroundColor = '#3aa3d5';
    });
    
    openAIAssistantBtn.addEventListener('mouseleave', () => {
      openAIAssistantBtn.style.backgroundColor = '#4BB4E6';
    });
  }
}

// ==================== SESSION MANAGEMENT FUNCTIONS ====================

function loadProfessorSessionHistory() {
  const sessionListContainer = document.getElementById('lynkk-session-list');
  if (!sessionListContainer) return;
  
  // Show loading indicator
  sessionListContainer.innerHTML = `
    <div style="text-align: center; padding: 24px 0;">
      <div class="lynkk-loading-spinner" style="display: inline-block; width: 30px; height: 30px; border: 3px solid rgba(74, 102, 221, 0.2); border-radius: 50%; border-top-color: #4a66dd; animation: lynkk-spin 1s ease-in-out infinite;"></div>
    </div>
  `;
  
  // Get auth token
  getAuthToken().then(authToken => {
    if (!authToken) {
      // Handle missing token error
      sessionListContainer.innerHTML = `
        <div style="text-align: center; padding: 30px 20px; background-color: #f9fafb; border-radius: 8px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
          <div style="color: #ef4444; margin-bottom: 16px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <p style="color: #4b5563; margin-bottom: 5px; font-size: 15px;">Please log in to view your sessions.</p>
          <button 
            id="lynkk-login-btn" 
            style="padding: 8px 16px; background-color: #4a66dd; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;"
          >
            Log In
          </button>
        </div>
      `;
      
      // Add login button listener
      const loginBtn = document.getElementById('lynkk-login-btn');
      if (loginBtn) {
        loginBtn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ type: 'OPEN_AUTH_PAGE' });
        });
      }
      return;
    }
    
    // Get user information from storage
    chrome.storage.local.get(['authState'], result => {
      if (!result.authState?.user?.id) {
        // Handle missing user ID error
        sessionListContainer.innerHTML = `
          <div style="text-align: center; padding: 30px 20px; background-color: #f9fafb; border-radius: 8px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
            <div style="color: #ef4444; margin-bottom: 16px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <p style="color: #4b5563; margin-bottom: 16px; font-size: 15px;">User information not found. Please log in again.</p>
            <button 
              id="lynkk-retry-login" 
              style="padding: 10px 20px; background-color: #4a66dd; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease;"
            >
              Log In
            </button>
          </div>
        `;
        
        const retryLoginBtn = document.getElementById('lynkk-retry-login');
        if (retryLoginBtn) {
          retryLoginBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'OPEN_AUTH_PAGE' });
          });
        }
        return;
      }
      
      const professorId = result.authState.user.id;
      const apiBaseUrl = 'http://localhost:3000';
      const sessionsUrl = `${apiBaseUrl}/api/sessions/professor/${professorId}`;
      
      console.log('Fetching sessions from URL:', sessionsUrl);
      
      // Make API request for sessions
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: sessionsUrl,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      }, (response) => {
        console.log('Session API response:', response);
        
        if (!response || !response.ok) {
          // Handle API error
          sessionListContainer.innerHTML = `
            <div style="text-align: center; padding: 30px 20px; background-color: #f9fafb; border-radius: 8px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
              <div style="color: #ef4444; margin-bottom: 16px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              </div>
              <p style="color: #4b5563; margin-bottom: 16px; font-size: 15px;">Error loading sessions: ${response?.error || 'Unknown error'}</p>
              <button 
                id="lynkk-retry-sessions" 
                style="padding: 10px 20px; background-color: #4a66dd; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease;"
              >
                Retry
              </button>
            </div>
          `;
          
          // Add retry button listener
          const retryBtn = document.getElementById('lynkk-retry-sessions');
          if (retryBtn) {
            retryBtn.addEventListener('click', () => {
              loadProfessorSessionHistory();
            });
          }
          return;
        }
        
        // Extract sessions from response with improved handling
        let sessions = extractArrayFromResponse(response);
        
        if (sessions.length === 0) {
          // Handle no sessions case
          sessionListContainer.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; background-color: #f9fafb; border-radius: 10px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);">
              <div style="color: #6b7280; margin-bottom: 16px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
              </div>
              <p style="color: #4b5563; margin-bottom: 20px; font-size: 16px; font-weight: 500;">No sessions created yet.</p>
              <button 
                id="lynkk-create-first-session" 
                style="padding: 12px 24px; background-color: #4a66dd; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; font-weight: 500; box-shadow: 0 2px 4px rgba(74, 102, 221, 0.2); transition: all 0.2s ease;"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Create Your First Session
              </button>
            </div>
          `;
          
          // Add hover and click effects for the Create First Session button
          const createFirstBtn = document.getElementById('lynkk-create-first-session');
          if (createFirstBtn) {
            // Hover effects
            createFirstBtn.addEventListener('mouseenter', () => {
              createFirstBtn.style.backgroundColor = '#3b57c4';
              createFirstBtn.style.transform = 'translateY(-1px)';
              createFirstBtn.style.boxShadow = '0 4px 8px rgba(74, 102, 221, 0.3)';
            });
            
            createFirstBtn.addEventListener('mouseleave', () => {
              createFirstBtn.style.backgroundColor = '#4a66dd';
              createFirstBtn.style.transform = 'translateY(0)';
              createFirstBtn.style.boxShadow = '0 2px 4px rgba(74, 102, 221, 0.2)';
            });
            
            // Click event
            createFirstBtn.addEventListener('click', () => {
              // Switch to the assistant tab first
              const assistantTab = document.getElementById('lynkk-assistant-tab');
              if (assistantTab) {
                assistantTab.click();
              }
              
              // Then show create modal
              setTimeout(() => {
                showCreateSessionModal();
              }, 10000);
            });
          }
          
          return;
        }
        
        // Group sessions by date for better organization
        const dateGroups = {};
        sessions.forEach(session => {
          const date = new Date(session.created_at);
          const dateKey = date.toDateString();
          
          if (!dateGroups[dateKey]) {
            dateGroups[dateKey] = [];
          }
          dateGroups[dateKey].push(session);
        });
        
        // Sort date keys in reverse chronological order
        const sortedDateKeys = Object.keys(dateGroups).sort((a, b) => {
          return new Date(b) - new Date(a);
        });
        
        // Generate HTML for sessions grouped by date
        let html = '<div style="padding: 10px 0;">';
        
        sortedDateKeys.forEach(dateKey => {
          const dateSessions = dateGroups[dateKey];
          const date = new Date(dateKey);
          const isToday = new Date().toDateString() === dateKey;
          const isYesterday = new Date(Date.now() - 86400000).toDateString() === dateKey;
          
          let dateLabel = isToday 
            ? 'Today' 
            : isYesterday 
              ? 'Yesterday' 
              : date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          
          html += `
            <div style="margin-bottom: 20px;">
              <div style="display: flex; align-items: center; margin-bottom: 12px; padding: 0 8px;">
                <div style="width: 6px; height: 6px; background-color: #4a66dd; border-radius: 50%; margin-right: 8px;"></div>
                <h3 style="font-size: 16px; font-weight: 600; color: #1f2937; margin: 0;">${dateLabel}</h3>
                <div style="flex-grow: 1; height: 1px; background-color: #e5e7eb; margin-left: 12px;"></div>
              </div>
              
              <div class="lynkk-session-group">
          `;
          
          dateSessions.forEach(session => {
            const isActive = session.status === 'active';
            const sessionCode = session.join_code || session.code || 'N/A';
            
            html += `
              <div class="lynkk-session-card" data-session-id="${session.id}" data-expanded="false"
                style="background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); margin-bottom: 10px; overflow: hidden; border: 1px solid #e6e8f0; transition: all 0.25s ease;">
                
                <!-- Collapsed view (always visible) -->
                <div class="lynkk-session-header" style="padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 36px; height: 36px; border-radius: 8px; background-color: ${isActive ? '#ecfdf5' : '#f3f4f6'}; display: flex; align-items: center; justify-content: center;">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${isActive ? '#10b981' : '#9ca3af'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                        <polyline points="13 2 13 9 20 9"></polyline>
                      </svg>
                    </div>
                    
                    <div>
                      <h3 style="font-size: 16px; font-weight: 600; margin: 0; color: #111827; line-height: 1.4;">${session.title || 'Untitled Session'}</h3>
                      <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <span style="font-family: monospace; font-size: 13px; color: #4b5563; background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-weight: 500;">
                          ${sessionCode}
                        </span>
                        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: ${isActive ? '#059669' : '#6b7280'};">
                          <span style="width: 8px; height: 8px; background-color: ${isActive ? '#10b981' : '#9ca3af'}; border-radius: 50%; display: inline-block;"></span>
                          ${isActive ? 'Active' : 'Ended'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div class="lynkk-expand-btn" style="width: 24px; height: 24px; border-radius: 50%; background: #f3f4f6; display: flex; align-items: center; justify-content: center; transition: all 0.3s ease;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s ease;">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </div>
                
                <!-- Expanded content (hidden by default) -->
                <div class="lynkk-session-details" style="display: none; padding: 0 16px 16px 16px; border-top: 1px solid #f3f4f6;">
                  <!-- Session description if available -->
                  ${session.description ? `
                  <div style="margin: 16px 0;">
                    <h4 style="font-size: 14px; color: #4b5563; margin: 0 0 6px 0; font-weight: 500;">Description</h4>
                    <p style="font-size: 14px; line-height: 1.5; color: #1f2937; margin: 0;">${session.description}</p>
                  </div>
                  ` : ''}
                  
                  <!-- Session stats -->
                  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 16px 0;">
                    <div style="display: flex; align-items: center; background-color: #f9fafb; padding: 12px; border-radius: 8px;">
                      <div style="width: 36px; height: 36px; background-color: #eef2ff; color: #4f46e5; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                      </div>
                      <div>
                        <div style="font-weight: 600; color: #111827; font-size: 18px;">${session.student_count || 0}</div>
                        <div style="font-size: 12px; color: #4b5563;">Students</div>
                      </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; background-color: #f9fafb; padding: 12px; border-radius: 8px;">
                      <div style="width: 36px; height: 36px; background-color: #f0fdf4; color: #16a34a; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </div>
                      <div>
                        <div style="font-weight: 600; color: #111827; font-size: 18px;">${session.message_count || 0}</div>
                        <div style="font-size: 12px; color: #4b5563;">Messages</div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Session actions -->
                  <div style="display: flex; gap: 10px; margin-top: 16px;">
                    ${isActive ? `
                    <button 
                      data-session-id="${session.id}" 
                      class="lynkk-end-session-btn" 
                      style="flex: 1; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; padding: 10px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; text-align: center; border-radius: 8px;"
                    >
                      End Session
                    </button>
                    
                    <button 
                      data-session-id="${session.id}" 
                      class="lynkk-open-session-btn" 
                      style="flex: 1; background: #4a66dd; color: white; border: none; padding: 10px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; text-align: center; border-radius: 8px;"
                    >
                      Open Session
                    </button>
                    ` : `
                    <button 
                      data-session-id="${session.id}" 
                      class="lynkk-open-session-btn" 
                      style="flex: 1; background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb; padding: 10px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s ease; text-align: center; border-radius: 8px;"
                    >
                      View Session
                    </button>
                    `}
                  </div>
                </div>
              </div>
            `;
          });
          
          html += `
              </div>
            </div>
          `;
        });
        
        html += '</div>';
        
        // Add the session cards to the DOM
        sessionListContainer.innerHTML = html;
        
        // Add event listeners for expandable sessions
        document.querySelectorAll('.lynkk-session-header').forEach(header => {
          header.addEventListener('click', (e) => {
            // Ignore clicks on buttons
            if (e.target.closest('.lynkk-open-session-btn') || e.target.closest('.lynkk-end-session-btn')) {
              return;
            }
            
            const card = header.closest('.lynkk-session-card');
            const details = card.querySelector('.lynkk-session-details');
            const expandBtn = card.querySelector('.lynkk-expand-btn svg');
            
            // Toggle expanded state
            const isExpanded = card.getAttribute('data-expanded') === 'true';
            card.setAttribute('data-expanded', !isExpanded);
            
            if (isExpanded) {
              // Collapse
              details.style.display = 'none';
              expandBtn.style.transform = 'rotate(0deg)';
            } else {
              // Expand
              details.style.display = 'block';
              expandBtn.style.transform = 'rotate(180deg)';
            }
          });
        });
        
        // Add event listeners for open session buttons
        document.querySelectorAll('.lynkk-open-session-btn').forEach(button => {
          button.addEventListener('click', (e) => {
            e.stopPropagation();
            const sessionId = button.getAttribute('data-session-id');
            openSession(sessionId);
          });
          
          // Add hover effects
          button.addEventListener('mouseenter', () => {
            if (button.style.backgroundColor === '#4a66dd') {
              button.style.backgroundColor = '#3b57c4';
              button.style.transform = 'translateY(-1px)';
            } else {
              button.style.backgroundColor = '#e5e7eb';
            }
          });
          
          button.addEventListener('mouseleave', () => {
            if (button.style.color === 'white') {
              button.style.backgroundColor = '#4a66dd';
              button.style.transform = 'translateY(0)';
            } else {
              button.style.backgroundColor = '#f3f4f6';
            }
          });
        });
        
        // Add event listeners for end session buttons
        document.querySelectorAll('.lynkk-end-session-btn').forEach(button => {
          button.addEventListener('click', (e) => {
            e.stopPropagation();
            const sessionId = button.getAttribute('data-session-id');
            
            if (confirm('Are you sure you want to end this session? Students will no longer be able to join or send messages.')) {
              endSession(sessionId);
            }
          });
          
          // Add hover effects
          button.addEventListener('mouseenter', () => {
            button.style.backgroundColor = '#fecaca';
            button.style.transform = 'translateY(-1px)';
          });
          
          button.addEventListener('mouseleave', () => {
            button.style.backgroundColor = '#fee2e2';
            button.style.transform = 'translateY(0)';
          });
        });
      });
    });
  });
}
/**
* Function to load student's session history
*/
async function loadStudentSessionHistory() {
    const sessionListContainer = document.getElementById('lynkk-student-session-list');
    if (!sessionListContainer) return;
  
    // Get the student's auth token from storage
    chrome.storage.local.get(['authState'], (result) => {
      if (!result.authState || !result.authState.isLoggedIn || !result.authState.user) {
        sessionListContainer.innerHTML = `
          <div style="text-align: center; padding: 16px; background-color: white; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <p style="color: #64748b; margin: 0;">No recent sessions. Join a session to get started.</p>
          </div>
        `;
        return;
      }
    
      const authToken = result.authState.token || '';
      const userId = result.authState.user.id;
      
      // Fetch student's session history with UPDATED URL
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        // Fix URL to match your backend API route
        url: `http://localhost:3000/api/students/${userId}/sessions`,
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      }, (response) => {
        // Rest of the function remains the same
        console.log('Student session history response:', response);
        if (!response.ok || response.error) {
          console.error('Error fetching student sessions:', response.error || 'Unknown error');
          sessionListContainer.innerHTML = `
            <div style="text-align: center; padding: 16px; background-color: white; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
              <p style="color: #64748b; margin: 0;">Could not load sessions. Please try again later.</p>
            </div>
          `;
          return;
        }
    
    const sessions = response.data || [];
    
    if (sessions.length === 0) {
      sessionListContainer.innerHTML = `
        <div style="text-align: center; padding: 16px; background-color: white; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <p style="color: #64748b; margin: 0;">No recent sessions. Join a session to get started.</p>
        </div>
      `;
      return;
    }
    
    // Render sessions
    let html = '';
    
    sessions.forEach(session => {
      const date = new Date(session.created_at).toLocaleDateString();
      const isActive = session.status === 'active';
      
      html += `
        <div class="session-item" data-session-id="${session.id}" style="background-color: white; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); margin-bottom: 8px; padding: 12px; cursor: ${isActive ? 'pointer' : 'default'}; transition: transform 0.2s ease;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h3 style="font-size: 15px; font-weight: 600; color: #334155; margin: 0 0 4px 0;">${session.title}</h3>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                <span style="font-family: monospace; font-size: 12px; color: #64748b; background-color: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${session.code}</span>
                <span style="font-size: 12px; color: white; background-color: ${isActive ? '#22c55e' : '#94a3b8'}; padding: 2px 6px; border-radius: 4px;">${isActive ? 'Active' : 'Ended'}</span>
              </div>
            </div>
            <div style="font-size: 12px; color: #64748b;">${date}</div>
          </div>
          
          ${isActive ? `
            <button 
              class="open-session-btn" 
              data-session-id="${session.id}" 
              style="width: 100%; padding: 6px 0; background-color: #5373E7; color: white; border: none; border-radius: 4px; font-size: 12px; font-weight: 500; cursor: pointer; margin-top: 8px; transition: background-color 0.2s ease;"
            >
              Open Session
            </button>
          ` : ''}
        </div>
      `;
    });
    
    sessionListContainer.innerHTML = html;
    
    // Add event listeners for session items
    document.querySelectorAll('.session-item').forEach(item => {
      const sessionId = item.getAttribute('data-session-id');
      const isActive = item.querySelector('span:nth-child(2)').textContent === 'Active';
      
      if (isActive) {
        item.addEventListener('click', (e) => {
          // Don't trigger if clicking on the button
          if (!e.target.closest('.open-session-btn')) {
            openSession(sessionId);
          }
        });
        
        // Add hover effect
        item.addEventListener('mouseenter', () => {
          item.style.transform = 'translateY(-2px)';
          item.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        });
        
        item.addEventListener('mouseleave', () => {
          item.style.transform = 'translateY(0)';
          item.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
        });
      }
    });
    
    // Add event listeners for open session buttons
    document.querySelectorAll('.open-session-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent parent click
        const sessionId = button.getAttribute('data-session-id');
        openSession(sessionId);
      });
      
      // Add hover effect
      button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = '#4361D3';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = '#5373E7';
      });
    });
  });
 });
}

/**
* Function to end a session
* @param {string} sessionId - The session ID
*/
function endSession(sessionId) {
 chrome.storage.local.get(['authState'], (result) => {
  if (!result.authState || !result.authState.isLoggedIn) {
    alert('You must be logged in to end a session.');
    return;
  }
  
  // Stop voice capture if this is the current session
  if (isVoiceCapturing && currentSessionId === sessionId) {
    console.log('Stopping voice capture for ending session:', sessionId);
    stopVoiceCapture();
  }
  
  const authToken = result.authState.token || '';
  
  // Create a loading indicator on the button
  const endButton = document.querySelector(`.lynkk-end-session-btn[data-session-id="${sessionId}"]`);
  if (endButton) {
    const originalContent = endButton.innerHTML;
    endButton.innerHTML = `<div style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: lynkk-spin 1s linear infinite;"></div> Ending...`;
    endButton.disabled = true;
    endButton.style.opacity = '0.7';
    endButton.style.cursor = 'not-allowed';
  }
  
  // Send the API request to end the session
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `http://localhost:3000/api/sessions/${sessionId}/end`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
      alert(`Error ending session: ${chrome.runtime.lastError.message}`);
      
      // Restore button
      if (endButton) {
        endButton.innerHTML = originalContent;
        endButton.disabled = false;
        endButton.style.opacity = '1';
        endButton.style.cursor = 'pointer';
      }
      return;
    }
    
    if (!response.ok || response.error) {
      console.error('API response error:', response.error || 'Unknown error');
      alert(`Error ending session: ${response.error || 'Unknown error'}`);
      
      // Restore button
      if (endButton) {
        endButton.innerHTML = originalContent;
        endButton.disabled = false;
        endButton.style.opacity = '1';
        endButton.style.cursor = 'pointer';
      }
      return;
    }
    
    // Success - reload the session list
    loadProfessorSessionHistory();
  });
});
}

/**
* Function to show create session modal
*/
// function showCreateSessionModal() {
//     // Remove any existing modal
//     const existingModal = document.getElementById('lynkk-create-session-modal');
//     if (existingModal) {
//     existingModal.remove();
//     }

//     // Create modal container
//     const modalOverlay = document.createElement('div');
//     modalOverlay.id = 'lynkk-create-session-modal';
//     modalOverlay.style.position = 'fixed';
//     modalOverlay.style.top = '0';
//     modalOverlay.style.left = '0';
//     modalOverlay.style.width = '100%';
//   modalOverlay.style.height = '100%';
//   modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
//   modalOverlay.style.display = 'flex';
//   modalOverlay.style.justifyContent = 'center';
//   modalOverlay.style.alignItems = 'center';
//   modalOverlay.style.zIndex = '10000';
  
//   // Create modal content
//   modalOverlay.innerHTML = `
//     <div style="background: white; width: 90%; max-width: 500px; border-radius: 8px; padding: 20px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);">
//       <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
//         <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Create New Session</h3>
//         <button id="lynkk-modal-close" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; line-height: 1; color: #6b7280;">×</button>
//       </div>
      
//       <div style="margin-bottom: 20px;">
//         <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">Session Title</label>
//         <input 
//           id="lynkk-session-title" 
//           type="text" 
//           style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
//           placeholder="Enter a title for your session"
//         />
//       </div>
      
//       <div style="margin-bottom: 20px;">
//         <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">Description (Optional)</label>
//         <textarea 
//           id="lynkk-session-description" 
//           style="width: 100%; height: 120px; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; resize: none; transition: border-color 0.2s;"
//           placeholder="Provide additional information about this session"
//         ></textarea>
//       </div>
      
//       <div style="margin-bottom: 20px;">
//         <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">Session Type</label>
//         <div style="display: flex; gap: 10px;">
//           <label style="flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; cursor: pointer; position: relative; transition: all 0.2s;">
//             <input type="radio" name="session-type" value="lecture" style="position: absolute; opacity: 0;" checked>
//             <div style="font-weight: 500; color: #111827; font-size: 14px; margin-bottom: 4px;">Lecture</div>
//             <div style="color: #6b7280; font-size: 13px;">Standard classroom session</div>
//             <div class="radio-indicator" style="position: absolute; top: 12px; right: 12px; width: 16px; height: 16px; border: 2px solid #4a66dd; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
//               <div style="width: 8px; height: 8px; background-color: #4a66dd; border-radius: 50%;"></div>
//             </div>
//           </label>
          
//           <label style="flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; cursor: pointer; position: relative; transition: all 0.2s;">
//             <input type="radio" name="session-type" value="discussion" style="position: absolute; opacity: 0;">
//             <div style="font-weight: 500; color: #111827; font-size: 14px; margin-bottom: 4px;">Discussion</div>
//             <div style="color: #6b7280; font-size: 13px;">Interactive group discussion</div>
//             <div class="radio-indicator" style="position: absolute; top: 12px; right: 12px; width: 16px; height: 16px; border: 2px solid #d1d5db; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
//               <div style="width: 8px; height: 8px; background-color: transparent; border-radius: 50%;"></div>
//             </div>
//           </label>
//         </div>
//       </div>
      
//       <button 
//         id="lynkk-submit-session" 
//         style="width: 100%; padding: 14px; background-color: #4a66dd; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; display: flex; justify-content: center; align-items: center; gap: 8px; transition: background-color 0.2s;"
//       >
//         <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
//         Create Session
//       </button>
//     </div>
//   `;
  
//   document.body.appendChild(modalOverlay);
  
//   // Add event listeners
//   document.getElementById('lynkk-modal-close').addEventListener('click', () => {
//     modalOverlay.remove();
//   });
  
//   // Close modal when clicking outside
//   modalOverlay.addEventListener('click', (e) => {
//     if (e.target === modalOverlay) {
//       modalOverlay.remove();
//     }
//   });
  
//   // Style radio buttons
//   const radioButtons = document.querySelectorAll('input[name="session-type"]');
//   radioButtons.forEach(radio => {
//     radio.addEventListener('change', () => {
//       // Update all radio buttons
//       radioButtons.forEach(rb => {
//         const label = rb.closest('label');
//         const indicator = label.querySelector('.radio-indicator');
//         const dot = indicator.querySelector('div');
        
//         if (rb.checked) {
//           label.style.borderColor = '#4a66dd';
//           label.style.backgroundColor = '#f0f7ff';
//           indicator.style.borderColor = '#4a66dd';
//           dot.style.backgroundColor = '#4a66dd';
//         } else {
//           label.style.borderColor = '#d1d5db';
//           label.style.backgroundColor = 'white';
//           indicator.style.borderColor = '#d1d5db';
//           dot.style.backgroundColor = 'transparent';
//         }
//       });
//     });
//   });
  
//   // Submit button
//   document.getElementById('lynkk-submit-session').addEventListener('click', () => {
//     createSession();
//   });
  
//   // Focus on title input
//   document.getElementById('lynkk-session-title').focus();
// }

/**
 * Function to show create session modal inside the chat container
 */
function showCreateSessionModal() {
  // Get the dashboard container
  const dashboardContainer = document.getElementById('lynkk-dashboard-container');
  if (!dashboardContainer) return;

  // Store original dashboard content for going back
  const originalContent = dashboardContainer.innerHTML;

  // Create session form UI inside the dashboard container
  dashboardContainer.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%; padding: 16px; background-color: #f8fafc; overflow-y: auto;">
      <!-- Header with back button -->
      <div style="display: flex; align-items: center; margin-bottom: 20px;">
        <button id="lynkk-modal-back" style="background: none; border: none; cursor: pointer; display: flex; align-items: center; color: #6b7280; padding: 6px; border-radius: 6px; transition: all 0.2s ease;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span style="margin-left: 6px; font-size: 14px;">Back</span>
        </button>
      </div>
      
      <div style="background: white; border-radius: 10px; padding: 24px; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);">
        <h3 style="margin: 0 0 20px; font-size: 18px; font-weight: 600; color: #111827;">Create New Session</h3>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">Session Title</label>
          <input 
            id="lynkk-session-title" 
            type="text" 
            style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; transition: border-color 0.2s;"
            placeholder="Enter a title for your session"
          />
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">Description (Optional)</label>
          <textarea 
            id="lynkk-session-description" 
            style="width: 100%; height: 120px; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; resize: none; transition: border-color 0.2s;"
            placeholder="Provide additional information about this session"
          ></textarea>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">Session Type</label>
          <div style="display: flex; gap: 10px;">
            <label style="flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; cursor: pointer; position: relative; transition: all 0.2s;">
              <input type="radio" name="session-type" value="lecture" style="position: absolute; opacity: 0;" checked>
              <div style="font-weight: 500; color: #111827; font-size: 14px; margin-bottom: 4px;">Lecture</div>
              <div style="color: #6b7280; font-size: 13px;">Standard classroom session</div>
              <div class="radio-indicator" style="position: absolute; top: 12px; right: 12px; width: 16px; height: 16px; border: 2px solid #4a66dd; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <div style="width: 8px; height: 8px; background-color: #4a66dd; border-radius: 50%;"></div>
              </div>
            </label>
            
            <label style="flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 12px; cursor: pointer; position: relative; transition: all 0.2s;">
              <input type="radio" name="session-type" value="discussion" style="position: absolute; opacity: 0;">
              <div style="font-weight: 500; color: #111827; font-size: 14px; margin-bottom: 4px;">Discussion</div>
              <div style="color: #6b7280; font-size: 13px;">Interactive group discussion</div>
              <div class="radio-indicator" style="position: absolute; top: 12px; right: 12px; width: 16px; height: 16px; border: 2px solid #d1d5db; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <div style="width: 8px; height: 8px; background-color: transparent; border-radius: 50%;"></div>
              </div>
            </label>
          </div>
        </div>
        
        <button 
          id="lynkk-submit-session" 
          style="width: 100%; padding: 14px; background-color: #4a66dd; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; display: flex; justify-content: center; align-items: center; gap: 8px; transition: background-color 0.2s;"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Create Session
        </button>
      </div>
    </div>
  `;
  
  // IMPORTANT FIX: Wait for elements to be added to the DOM before adding event listeners
  setTimeout(() => {
    // Now add the event listeners after the DOM has been updated
    const backButton = document.getElementById('lynkk-modal-back');
    if (backButton) {
      backButton.addEventListener('click', () => {
        // Restore original content
        dashboardContainer.innerHTML = originalContent;
        
        // Re-add event listeners that might have been lost
        const createSessionBtn = document.getElementById('lynkk-create-session-btn');
        if (createSessionBtn) {
          createSessionBtn.addEventListener('click', showCreateSessionModal);
          
          // Re-add hover effects
          createSessionBtn.addEventListener('mouseover', () => {
            createSessionBtn.style.backgroundColor = '#3b57c4';
            createSessionBtn.style.transform = 'translateY(-1px)';
            createSessionBtn.style.boxShadow = '0 4px 8px rgba(74, 102, 221, 0.3)';
          });
          createSessionBtn.addEventListener('mouseout', () => {
            createSessionBtn.style.backgroundColor = '#4a66dd';
            createSessionBtn.style.transform = 'translateY(0)';
            createSessionBtn.style.boxShadow = '0 3px 6px rgba(74, 102, 221, 0.2)';
          });
        }
        
        // Re-add event listener for AI chat button if it exists
        const openAIChatBtn = document.getElementById('lynkk-open-ai-chat');
        if (openAIChatBtn) {
          openAIChatBtn.addEventListener('click', showStandaloneAIAssistant);
          
          // Re-add hover effects
          openAIChatBtn.addEventListener('mouseover', () => {
            openAIChatBtn.style.backgroundColor = '#218838';
            openAIChatBtn.style.transform = 'translateY(-1px)';
            openAIChatBtn.style.boxShadow = '0 4px 8px rgba(40, 167, 69, 0.3)';
          });
          openAIChatBtn.addEventListener('mouseout', () => {
            openAIChatBtn.style.backgroundColor = '#28a745';
            openAIChatBtn.style.transform = 'translateY(0)';
            openAIChatBtn.style.boxShadow = '0 3px 6px rgba(40, 167, 69, 0.2)';
          });
        }
      });
    } else {
      console.error('Back button element not found after DOM update');
    }
    
    // Focus on title input
    const titleInput = document.getElementById('lynkk-session-title');
    if (titleInput) titleInput.focus();
    
    // Style radio buttons
    const radioButtons = document.querySelectorAll('input[name="session-type"]');
    if (radioButtons.length > 0) {
      radioButtons.forEach(radio => {
        radio.addEventListener('change', () => {
          // Update all radio buttons
          radioButtons.forEach(rb => {
            const label = rb.closest('label');
            const indicator = label.querySelector('.radio-indicator');
            const dot = indicator.querySelector('div');
            
            if (rb.checked) {
              label.style.borderColor = '#4a66dd';
              label.style.backgroundColor = '#f0f7ff';
              indicator.style.borderColor = '#4a66dd';
              dot.style.backgroundColor = '#4a66dd';
            } else {
              label.style.borderColor = '#d1d5db';
              label.style.backgroundColor = 'white';
              indicator.style.borderColor = '#d1d5db';
              dot.style.backgroundColor = 'transparent';
            }
          });
        });
      });
    }
    
    // Submit button hover effects
    const submitButton = document.getElementById('lynkk-submit-session');
    if (submitButton) {
      submitButton.addEventListener('mouseenter', () => {
        submitButton.style.backgroundColor = '#3b57c4';
      });
      
      submitButton.addEventListener('mouseleave', () => {
        submitButton.style.backgroundColor = '#4a66dd';
      });
      
      // Submit button
      submitButton.addEventListener('click', () => {
        createSession();
      });
    }
  }, 0); // Even a 0ms timeout ensures this runs after the DOM update
}

/**
 * Function to create a session via API with improved error handling
 */
async function createSession() {
  const titleInput = document.getElementById('lynkk-session-title');
  const descriptionInput = document.getElementById('lynkk-session-description');
  const sessionTypeInputs = document.querySelectorAll('input[name="session-type"]');
  
  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  let sessionType = 'lecture'; // Default
  
  // Get selected session type
  sessionTypeInputs.forEach(input => {
    if (input.checked) {
      sessionType = input.value;
    }
  });
  
  if (!title) {
    // Highlight the field with an error
    titleInput.style.borderColor = '#ef4444';
    titleInput.style.backgroundColor = '#fef2f2';
    titleInput.focus();
    
    // Show error message
    let errorMsg = titleInput.parentNode.querySelector('.error-message');
    if (!errorMsg) {
      errorMsg = document.createElement('div');
      errorMsg.className = 'error-message';
      errorMsg.style.color = '#ef4444';
      errorMsg.style.fontSize = '12px';
      errorMsg.style.marginTop = '4px';
      titleInput.parentNode.appendChild(errorMsg);
    }
    errorMsg.textContent = 'Please enter a session title';
    
    return;
  }
  
  // Reset any previous error styling
  titleInput.style.borderColor = '#d1d5db';
  titleInput.style.backgroundColor = 'white';
  const errorMsg = titleInput.parentNode.querySelector('.error-message');
  if (errorMsg) {
    errorMsg.remove();
  }
  
  // Show loading state
  const submitButton = document.getElementById('lynkk-submit-session');
  const originalButtonHTML = submitButton.innerHTML;
  submitButton.innerHTML = `
    <div class="loading-spinner" style="border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; width: 18px; height: 18px; animation: spin 1s linear infinite;"></div>
    <span>Creating...</span>
  `;
  submitButton.disabled = true;
  
  try {
    // Get auth token using async/await
    const authToken = await getAuthToken();
    
    if (!authToken) {
      // Reset button state
      submitButton.innerHTML = originalButtonHTML;
      submitButton.disabled = false;
      
      // Show error
      showToast('You need to be logged in to create a session', 'error');
      return;
    }
    
    // Make API request to create session
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: 'http://localhost:3000/api/sessions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: {
        title: title,
        description: description || null,
        type: sessionType
      }
    }, (response) => {
      // Reset button state
      submitButton.innerHTML = originalButtonHTML;
      submitButton.disabled = false;
      
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
        return;
      }
      
      if (!response.ok || response.error) {
        console.error('API response error:', response.error || 'Unknown error');
        showToast(`Error creating session: ${response.error || 'Unknown error'}`, 'error');
        return;
      }
      
      console.log('Session created successfully:', response.data);
      
      // Start voice capture for the new session if user is professor
      if (currentUser && currentUser.role === 'professor' && response.data) {
        const sessionId = response.data.id || response.data.data?.id;
        if (sessionId) {
          console.log('Starting voice capture for new session:', sessionId);
          setTimeout(() => {
            startVoiceCapture(sessionId);
          }, 1000); // Small delay to ensure session is fully set up
        }
      }
      
      // Show success dialog with join code
      showSessionSuccessDialog(response.data);
      
      // Switch to history tab and refresh the session list
      setTimeout(() => {
        const historyTab = document.getElementById('lynkk-history-tab');
        if (historyTab) {
          historyTab.click();
        }
      }, 3000); // Give user time to see and interact with success dialog first
    });
  } catch (error) {
    console.error('Error getting auth token:', error);
    submitButton.innerHTML = originalButtonHTML;
    submitButton.disabled = false;
    showToast('Authentication error. Please try again.', 'error');
  }
}

/**
 * Shows a success dialog with the session's join code
 * @param {Object} sessionData - The session data returned from the API
 */
function showSessionSuccessDialog(sessionData) {
  // Get the dashboard container to determine where to add the dialog
  const dashboardContainer = document.getElementById('lynkk-dashboard-container');
  if (!dashboardContainer) return;
  console.log('sessionData:', sessionData);
  // Create session code for display - fixed to properly extract code
  const sessionCode = sessionData.join_code || sessionData.data.code || 'N/A';
  
  // Create the success dialog element - more compact design
  const successDialog = document.createElement('div');
  successDialog.id = 'lynkk-session-success-dialog';
  successDialog.style.position = 'absolute';
  successDialog.style.top = '50%';
  successDialog.style.left = '50%';
  successDialog.style.transform = 'translate(-50%, -50%)';
  successDialog.style.width = '260px'; // Reduced width
  successDialog.style.backgroundColor = 'white';
  successDialog.style.borderRadius = '8px';
  successDialog.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
  successDialog.style.zIndex = '9999';
  successDialog.style.overflow = 'hidden';
  
  // Simpler content structure
  successDialog.innerHTML = `
    <div style="background: linear-gradient(90deg, #4a66dd 0%, #5d7df5 100%); color: white; padding: 12px 16px; text-align: center;">
      <div style="font-weight: 600; font-size: 16px;">Session Created</div>
    </div>
    
    <div style="padding: 16px;">
      <p style="margin: 0 0 8px 0; font-size: 13px; color: #374151; text-align: center;">Share this code with your students:</p>
      
      <div style="position: relative; margin-bottom: 16px;">
        <div id="lynkk-session-code-display" style="background-color: #f3f4f6; border-radius: 6px; padding: 10px; text-align: center; font-size: 20px; font-weight: 700; color: #111827; font-family: monospace;">
          ${sessionCode}
        </div>
        <button id="lynkk-copy-code-btn" style="position: absolute; top: 5px; right: 5px; background-color: #4a66dd; color: white; border: none; border-radius: 4px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Copy code">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      
      <div style="display: flex; gap: 8px;">
        <button id="lynkk-view-session-btn" style="flex: 1; padding: 8px; background-color: #4a66dd; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer;">
          Open
        </button>
        <button id="lynkk-close-dialog-btn" style="flex: 1; padding: 8px; background-color: #f3f4f6; color: #4b5563; border: none; border-radius: 4px; font-size: 13px; cursor: pointer;">
          Close
        </button>
      </div>
    </div>
  `;
  
  // Position relatively
  dashboardContainer.style.position = 'relative';
  dashboardContainer.appendChild(successDialog);
  
  // Create a semi-transparent overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  overlay.style.zIndex = '9998';
  dashboardContainer.appendChild(overlay);
  
  // Add event listeners
  const copyBtn = document.getElementById('lynkk-copy-code-btn');
  const viewSessionBtn = document.getElementById('lynkk-view-session-btn');
  const closeDialogBtn = document.getElementById('lynkk-close-dialog-btn');
  
  // Copy button functionality
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      // Copy the code to clipboard
      navigator.clipboard.writeText(sessionCode).then(() => {
        // Show success indicator on button
        copyBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5"></path>
          </svg>
        `;
        copyBtn.style.backgroundColor = '#10B981';
        
        // Reset the button after a delay
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          `;
          copyBtn.style.backgroundColor = '#4a66dd';
        }, 2000);
      });
    });
  }
  
  // Open session button
  if (viewSessionBtn) {
    viewSessionBtn.addEventListener('click', () => {
      closeSuccessDialog();
      if (sessionData && sessionData.data.id) {
console.log('wwwwwOpening session with ID:', sessionData.data.id);
        openSession(sessionData.data.id);
      }
    });
  }
  
  // Close button
  if (closeDialogBtn) {
    closeDialogBtn.addEventListener('click', closeSuccessDialog);
  }
  
  // Function to close the dialog
  function closeSuccessDialog() {
    if (successDialog) successDialog.remove();
    if (overlay) overlay.remove();
    dashboardContainer.style.position = '';
  }
  
  // Auto-close after 10 seconds
  const autoCloseTimer = setTimeout(closeSuccessDialog, 10000);
}

// /**
//  * Function to create a session via API with improved error handling
//  */
// async function createSession() {
//   const titleInput = document.getElementById('lynkk-session-title');
//   const descriptionInput = document.getElementById('lynkk-session-description');
//   const sessionTypeInputs = document.querySelectorAll('input[name="session-type"]');
  
//   const title = titleInput.value.trim();
//   const description = descriptionInput.value.trim();
//   let sessionType = 'lecture'; // Default
  
//   // Get selected session type
//   sessionTypeInputs.forEach(input => {
//     if (input.checked) {
//       sessionType = input.value;
//     }
//   });
  
//   if (!title) {
//     // Highlight the field with an error
//     titleInput.style.borderColor = '#ef4444';
//     titleInput.style.backgroundColor = '#fef2f2';
//     titleInput.focus();
    
//     // Show error message
//     let errorMsg = titleInput.parentNode.querySelector('.error-message');
//     if (!errorMsg) {
//       errorMsg = document.createElement('div');
//       errorMsg.className = 'error-message';
//       errorMsg.style.color = '#ef4444';
//       errorMsg.style.fontSize = '12px';
//       errorMsg.style.marginTop = '4px';
//       titleInput.parentNode.appendChild(errorMsg);
//     }
//     errorMsg.textContent = 'Please enter a session title';
    
//     return;
//   }
  
//   // Reset any previous error styling
//   titleInput.style.borderColor = '#d1d5db';
//   titleInput.style.backgroundColor = 'white';
//   const errorMsg = titleInput.parentNode.querySelector('.error-message');
//   if (errorMsg) {
//     errorMsg.remove();
//   }
  
//   // Show loading state
//   const submitButton = document.getElementById('lynkk-submit-session');
//   const originalButtonHTML = submitButton.innerHTML;
//   submitButton.innerHTML = `
//     <div class="loading-spinner" style="border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; width: 18px; height: 18px; animation: spin 1s linear infinite;"></div>
//     <span>Creating...</span>
//   `;
//   submitButton.disabled = true;
  
//   try {
//     // Get auth token using async/await
//     const authToken = await getAuthToken();
    
//     if (!authToken) {
//       // Reset button state
//       submitButton.innerHTML = originalButtonHTML;
//       submitButton.disabled = false;
      
//       // Show error
//       showToast('You need to be logged in to create a session', 'error');
//       return;
//     }
    
//     // Make API request to create session
//     chrome.runtime.sendMessage({
//       type: 'API_REQUEST',
//       url: 'http://localhost:3000/api/sessions',
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${authToken}`
//       },
//       body: {
//         title: title,
//         description: description || null,
//         type: sessionType
//       }
//     }, (response) => {
//       // Reset button state
//       submitButton.innerHTML = originalButtonHTML;
//       submitButton.disabled = false;
      
//       if (chrome.runtime.lastError) {
//         console.error('Runtime error:', chrome.runtime.lastError);
//         showToast(`Error: ${chrome.runtime.lastError.message}`, 'error');
//         return;
//       }
      
//       if (!response.ok || response.error) {
//         console.error('API response error:', response.error || 'Unknown error');
//         showToast(`Error creating session: ${response.error || 'Unknown error'}`, 'error');
//         return;
//       }
      
//       console.log('Session created successfully:', response.data);
      
//       // Close the modal
//       const modal = document.getElementById('lynkk-create-session-modal');
//       if (modal) {
//         modal.remove();
//       }
      
//       // Show success message
//       showToast('Session created successfully!', 'success');
      
//       // Switch to history tab and refresh the session list
//       const historyTab = document.getElementById('lynkk-history-tab');
//       if (historyTab) {
//         historyTab.click();
//       }
      
//       // Open the session immediately
//       if (response.data && response.data.id) {
//         openSession(response.data.id);
//       }
//     });
//   } catch (error) {
//     console.error('Error getting auth token:', error);
//     submitButton.innerHTML = originalButtonHTML;
//     submitButton.disabled = false;
//     showToast('Authentication error. Please try again.', 'error');
//   }
// }
    /**
     * Function to join a session using the session code
     */
    async function joinSession() {
        const sessionCodeInput = document.getElementById('lynkk-session-code');
        const errorElement = document.getElementById('lynkk-join-error');
        
        if (!sessionCodeInput || !errorElement) return;
        
        const sessionCode = sessionCodeInput.value.trim();
        
        // Validate session code
        if (!sessionCode) {
        errorElement.textContent = 'Please enter a session code';
        errorElement.style.display = 'block';
        sessionCodeInput.focus();
        return;
        }
        
        // Hide previous errors
        errorElement.style.display = 'none';
        
        // Disable the input and show loading state
        const joinButton = document.getElementById('lynkk-join-session');
        sessionCodeInput.disabled = true;
        
        if (joinButton) {
        const originalContent = joinButton.innerHTML;
        joinButton.innerHTML = `<div class="spinner" style="display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite;"></div>`;
        joinButton.disabled = true;
        
        try {
            // Get auth token
            const authToken = await getAuthToken();
            
            if (!authToken) {
            // Show error for not being logged in
            errorElement.textContent = 'You need to be logged in to join a session';
            errorElement.style.display = 'block';
            sessionCodeInput.disabled = false;
            
            if (joinButton) {
                joinButton.innerHTML = originalContent;
                joinButton.disabled = false;
            }
            
            return;
            }
            
            console.log('Attempting to join session with code:', sessionCode);
            
            // Make API request to join session
            chrome.runtime.sendMessage({
            type: 'API_REQUEST',
            url: `http://localhost:3000/api/sessions/join`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: { code: sessionCode }
            }, (response) => {
            // Reset button state
            joinButton.innerHTML = originalContent;
            joinButton.disabled = false;
            sessionCodeInput.disabled = false;
            
            console.log('Join session response:', response);
            
            if (!response || !response.ok || response.error) {
                console.error('Error joining session:', response ? (response.error || 'Unknown error') : 'No response received');
                errorElement.textContent = response && response.error ? response.error : 'Failed to join session. Please check the code and try again.';
                errorElement.style.display = 'block';
                return;
            }
            
            // Extract the session data - handle different response structures
            let sessionData = null;
            if (response.data) {
                if (response.data.data) {
                // Handle nested data structure
                sessionData = response.data.data;
                } else {
                // Direct data object
                sessionData = response.data;
                }
            }
            
            if (!sessionData || !sessionData.id) {
                console.error('Invalid session data in response:', response.data);
                errorElement.textContent = 'Invalid session response';
                errorElement.style.display = 'block';
                return;
            }
            
            console.log('Session joined successfully:', sessionData);
            
            // Show success toast
            showToast('Successfully joined session!', 'success');
            
            // Open the session
            openSession(sessionData.id);
            });
        } catch (error) {
            console.error('Error in joinSession:', error);
            
            // Reset states
            joinButton.innerHTML = originalContent;
            joinButton.disabled = false;
            sessionCodeInput.disabled = false;
            
            // Show error
            errorElement.textContent = error.message || 'An error occurred. Please try again.';
            errorElement.style.display = 'block';
        }
        }
    }
  
  
/**
 * Function to open a session
 * @param {string} sessionId - The session ID
 */
async function openSession(sessionId) {
  console.log(`Opening session with ID: ${sessionId}`);
  
  try {
    // Get auth token using the existing getAuthToken function
    const authToken = await getAuthToken();
    
    if (!authToken) {
      console.error('No auth token available');
      showToast('Authentication error - please log in again', 'error');
      return;
    }
    
    // Show the chat container if not already shown
    if (!chatContainerCreated) {
      createChatContainer();
    }
    if (!chatVisible) {
      toggleChat();
    }
    
    // Show loading state in the dashboard container
    const dashboardContainer = document.getElementById('lynkk-dashboard-container');
    if (dashboardContainer) {
      dashboardContainer.innerHTML = `
        <div style="height: 100%; display: flex; justify-content: center; align-items: center; flex-direction: column;">
          <div class="loading-spinner" style="border: 4px solid #f3f4f6; border-top: 4px solid #4a66dd; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
          <p style="color: #6b7280;">Loading session...</p>
        </div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;
    }
    
    // Fetch session data
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: `http://localhost:3000/api/sessions/${sessionId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    }, (response) => {
      if (!response.ok || response.error) {
        console.error('Error fetching session:', response.error || 'Unknown error');
        showToast('Could not open session. Please try again later.', 'error');
        return;
      }
      
      const session = response.data;
      console.log('Session opened successfully:', session);
      
      // Initialize Gemini context with session data
      initGeminiContext(session);
      
      // Store session data
      chrome.storage.local.set({ 
        activeSession: session,
        activeTab: 'ai' // Set AI tab as default active tab
      }, () => {
        console.log('Session stored in local storage');
        
        // Start voice capture if user is professor
        if (currentUser && currentUser.role === 'professor') {
          console.log('Starting voice capture for session:', sessionId);
          setTimeout(() => {
            startVoiceCapture(sessionId);
          }, 1000); // Small delay to ensure session is fully set up
        }
        
        // Render session tabs
        renderSessionTabs();
        
        // Load session data (messages, polls, etc.)
        loadSessionData(sessionId);
        
        // Load previous AI conversations for this session
        loadPreviousAIConversations().then(messages => {
          console.log(`Loaded ${messages.length} previous AI messages for this session`);
          
          // Display previous AI messages in the UI
          if (messages.length > 0) {
            // Clear any welcome message first
            const aiMessagesContainer = document.getElementById('lynkk-ai-messages');
            if (aiMessagesContainer) {
              // Keep welcome message if it exists
              const welcomeMsg = aiMessagesContainer.querySelector('.lynkk-welcome-message');
              const welcomeMsgHtml = welcomeMsg ? welcomeMsg.outerHTML : '';
              aiMessagesContainer.innerHTML = welcomeMsgHtml;
            }
            
            // Add each message to the UI and to the geminiContext
            messages.forEach(message => {
              // Add to geminiContext for conversation continuity
              geminiContext.messages.push({
                role: message.role,
                content: message.content
              });
              
              // Display in UI
              showAIMessage({
                content: message.content,
                isUser: message.role === 'user',
                timestamp: new Date(message.created_at)
              });
            });
          }
        }).catch(error => {
          console.error('Error loading previous AI conversations:', error);
        });

        // Show the AI tab by default
        showTab('ai');
      });
    });
  } catch (error) {
    console.error('Error opening session:', error);
    showToast('An error occurred. Please try again.', 'error');
  }
}

/**
 * Load all session data with improved handling
 * @param {string} sessionId - The session ID
 */
async function loadSessionData(sessionId) {
  try {
    // Get auth token
    const authToken = await getAuthToken();
    
    if (!authToken) {
      console.error('No auth token available');
      return;
    }
    console.log(`Loading data for session: ${sessionId}`);
    
    // Get auth token
    const authState = await new Promise(resolve => {
      chrome.storage.local.get(['authState'], result => resolve(result.authState || {}));
    });
  
    // Load messages
    console.log('Fetching messages...');
    const messagesResponse = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: `http://localhost:3000/api/sessions/${sessionId}/messages`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }, resolve);
    });
    
    if (messagesResponse.ok && messagesResponse.data) {
      console.log(`Loaded ${messagesResponse.data.length} messages`);
      // Store messages in local storage
      chrome.storage.local.set({ sessionMessages: messagesResponse.data });
      // Render chat messages (won't be visible until chat tab is active)
      renderChatMessages(messagesResponse.data);
    } else {
      console.error('Failed to load messages:', messagesResponse.error);
    }
    
    // Load polls
    console.log('Fetching polls...');
    const pollsResponse = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: `http://localhost:3000/api/sessions/${sessionId}/polls`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }, resolve);
    });
    
    if (pollsResponse.ok && pollsResponse.data) {
      console.log(`Loaded ${pollsResponse.data.length} polls`);
      // Store polls in local storage
      chrome.storage.local.set({ sessionPolls: pollsResponse.data });
      // Render polls (won't be visible until polls tab is active)
      renderPolls(pollsResponse.data);
    } else {
      console.error('Failed to load polls:', pollsResponse.error);
    }
    
    // Load anonymous questions (for students)
    console.log('Fetching anonymous questions...');
    const anonymousResponse = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: `http://localhost:3000/api/anonymous/user/${sessionId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }, resolve);
    });
    console.log('Anonymous questions response:', anonymousResponse);
    if (anonymousResponse.ok && anonymousResponse.data) {
      console.log(`Loaded ${anonymousResponse.data.length} anonymous questions`);
      // Store anonymous questions in local storage
      chrome.storage.local.set({ anonymousQuestions: anonymousResponse.data });
      
      // FIX 2: Use the new function name instead of the removed one
      // Get the container and call the new function
      const container = document.getElementById('lynkk-student-questions-history-container');
      if (container) {
        loadStudentQuestionsForSession(sessionId, authToken);
      } else {
        console.log('Student questions container not found - will load later when tab is active');
      }
    }
    
    // Setup session analytics (student count, message count, etc.)
    console.log('Fetching analytics...');
    const analyticsResponse = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: `http://localhost:3000/api/sessions/${sessionId}/analytics`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      }, resolve);
    });

    // Better error handling
    if (analyticsResponse.ok && analyticsResponse.data) {
      console.log('Loaded analytics:', analyticsResponse.data);
      // Store analytics in local storage
      chrome.storage.local.set({ sessionAnalytics: analyticsResponse.data });
      // Update analytics display
      updateAnalyticsDisplay(analyticsResponse.data);
    } else {
      console.error('Failed to load analytics:', analyticsResponse.error || 'Unknown error');
      // Display fallback message in UI
      updateAnalyticsDisplay(null);
    }
  } catch (error) {
    console.error('Error loading session data:', error);
  }
}
/**
 * Updates the analytics display in the UI
 * @param {Object} analytics - The analytics data
 */
function updateAnalyticsDisplay(analytics) {
    console.log('Updating analytics display with:', analytics);
    
    // Check if analytics data is available
    if (!analytics) {
      console.warn('No analytics data available');
      return;
    }
    
    // Find relevant UI elements to update
    const studentCountElement = document.getElementById('lynkk-student-count');
    const messageCountElement = document.getElementById('lynkk-message-count');
    const anonymousCountElement = document.getElementById('lynkk-anonymous-count');
    const aiInteractionCountElement = document.getElementById('lynkk-ai-interaction-count');
    const pollCountElement = document.getElementById('lynkk-poll-count');
    
    // Update counts if elements exist
    if (studentCountElement) {
      studentCountElement.textContent = analytics.student_count || 0;
    }
    
    if (messageCountElement) {
      messageCountElement.textContent = analytics.message_count || 0;
    }
    
    if (anonymousCountElement) {
      anonymousCountElement.textContent = analytics.anonymous_message_count || 0;
    }
    
    if (aiInteractionCountElement) {
      aiInteractionCountElement.textContent = analytics.ai_interaction_count || 0;
    }
    
    if (pollCountElement) {
      pollCountElement.textContent = analytics.poll_count || 0;
    }
    
    // Update any other analytics displays in the UI
    // For example, if you have visual charts or progress bars
    
    // If you have analytics elements in the professor dashboard
    const professorDashboard = document.getElementById('lynkk-prof-questions-container');
    if (professorDashboard) {
      // You might want to update a stats summary at the top of the dashboard
      const statsSummary = professorDashboard.querySelector('.lynkk-stats-summary');
      if (statsSummary) {
        // Update the specific statistics elements
        // This depends on your exact HTML structure
      }
    }
  }

// ==================== SESSION TABS & UI FUNCTIONS ====================



//--==================== SESSION TABS & UI FUNCTIONS afteer anony ====================
    /**
 * Update the renderSessionTabs function in content.js to integrate our new components
 * 
 * This shows how to modify the existing session tabs to include our new anonymous questions dashboard.
 * 
 * You'll need to incorporate this code into your existing content.js file.
 */

// Replace or modify the existing renderSessionTabs function
function renderSessionTabs() {
    const dashboardContainer = document.getElementById('lynkk-dashboard-container');
    if (!dashboardContainer) return;
  
    // Only add styles if they don't exist yet
    if (!document.getElementById('lynkk-session-tabs-styles')) {
      const styleElement = document.createElement('style');
      styleElement.id = 'lynkk-session-tabs-styles';
      styleElement.textContent = `
        .lynkk-dashboard {
          display: flex;
          flex-direction: column;
          max-width: 100%;
          height: 100%;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", sans-serif;
          overflow: hidden;
          position: relative;
        }
        
        /* Navigation */
        .lynkk-nav-container {
          position: sticky;
          top: 0;
          z-index: 15;
          background-color: white;
          border-bottom: 1px solid #e2e8f0;
        }
        
        /* Tabs Navigation */
        .lynkk-tabs {
          display: flex;
          background: #f1f5f9;
          padding: 0;
          margin: 0;
        }
        
        /* Tab styles */
        .lynkk-tab {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          flex: 1;
          padding: 10px 4px;
          border: none;
          border-bottom: 3px solid transparent;
          background: transparent;
          color: #64748b;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .lynkk-tab.active {
          background: #f8fafc;
          color: #6366f1;
          border-bottom: 3px solid #6366f1;
        }
        
        .lynkk-tab svg {
          width: 16px;
          height: 16px;
          stroke-width: 2;
        }
        
        /* Content Areas */
        .lynkk-tab-content {
          flex: 1;
          display: flex;
          overflow: hidden;
          position: relative;
          height: calc(100% - 120px); /* Account for nav and bottom bar */
        }
        
        .lynkk-content {
          display: none;
          flex-direction: column;
          width: 100%;
          height: 100%;
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          overflow-y: auto; /* Enable scrolling */
          padding-bottom: 60px; /* Space for bottom bar */
        }
        
        .lynkk-content.active {
          display: flex;
        }
        
        /* Bottom bar */
        .lynkk-bottom-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 8px 12px;
          background: white;
          border-top: 1px solid #e2e8f0;
          z-index: 10;
          box-sizing: border-box;
          width: 100%;
          max-width: inherit; /* Inherit parent width */
        }
        
        /* Common components */
        .lynkk-loading {
          text-align: center;
          color: #94a3b8;
          padding: 15px;
          font-size: 13px;
        }
        
        .lynkk-empty-state {
          text-align: center;
          color: #94a3b8;
          padding: 15px;
          font-size: 13px;
        }
        
        .lynkk-input-group {
          display: flex;
          gap: 8px;
          width: 100%;
        }
        
        .lynkk-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 13px;
          transition: all 0.2s;
          outline: none;
        }
        
        .lynkk-input:focus {
          border-color: #6366f1;
        }
        
        .lynkk-send-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          min-width: 36px;
          background-color: #6366f1;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .lynkk-send-btn:hover {
          background-color: #4f46e5;
        }
        
        .lynkk-full-btn {
          width: 100%;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background-color: #6366f1;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .lynkk-full-btn:hover {
          background-color: #4f46e5;
        }
        
        .lynkk-content-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .lynkk-content-header h2 {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }
        
        .lynkk-new-question-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #6366f1;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .lynkk-new-question-btn svg {
          width: 14px;
          height: 14px;
        }
        
        .lynkk-ai-messages,
        .lynkk-messages,
        .lynkk-anon-history,
        .lynkk-polls-list {
          flex: 1;
          overflow-y: auto;
          padding: 10px 16px;
          padding-bottom: 70px; /* Ensure content doesn't hide behind fixed bottom bar */
          height: calc(100% - 60px); /* Account for header */
        }
        
        .lynkk-welcome-message {
          color: #64748b;
          font-size: 14px;
          padding: 10px;
          background-color: #f8fafc;
          border-radius: 8px;
        }
        
        .lynkk-welcome-message p {
          margin: 0;
        }
      `;
      document.head.appendChild(styleElement);
    }
  
    // Add HTML structure to the dashboard
    dashboardContainer.innerHTML = `
      <div class="lynkk-dashboard">
        <!-- Tab Navigation - Fixed at the top -->
        <div class="lynkk-nav-container">
          <nav class="lynkk-tabs">
            <button id="lynkk-ai-tab" class="lynkk-tab active" data-tab="ai">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a9 9 0 0 1 9 9c0 3.18-1.65 5.64-4.5 7.5L12 22l-4.5-3.5C4.65 16.64 3 14.18 3 11a9 9 0 0 1 9-9z"/>
                <path d="M9 11l3 3 6-6"/>
              </svg>
              <span>AI</span>
            </button>
            <button id="lynkk-chat-tab" class="lynkk-tab" data-tab="chat">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              <span>Chat</span>
            </button>
            <button id="lynkk-anonymous-tab" class="lynkk-tab" data-tab="anonymous">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span>${currentUser && currentUser.role === 'professor' ? 'Questions' : 'Anonymous'}</span>
            </button>
            <button id="lynkk-polls-tab" class="lynkk-tab" data-tab="polls">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              <span>Polls</span>
            </button>
          </nav>
        </div>
        
        <!-- Tab Content -->
        <div class="lynkk-tab-content">
          <!-- AI Tab -->
          <div id="lynkk-ai-content" class="lynkk-content active">
            <div class="lynkk-ai-container">
              <div class="lynkk-ai-messages" id="lynkk-ai-messages">
                <div class="lynkk-welcome-message">
                  <h2 style="font-size: 20px; font-weight: 600; color: #111827;">Welcome to AskLynk AI Assistant</h2>
                  <p style="font-size: 14px; color: #6b7280;">Ask your questions and get instant answers!</p>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Chat Tab -->
          <div id="lynkk-chat-content" class="lynkk-content">
            <div class="lynkk-chat-container">
              <div class="lynkk-messages" id="lynkk-messages-container">
                <div class="lynkk-loading">Loading messages...</div>
              </div>
            </div>
          </div>
          
         <!-- Anonymous/Questions Tab -->
<div id="lynkk-anonymous-content" class="lynkk-content">
  <div class="lynkk-anonymous-container">
    ${currentUser && currentUser.role === 'professor' 
      ? '<div id="lynkk-prof-questions-container"></div>' // Container for professor questions dashboard
      : `
        <div id="lynkk-student-question-form-container" class="p-4"></div>
        <div class="bg-white rounded-lg shadow-md p-4 mx-4 mb-4">
          <h3 class="text-lg font-medium text-gray-800 mb-4">Your Questions</h3>
          <div id="lynkk-student-questions-history-container"></div>
        </div>
      `}
  </div>
</div>
          
          <!-- Polls Tab -->
          <div id="lynkk-polls-content" class="lynkk-content">
            <div class="lynkk-polls-container">
              <div id="lynkk-polls-list" class="lynkk-polls-list">
                <div class="lynkk-loading">Loading polls...</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Input Boxes - Fixed to Bottom -->
        <div id="lynkk-ai-input-container" class="lynkk-bottom-bar">
          <div class="lynkk-input-group">
            <input 
              type="text" 
              id="lynkk-ai-input" 
              placeholder="Ask the AI assistant..." 
              class="lynkk-input"
            />
            <button id="lynkk-ai-send" class="lynkk-send-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </div>
        
        <div id="lynkk-chat-input-container" class="lynkk-bottom-bar" style="display: none;">
          <div class="lynkk-input-group">
            <input 
              type="text" 
              id="lynkk-chat-input" 
              placeholder="Type your message..." 
              class="lynkk-input"
            />
            <button id="lynkk-send-message" class="lynkk-send-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </div>
        </div>
        
        <div id="lynkk-anonymous-input-container" class="lynkk-bottom-bar" style="display: none;">
          <!-- No specific input container for anonymous tab as it's handled in the form component -->
        </div>
        
        <div id="lynkk-polls-input-container" class="lynkk-bottom-bar" style="display: none;">
          ${currentUser && currentUser.role === 'professor' ? `
          <div class="lynkk-input-group">
            <button id="lynkk-create-poll" class="lynkk-full-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Create New Poll
            </button>
          </div>
          ` : ''}
        </div>
      </div>
    `;
    
    // Set initial input container visibility state
    document.getElementById('lynkk-chat-input-container').style.display = 'none';
    document.getElementById('lynkk-anonymous-input-container').style.display = 'none';
    document.getElementById('lynkk-polls-input-container').style.display = 'none';
    document.getElementById('lynkk-ai-input-container').style.display = 'block'; // Make sure AI input is visible
  
    // Add event listeners for tab switching
    document.querySelectorAll('.lynkk-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        showTab(tabName);
      });
    });
    
    // Add event listeners for chat functionality
    document.getElementById('lynkk-send-message').addEventListener('click', sendMessage);
    document.getElementById('lynkk-chat-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
    
    // Add event listeners for AI functionality
    document.getElementById('lynkk-ai-send').addEventListener('click', () => {
      const aiInput = document.getElementById('lynkk-ai-input');
      const question = aiInput.value.trim();
      if (question) {
        sendAIQuestion(question);
        aiInput.value = '';
      }
    });
    
    document.getElementById('lynkk-ai-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const question = e.target.value.trim();
        if (question) {
          sendAIQuestion(question);
          e.target.value = '';
        }
      }
    });
    
    // Initialize poll creation for professors
    if (currentUser && currentUser.role === 'professor') {
      const createPollButton = document.getElementById('lynkk-create-poll');
      if (createPollButton) {
        createPollButton.addEventListener('click', showCreatePollModal);
      }
    }
    
    // Render custom components for the anonymous tab
    renderAnonymousComponents();
  }
  

  
 function showQuestionDetailModal(question) {
  // Remove any existing modal
  const existingModal = document.getElementById('lynkk-full-question-modal');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'lynkk-full-question-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '10000';
  
  const createdAt = new Date(question.created_at);
  const formattedDate = createdAt.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  
  modal.innerHTML = `
    <div style="background: white; width: 90%; max-width: 320px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); overflow: hidden;">
      <div style="background-color: ${question.resolved ? '#10b981' : '#3b82f6'}; padding: 12px 16px; color: white; display: flex; justify-content: space-between; align-items: center;">
        <h4 style="margin: 0; font-size: 14px; font-weight: 600;">Your Question</h4>
        <button id="lynkk-modal-close" style="background: none; border: none; color: white; cursor: pointer; width: 20px; height: 20px;">✕</button>
      </div>
      
      <div style="padding: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
          <span style="font-size: 12px; color: #6b7280;">Asked as: ${question.anonymous_name || 'Anonymous'}</span>
          <span style="font-size: 12px; color: #6b7280;">${formattedDate}</span>
        </div>
        
        <div style="background-color: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
          <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #1f2937;">${question.content}</p>
        </div>
        
        <div style="display: flex; align-items: center; gap: 8px; background-color: ${question.resolved ? '#d1fae5' : '#dbeafe'}; padding: 8px 12px; border-radius: 6px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${question.resolved ? 
              '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' : 
              '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>'}
          </svg>
          <span style="font-size: 12px; font-weight: 500; color: ${question.resolved ? '#065f46' : '#1e40af'};">
            ${question.resolved ? 'This question has been answered' : 'This question is waiting for an answer'}
          </span>
        </div>
      </div>
      
      <div style="border-top: 1px solid #e5e7eb; padding: 12px 16px; text-align: right;">
        <button id="lynkk-modal-dismiss" style="background-color: #f3f4f6; border: none; padding: 6px 12px; border-radius: 6px; color: #4b5563; font-size: 12px; cursor: pointer;">
          Close
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Add event listeners
  document.getElementById('lynkk-modal-close').addEventListener('click', () => {
    modal.remove();
  });
  
  document.getElementById('lynkk-modal-dismiss').addEventListener('click', () => {
    modal.remove();
  });
  
  // Close when clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // Add animation for the modal
  const modalContent = modal.querySelector('div');
  modalContent.style.transform = 'scale(0.9)';
  modalContent.style.opacity = '0';
  modalContent.style.transition = 'all 0.2s ease-out';
  
  // Trigger animation
  setTimeout(() => {
    modalContent.style.transform = 'scale(1)';
    modalContent.style.opacity = '1';
  }, 10);
}



function renderProfessorQuestionDashboard(container, sessionId, authToken) {
  if (!container) return;

  // Create the dashboard UI with a clean, modern design
  container.innerHTML = `
      <div class="lynkk-professor-dashboard" style="height: 100%; overflow-y: auto; font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; padding: 20px; background-color: #f9fafb;">
          <!-- Stats Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; background-color: white; border-radius: 8px; padding: 8px 12px; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03); margin-bottom: 4px; margin-top: -20px;">
              <div style="display: flex; gap: 16px; align-items: center;">
                  <!-- Question Statistics -->
                  <div style="display: flex; align-items: center; gap: 4px;">
                      <span style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background-color: #f3f4f6; border-radius: 6px; margin-right: 6px;">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                          </svg>
                      </span>
                      <span id="lynkk-total-questions" style="font-size: 16px; font-weight: 600; color: #1f2937;">0</span>
                  </div>

                  <div style="display: flex; align-items: center; gap: 4px;">
                      <span style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background-color: #f3f4f6; border-radius: 6px; margin-right: 6px;">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                      </span>
                      <span id="lynkk-anon-questions" style="font-size: 16px; font-weight: 600; color: #1f2937;">0</span>
                  </div>

                  <div style="display: flex; align-items: center; gap: 4px;">
                      <span style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; background-color: #f3f4f6; border-radius: 6px; margin-right: 6px;">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="12" y1="8" x2="12" y2="12"></line>
                              <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                      </span>
                      <span id="lynkk-pending-questions" style="font-size: 16px; font-weight: 600; color: #1f2937;">0</span>
                  </div>
              </div>

              <!-- Refresh Button -->
              <button id="lynkk-manual-refresh" style="display: flex; align-items: center; justify-content: center; background-color: #3b82f6; color: white; border: none; width: 36px; height: 36px; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M23 4v6h-6"></path>
                      <path d="M1 20v-6h6"></path>
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
              </button>
          </div>

          <!-- Search and Filter Controls -->
         <div style="padding: 3px 12px 6px 12px; border-top: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;">
              <div style="position: relative; width: 100%; max-width: 300px;">
                  <input 
                      id="lynkk-question-search" 
                      type="text" 
                      placeholder="Search" 
                      style="width: 100%; padding: 8px 12px 8px 36px; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 14px; outline: none;"
                  />
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%);">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
              </div>
              
              <div style="display: flex; gap: 8px; align-items: center;">
                  <div class="filter-dropdown" style="position: relative;">
                      <button id="lynkk-filter-btn" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                          </svg>
                      </button>
                      <select id="lynkk-question-filter" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                          <option value="all">All</option>
                          <option value="unresolved">Unresolved</option>
                          <option value="resolved">Resolved</option>
                          <option value="anonymous">Anonymous</option>
                          <option value="priority">Priority</option>
                      </select>
                  </div>
                  
                  <div class="sort-dropdown" style="position: relative;">
                      <button id="lynkk-sort-btn" style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M11 5h10"></path>
                              <path d="M11 9h7"></path>
                              <path d="M11 13h4"></path>
                              <path d="M3 17h18"></path>
                              <path d="M3 12V5l4 7V5"></path>
                          </svg>
                      </button>
                      <select id="lynkk-question-sort" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;">
                          <option value="latest">Most Recent</option>
                          <option value="priority">Highest Priority</option>
                          <option value="resolved">Unresolved First</option>
                      </select>
                  </div>
                  
                  <!-- Auto-refresh Toggle -->
                  <label for="lynkk-auto-refresh" style="display: flex; align-items: center; cursor: pointer;">
                      <input type="checkbox" id="lynkk-auto-refresh" checked style="position: absolute; opacity: 0;">
                      <div id="lynkk-toggle-background" style="position: relative; width: 36px; height: 20px; background-color: #3b82f6; border-radius: 20px; transition: all 0.2s ease;">
                          <div id="lynkk-toggle-circle" style="position: absolute; width: 16px; height: 16px; background-color: white; border-radius: 50%; top: 2px; left: 18px; transition: all 0.2s ease;"></div>
                      </div>
                  </label>
              </div>
          </div>

          <!-- Questions List Container -->
        <div id="lynkk-questions-list" style="margin-top: 2px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03); min-height: 260px;">
              <!-- Loading state initially -->
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 20px; background-color: white;">
                  <div style="width: 40px; height: 40px; border: 3px solid #EEF2FF; border-top-color: #6366F1; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 16px;"></div>
                  <p style="margin: 0; font-size: 16px; color: #4B5563;">Hang tight! We're loading...</p>
              </div>
          </div>
      </div>
  `;

  // Add CSS styles
  if (!document.getElementById('lynkk-dashboard-styles')) {
    const style = document.createElement('style');
    style.id = 'lynkk-dashboard-styles';
    style.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        #lynkk-auto-refresh:not(:checked) + div {
            background-color: #d1d5db;
        }

        #lynkk-auto-refresh:not(:checked) + div div {
            left: 2px;
        }

        .lynkk-question-item:hover {
            background-color: #f9fafb;
        }

        .lynkk-resolve-btn:hover {
            background-color: #4ade80;
        }
    `;
    document.head.appendChild(style);
  }

  // Define variables for auto-refresh mechanism
  let refreshInterval = null;
  let visibilityHandler = null;

  // Handle visibility change - defined early to avoid reference errors
  function handleVisibilityChange() {
    const autoRefreshToggle = document.getElementById('lynkk-auto-refresh');
    if (document.visibilityState === 'visible' && autoRefreshToggle && autoRefreshToggle.checked) {
      console.log('Tab became visible, refreshing questions...');
      refreshQuestions();
    }
  }

  // Centralized function to fetch questions
  function refreshQuestions() {
    const searchInput = document.getElementById('lynkk-question-search');
    const filterSelect = document.getElementById('lynkk-question-filter');
    const sortSelect = document.getElementById('lynkk-question-sort');

    fetchAndDisplayQuestions(
      sessionId, 
      authToken, 
      sortSelect?.value || 'latest', 
      {
        search: searchInput?.value || '',
        filter: filterSelect?.value || 'all'
      }
    );
  }

  // Improved auto-refresh management
  function startAutoRefresh() {
    console.log('Starting auto-refresh');
    stopAutoRefresh(); // Ensure we clean up any existing interval
    
    // Set up the refresh interval - only refreshes when tab is visible
    refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        console.log('Auto-refreshing questions...');
        refreshQuestions();
      }
    }, 60000); // 1-minute refresh
    
    // Add visibility change listener if not already added
    if (!visibilityHandler) {
      visibilityHandler = handleVisibilityChange;
      document.addEventListener('visibilitychange', visibilityHandler);
    }
  }

  function stopAutoRefresh() {
    console.log('Stopping auto-refresh');
    // Clear interval if it exists
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    
    // Remove visibility listener if it exists
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  }

  // Debounce function for search input
  function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
  }

  // Wait for DOM to be fully ready before setting up event handlers
  setTimeout(() => {
    // Initialize UI elements
    const searchInput = document.getElementById('lynkk-question-search');
    const filterSelect = document.getElementById('lynkk-question-filter');
    const sortSelect = document.getElementById('lynkk-question-sort');
    const autoRefreshToggle = document.getElementById('lynkk-auto-refresh');
    const manualRefresh = document.getElementById('lynkk-manual-refresh');
    const toggleBackground = document.getElementById('lynkk-toggle-background');
    const toggleCircle = document.getElementById('lynkk-toggle-circle');

    // Restore saved preference for auto-refresh
    if (autoRefreshToggle) {
      const savedAutoRefresh = localStorage.getItem(`autoRefresh_${sessionId}`);
      
      if (savedAutoRefresh !== null) {
        // Convert string to boolean
        autoRefreshToggle.checked = savedAutoRefresh === 'true';
        
        // Update toggle UI to match preference
        if (toggleBackground && toggleCircle) {
          if (autoRefreshToggle.checked) {
            toggleBackground.style.backgroundColor = '#3b82f6';
            toggleCircle.style.left = '18px';
          } else {
            toggleBackground.style.backgroundColor = '#d1d5db';
            toggleCircle.style.left = '2px';
          }
        }
      }
      
      // Initialize auto-refresh based on toggle state
      if (autoRefreshToggle.checked) {
        startAutoRefresh();
      }
      
      // Set up toggle change event
      autoRefreshToggle.addEventListener('change', () => {
        console.log('Auto-refresh toggle changed:', autoRefreshToggle.checked);
        
        // Save preference
        localStorage.setItem(`autoRefresh_${sessionId}`, autoRefreshToggle.checked);
        
        // Update UI and start/stop refresh
        if (autoRefreshToggle.checked) {
          if (toggleBackground) toggleBackground.style.backgroundColor = '#3b82f6';
          if (toggleCircle) toggleCircle.style.left = '18px';
          startAutoRefresh();
        } else {
          if (toggleBackground) toggleBackground.style.backgroundColor = '#d1d5db';
          if (toggleCircle) toggleCircle.style.left = '2px';
          stopAutoRefresh();
        }
      });
    }

    // Set up filter change event
    if (filterSelect) {
      filterSelect.addEventListener('change', () => {
        const filterBtn = document.getElementById('lynkk-filter-btn');
        if (filterBtn) {
          const selectedOption = filterSelect.options[filterSelect.selectedIndex].text;
          filterBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          `;
        }
        
        refreshQuestions();
      });
    }
    
    // Set up sort change event
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        const sortBtn = document.getElementById('lynkk-sort-btn');
        if (sortBtn) {
          const selectedOption = sortSelect.options[sortSelect.selectedIndex].text;
          sortBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 5h10"></path>
              <path d="M11 9h7"></path>
              <path d="M11 13h4"></path>
              <path d="M3 17h18"></path>
              <path d="M3 12V5l4 7V5"></path>
            </svg>
          `;
        }
        
        refreshQuestions();
      });
    }
    
    // Set up search input event with debounce
    if (searchInput) {
      searchInput.addEventListener('input', debounce(() => {
        refreshQuestions();
      }));
    }
    
    // Set up manual refresh button
    if (manualRefresh) {
      manualRefresh.addEventListener('click', () => {
        const icon = manualRefresh.querySelector('svg');
        if (icon) {
          // Add rotation animation
          icon.style.animation = 'spin 1s linear';
          
          // Remove animation after it completes
          setTimeout(() => {
            icon.style.animation = '';
          }, 1000);
        }
        
        refreshQuestions();
      });
    }

    // Initial fetch of questions
    refreshQuestions();
  }, 0);

  // Set up cleanup when tab changes or component unmounts
  container.dataset.cleanupFn = () => {
    stopAutoRefresh();
  };
// Add a more robust cleanup mechanism
const originalRemove = Element.prototype.remove;
if (container && !container._cleanupOverridden) {
  container._cleanupOverridden = true;
  Element.prototype.remove = function() {
    if (this === container) {
      console.log('Question dashboard being removed, cleaning up resources');
      stopAutoRefresh();
    }
    originalRemove.call(this);
  };
}

// Handle tab switching
document.addEventListener('visibilitychange', handleVisibilityChange);

// Return cleanup function
return () => {
  console.log('Running dashboard cleanup function');
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  stopAutoRefresh();
  if (container._cleanupOverridden) {
    Element.prototype.remove = originalRemove;
    container._cleanupOverridden = false;
  }
};


  // Return cleanup function for component unmounting
  return () => {
    stopAutoRefresh();
  };
}

// Function to fetch questions for the current session
function fetchAndDisplayQuestions(sessionId, authToken, sortBy = 'latest', options = {}) {
  const filter = options.filter || 'all';
  const search = options.search || '';
  
  // Get the questions list container
  const questionsList = document.getElementById('lynkk-questions-list');
  if (!questionsList) return;
  
  // Show loading state if not already loading
  if (!questionsList.classList.contains('loading')) {
    questionsList.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: #4B5563;">
        <div style="width: 40px; height: 40px; border: 3px solid #EEF2FF; border-top-color: #6366F1; border-radius: 50%; animation: lynkk-spin 0.8s linear infinite; margin-bottom: 16px;"></div>
        <p style="margin: 0; font-size: 16px; font-weight: 500;">Loading questions...</p>
      </div>
    `;
    questionsList.classList.add('loading');
  }
  
  // Build the URL with query parameters
  let url = `http://localhost:3000/api/sessions/${sessionId}/questions`;
  const queryParams = [];
  
  // Add filter parameters
  if (filter !== 'all') {
    if (filter === 'resolved') {
      queryParams.push('resolved=true');
    } else if (filter === 'unresolved') {
      queryParams.push('resolved=false');
    } else if (filter === 'anonymous') {
      queryParams.push('type=anonymous');
    } else if (filter === 'priority') {
      queryParams.push('minRelevance=0.8');
    }
  }
  
  // Add sort parameter
  if (sortBy) {
    queryParams.push(`sortBy=${sortBy}`);
  }
  
  // Add search parameter if present
  if (search.trim()) {
    queryParams.push(`search=${encodeURIComponent(search.trim())}`);
  }
  
  if (queryParams.length > 0) {
    url += '?' + queryParams.join('&');
  }
  
  console.log("Fetching questions from:", url);
  
  // Make the API request with error handling
  try {
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: url,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    }, (response) => {
      // Always remove the loading state
      questionsList.classList.remove('loading');
      
      if (!response || !response.ok) {
        handleErrorResponse(questionsList, response, sessionId, authToken, sortBy, options);
        return;
      }
      
      // Extract questions with better error handling
      const questions = extractQuestionsFromResponse(response);
      console.log(`Received ${questions.length} questions for session ${sessionId}`);
      
      // Update statistics
      updateQuestionStats(questions);
      
      // Handle empty results
      if (questions.length === 0) {
        renderEmptyState(questionsList, search, filter);
        return;
      }
      
      // Sort and render questions
      renderQuestionsList(questionsList, questions, sortBy, sessionId, authToken);
    });
  } catch (error) {
    // Handle any unexpected errors
    console.error("Unexpected error:", error);
    questionsList.classList.remove('loading');
    renderErrorState(questionsList, "An unexpected error occurred", sessionId, authToken, sortBy, options);
  }
}

// Helper function to safely extract questions from response
function extractQuestionsFromResponse(response) {
  try {
    console.log("Raw response structure:", JSON.stringify(response).substring(0, 200) + "...");
    
    if (!response) {
      console.warn("Empty response received");
      return [];
    }
    
    // Check for errors
    if (response.error) {
      console.error("Error in response:", response.error);
      return [];
    }
    
    let data = response.data;
    
    // Try to find any meaningful data
    if (!data && response.ok && response.result) {
      data = response.result;
    }
    
    if (!data) {
      console.warn("No data found in response");
      return [];
    }
    
    // Direct array case
    if (Array.isArray(data)) {
      console.log(`Found array with ${data.length} items directly in data`);
      return data;
    }
    
    // Array in data.data property
    if (data.data && Array.isArray(data.data)) {
      console.log(`Found array with ${data.data.length} items in data.data`);
      return data.data;
    }
    
    // Try common property names for arrays
    const possibleProps = ['questions', 'items', 'results', 'entities'];
    for (const prop of possibleProps) {
      if (data[prop] && Array.isArray(data[prop])) {
        console.log(`Found array with ${data[prop].length} items in data.${prop}`);
        return data[prop];
      }
    }
    
    // Last resort: find any array property
    for (const key in data) {
      if (Array.isArray(data[key])) {
        console.log(`Found array with ${data[key].length} items in data.${key}`);
        return data[key];
      }
    }
    
    console.warn("Could not find any array in response:", data);
    return [];
  } catch (err) {
    console.error("Error extracting questions:", err);
    return [];
  }
}

// Helper function to render empty state
function renderEmptyState(container, search, filter) {
  container.innerHTML = `
    <div style="background-color: white; border-radius: 12px; padding: 40px 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 20px;">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M8 15h8"></path>
        <path d="M9 9h.01"></path>
        <path d="M15 9h.01"></path>
      </svg>
      <h3 style="margin: 0 0 8px; font-size: 18px; font-weight: 600; color: #374151;">
        ${search ? 'No matching questions found' : 'No questions have been asked yet'}
      </h3>
      ${filter !== 'all' ? '<p style="margin: 0; font-size: 14px; color: #6b7280;">Try changing your filter settings or check back later.</p>' : 
      '<p style="margin: 0; font-size: 14px; color: #6b7280;">Questions will appear here once students start asking them.</p>'}
    </div>
  `;
}
// Helper function to handle error responses
function handleErrorResponse(container, response, sessionId, authToken, sortBy, options) {
  console.error("Error fetching questions:", response);
  
  const errorMessage = response?.data?.error || response?.error || "Unknown error";
  
  renderErrorState(container, errorMessage, sessionId, authToken, sortBy, options);
}

// Helper function to render error state
function renderErrorState(container, errorMessage, sessionId, authToken, sortBy, options) {
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; color: #EF4444;">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <p style="margin: 0 0 12px; font-size: 18px; font-weight: 600;">Error loading questions</p>
      <p style="margin: 0 0 20px; font-size: 14px; color: #B91C1C; text-align: center; max-width: 400px;">${errorMessage}</p>
      <button 
        id="lynkk-retry-questions-btn" 
        style="padding: 10px 20px; background-color: #FEF2F2; color: #B91C1C; border: 1px solid #FCA5A5; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; font-size: 14px;"
      >
        Try Again
      </button>
    </div>
  `;
  
  // Add retry button listener
  const retryBtn = document.getElementById('lynkk-retry-questions-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      fetchAndDisplayQuestions(sessionId, authToken, sortBy, options);
    });
    
    // Add hover effects
    retryBtn.addEventListener('mouseenter', () => {
      retryBtn.style.backgroundColor = '#FEE2E2';
      retryBtn.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
    });
    
    retryBtn.addEventListener('mouseleave', () => {
      retryBtn.style.backgroundColor = '#FEF2F2';
      retryBtn.style.boxShadow = 'none';
    });
  }
}

// Helper function to render questions list
function renderQuestionsList(container, questions, sortBy, sessionId, authToken) {
  // Sort questions client-side
  const sortedQuestions = [...questions].sort((a, b) => {
    if (sortBy === 'priority') {
      return (b.relevance_score || 0) - (a.relevance_score || 0);
    } else if (sortBy === 'resolved') {
      return (a.resolved === b.resolved) ? 0 : a.resolved ? 1 : -1;
    } else {
      // Default: sort by latest
      return new Date(b.created_at) - new Date(a.created_at);
    }
  });
  
  // Build HTML for all questions first
  const html = sortedQuestions.map(question => {
    return createQuestionItemHTML(question);
  }).join('');
  
  container.innerHTML = html;
  
  // Now attach event listeners
  attachQuestionItemEventListeners(container, sessionId, authToken);
}
function createQuestionItemHTML(question) {
  // Safely escape and prepare content
  const content = escapeHTML(question.content || '');
  
  // Format time only (no date)
  const createdAt = new Date(question.created_at);
  const formattedTime = createdAt.toLocaleTimeString(undefined, { 
      hour: 'numeric', 
      minute: '2-digit'
  });
  
  // Define status variables
  const isResolved = question.resolved;
  const isAnonymous = question.type === 'anonymous';
  
  // Get user initial for the circle
  const userName = isAnonymous ? 
      (question.anonymous_name || 'Anonymous') : 
      (question.display_name || 'User');
  const userInitial = userName.charAt(0).toUpperCase();
  
  // Loading state check
  const isLoading = !question.id;
  if (isLoading) {
      return `
          <div class="lynkk-question-item loading" style="position: relative; margin-bottom: 16px; background-color: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 20px; display: flex; align-items: center; gap: 12px;">
              <span style="color: #f59e0b;">⏳</span>
              <span style="font-size: 16px; font-weight: 600; color: #334155;">Hang tight! We're loading...</span>
          </div>
      `;
  }
  
    return `
       <div 
      data-question-id="${question.id}"
      data-resolved="${isResolved}"
      class="lynkk-question-item"  
      style="position: relative; margin-bottom: 16px; background-color: #e6f2ff; border-radius: 16px; 
             box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 20px; display: flex; flex-direction: column; 
             gap: 16px; width: calc(100% - 2px); max-width: 100%; margin-right: 5px; box-sizing: border-box;"
  >
          <!-- Top row with question and status dot -->
          <div style="display: flex; align-items: flex-start; gap: 16px;">
              <!-- Status dot with user initial -->
              <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #4f46e5; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px; flex-shrink: 0;">
                  ${userInitial}
              </div>
              
              <!-- Question content -->
              <h3 style="font-size: 17px; font-weight: 600; color: #1e293b; margin: 0; line-height: 1.4;">
                  "${content}"
              </h3>
          </div>
          
          <!-- Bottom row -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
              <!-- Left side: User info -->
              <div style="display: flex; align-items: center; gap: 24px;">
                  <!-- User identity with lock icon for anonymous -->
                  <div style="display: flex; align-items: center; gap: 8px;">
                      ${isAnonymous ? 
                          `<span style="display: flex; align-items: center; gap: 4px; color: #6b7280; font-size: 14px;">
                              <span style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;">🔒</span>
                              <span style="color: #6b7280;">${escapeHTML(question.anonymous_name || 'Anonymous')}</span>
                          </span>` : 
                          `<span style="color: #6b7280; font-size: 14px;">
                              ${escapeHTML(question.display_name || 'User')}
                          </span>`
                      }
                  </div>
                  
                  <!-- Time -->
                  <div style="display: flex; align-items: center; gap: 12px; color: #6b7280; font-size: 14px;">
                      <span style="display: flex; align-items: center; gap: 4px;">
                          <span style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;">🕒</span>
                          <span>${formattedTime}</span>
                      </span>
                  </div>
              </div>
              
              <!-- Middle: Voting controls -->
              <div style="display: flex; align-items: center; gap: 12px;">
                  <!-- Upvote button - FIXED: Using fixed stroke color for SVG -->
                  <button class="lynkk-upvote-btn" data-question-id="${question.id}" 
                    style="background-color: #f8fafc; border: 1px solid #e2e8f0; cursor: pointer; 
                          display: flex; align-items: center; padding: 8px; 
                          border-radius: 8px; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"
                    onmouseover="this.style.backgroundColor='#eef2ff'; this.style.borderColor='#c7d2fe';" 
                    onmouseout="this.style.backgroundColor='#f8fafc'; this.style.borderColor='#e2e8f0';">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 19V5M5 12l7-7 7 7"/>
                      </svg>
                  </button>
                  
                  <!-- Downvote button - FIXED: Using fixed stroke color for SVG -->
                  <button class="lynkk-downvote-btn" data-question-id="${question.id}" 
                    style="background-color: #f8fafc; border: 1px solid #e2e8f0; cursor: pointer; 
                          display: flex; align-items: center; padding: 8px; 
                          border-radius: 8px; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05);"
                    onmouseover="this.style.backgroundColor='#fef2f2'; this.style.borderColor='#fecaca';" 
                    onmouseout="this.style.backgroundColor='#f8fafc'; this.style.borderColor='#e2e8f0';">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M12 5v14M5 12l7 7 7-7"/>
                      </svg>
                  </button>
              </div>
              
              <!-- Right: Resolve button -->
              <div style="display: flex; align-items: center;">
                  ${isResolved ? 
                      `<span title="Question has been resolved" style="color: #10b981; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background-color: #ecfdf5; border-radius: 50%; border: 1px solid #a7f3d0; transition: all 0.2s ease;">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M20 6L9 17l-5-5"/>
                          </svg>
                      </span>` : 
                      `<button 
                          class="lynkk-resolve-btn" 
                          data-question-id="${question.id}"
                          title="Mark as resolved"
                          aria-label="Mark question as resolved" 
                          style="width: 40px; height: 40px; background-color: #4f46e5; color: white; border: none; border-radius: 50%; 
                                cursor: pointer; display: flex; align-items: center; justify-content: center;
                                transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);"
                          onmouseover="this.style.backgroundColor='#10b981'; this.style.transform='scale(1.05)';" 
                          onmouseout="this.style.backgroundColor='#4f46e5'; this.style.transform='scale(1)';"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                              <line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                      </button>`
                  }
              </div>
          </div>
      </div>
  `;
}
// Helper function to escape HTML content
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
      tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
      }[tag]));
}




// Helper function to attach event listeners to question items
function attachQuestionItemEventListeners(container, sessionId, authToken) {
  // Attach hover effects
  container.querySelectorAll('.lynkk-question-item').forEach(item => {
    const isResolved = item.getAttribute('data-resolved') === 'true';
    
    item.addEventListener('mouseenter', function() {
      this.style.backgroundColor = isResolved ? '#F9FAFB' : '#FAFAFA';
    });
    
    item.addEventListener('mouseleave', function() {
      this.style.backgroundColor = isResolved ? '#F9FAFB' : '#FFFFFF';
    });
  });
  
  // Attach button event listeners
  container.querySelectorAll('.lynkk-resolve-btn').forEach(button => {
    button.addEventListener('click', function() {
      const questionId = this.getAttribute('data-question-id');
      const isResolved = this.getAttribute('data-resolved') === 'true';
      resolveQuestion(sessionId, questionId, !isResolved, authToken);
    });
    
    // Add hover effects
    button.addEventListener('mouseenter', function() {
      const isResolved = this.getAttribute('data-resolved') === 'true';
      this.style.backgroundColor = isResolved ? '#F3F4F6' : '#D1FAE5';
      this.style.borderColor = isResolved ? '#D1D5DB' : '#6EE7B7';
    });
    
    button.addEventListener('mouseleave', function() {
      const isResolved = this.getAttribute('data-resolved') === 'true';
      this.style.backgroundColor = isResolved ? '#F9FAFB' : '#ECFDF5';
      this.style.borderColor = isResolved ? '#E5E7EB' : '#D1FAE5';
    });
  });
  
  // Attach show more/less functionality with better event delegation
  container.querySelectorAll('.lynkk-question-text.truncated').forEach(questionText => {
    questionText.addEventListener('click', function(e) {
      if (e.target.classList.contains('lynkk-show-more') || 
          e.target.classList.contains('lynkk-question-display') ||
          e.target.classList.contains('lynkk-show-less') ||
          e.target.classList.contains('lynkk-question-text')) {
        
        const fullContent = this.querySelector('.lynkk-full-content');
        const showMoreSpan = this.querySelector('.lynkk-show-more');
        
        if (fullContent && showMoreSpan) {
          if (fullContent.style.display === 'none' || !fullContent.style.display) {
            // Show full content
            fullContent.style.display = 'block';
            this.querySelector('.lynkk-question-display').style.display = 'none';
            showMoreSpan.textContent = 'Show less';
            showMoreSpan.classList.remove('lynkk-show-more');
            showMoreSpan.classList.add('lynkk-show-less');
          } else {
            // Hide full content
            fullContent.style.display = 'none';
            this.querySelector('.lynkk-question-display').style.display = 'inline';
            showMoreSpan.textContent = 'Show more';
            showMoreSpan.classList.remove('lynkk-show-less');
            showMoreSpan.classList.add('lynkk-show-more');
          }
        }
      }
    });
  });
}

// Function to update question statistics in the UI
function updateQuestionStats(questions) {
  // Calculate statistics
  const totalQuestions = questions.length;
  const anonymousCount = questions.filter(q => q.type === 'anonymous').length;
  const resolvedCount = questions.filter(q => q.resolved).length;
  const pendingCount = totalQuestions - resolvedCount;
  
  // Update counters with animation
  animateCounter('lynkk-question-count', `${totalQuestions} question${totalQuestions !== 1 ? 's' : ''}`);
  animateCounter('lynkk-total-questions', totalQuestions);
  animateCounter('lynkk-anon-questions', anonymousCount);
  animateCounter('lynkk-resolved-questions', resolvedCount);
  animateCounter('lynkk-pending-questions', pendingCount);
}

// Function to animate counter updates
function animateCounter(elementId, newValue) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  if (typeof newValue === 'number') {
    // For numeric counters, animate the count up/down
    const currentValue = parseInt(element.textContent) || 0;
    const diff = newValue - currentValue;
    
    if (diff === 0) return; // No change needed
    
    // Simple animation for number counting
    let startTime;
    const duration = 800; // milliseconds
    
    function updateCounter(timestamp) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smoother animation
      const easeOutQuad = progress * (2 - progress);
      const currentCount = Math.round(currentValue + diff * easeOutQuad);
      
      element.textContent = currentCount;
      
      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      } else {
        element.textContent = currentValue + diff; // Ensure we end at the exact target
      }
    }
    
    requestAnimationFrame(updateCounter);
  } else {
    // For text content, just update directly
    element.textContent = newValue;
  }
}

function resolveQuestion(sessionId, questionId, resolved, authToken) {
  const button = document.querySelector(`.lynkk-resolve-btn[data-question-id="${questionId}"]`);
  if (button) {
    // Store original content and styles
    const originalContent = button.innerHTML;
    const originalBg = button.style.backgroundColor;
    const originalBorder = button.style.borderColor;
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: lynkk-spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      <span>${resolved ? 'Resolving...' : 'Reopening...'}</span>
    `;
    button.disabled = true;
    button.style.opacity = '0.7';
    button.style.cursor = 'wait';
    
    // Make the API request
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: `http://localhost:3000/api/sessions/${sessionId}/questions/${questionId}/resolve`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: { resolved }
    }, (response) => {
      // Restore button state
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      
      if (!response || !response.ok) {
        // Show error and restore original button
        button.innerHTML = originalContent;
        showToast(`Failed to ${resolved ? 'resolve' : 'reopen'} question: ${response?.error || 'Unknown error'}`, 'error');
        return;
      }
      
      // Get current filter/sort settings
      const currentSort = document.getElementById('lynkk-question-sort')?.value || 'latest';
      const currentSearch = document.getElementById('lynkk-question-search')?.value || '';
      const currentFilter = document.getElementById('lynkk-question-filter')?.value || 'all';
      
      // Show success toast
      showToast(resolved ? 'Question resolved successfully' : 'Question reopened successfully', 'success');
      
      // Refresh the questions list
      fetchAndDisplayQuestions(sessionId, authToken, currentSort, {
        search: currentSearch,
        filter: currentFilter
      });
    });
  }
}

// Improved toast notification function
function showToast({ message, type = 'info', duration = 3000 }) {
  // Remove any existing toasts
  const existingToast = document.querySelector('.lynkk-toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  // Create toast container
  const toastContainer = document.createElement('div');
  toastContainer.className = 'lynkk-toast';
  
  // Set styles based on type
  let backgroundColor, textColor, icon, borderColor;
  
  switch (type) {
    case 'success':
      backgroundColor = '#ECFDF5';
      borderColor = '#A7F3D0';
      textColor = '#065F46';
      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      break;
    case 'error':
      backgroundColor = '#FEF2F2';
      borderColor = '#FCA5A5';
      textColor = '#B91C1C';
      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      break;
    default:
      backgroundColor = '#EFF6FF';
      borderColor = '#BFDBFE';
      textColor = '#1E40AF';
      icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
      break;
  }
  
  // Apply styles to toast
  Object.assign(toastContainer.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%) translateY(20px)',
    backgroundColor: backgroundColor,
    borderLeft: `4px solid ${borderColor}`,
    color: textColor,
    padding: '12px 20px',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    zIndex: '9999',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    minWidth: '320px',
    maxWidth: '400px',
    opacity: '0',
    transition: 'all 0.3s ease'
  });
  
  // Set innerHTML with icon
  toastContainer.innerHTML = `${icon} ${message}`;
  
  // Add to document
  document.body.appendChild(toastContainer);
  
  // Animate in
  setTimeout(() => {
    toastContainer.style.opacity = '1';
    toastContainer.style.transform = 'translateX(-50%) translateY(0)';
  }, 10);
  
  // Set timeout to remove
  setTimeout(() => {
    toastContainer.style.opacity = '0';
    toastContainer.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toastContainer.remove(), 300);
  }, duration);
}
 
//--=================== prof ques & UI FUNCTIONS after anony====================

 // Add this function to properly render anonymous components
// At line ~3675
// In the renderAnonymousComponents function (around line 3720)
function renderAnonymousComponents() {
  console.log('Rendering anonymous components');

  // Get active session information with debug details
  chrome.storage.local.get(['activeSession', 'authState'], (result) => {
    console.log('Active session data:', result.activeSession);
    console.log('Auth state:', result.authState?.token ? 'Token exists' : 'No token');
    
    if (!result.activeSession || !result.authState) {
      console.error('No active session or auth state found');
      const container = document.getElementById('lynkk-anonymous-content');
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 24px; color: #64748b;">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p style="margin: 0; font-size: 15px;">No active session</p>
            <p style="margin: 8px 0 0; font-size: 13px;">Join or create a session to ask questions</p>
          </div>
        `;
      }
      return;
    }

    // FIX 1: Extract sessionId properly from multiple possible structures
    let sessionId;
    if (result.activeSession.data && result.activeSession.data.id) {
      sessionId = result.activeSession.data.id;
      console.log('Found session ID in activeSession.data.id:', sessionId);
    } else if (result.activeSession.id) {
      sessionId = result.activeSession.id;
      console.log('Found session ID in activeSession.id:', sessionId);
    } else if (result.activeSession.ok && result.activeSession.data && result.activeSession.data.id) {
      sessionId = result.activeSession.data.id;
      console.log('Found session ID in activeSession.ok.data.id:', sessionId);
    } else {
      console.error('Could not extract session ID from:', result.activeSession);
      
      // Show an error message to the user
      const container = document.getElementById('lynkk-anonymous-content');
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 24px; color: #64748b;">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p style="margin: 0; font-size: 15px; color: #ef4444;">Session ID Error</p>
            <p style="margin: 8px 0 0; font-size: 13px;">Please rejoin or reload the session</p>
            <button id="lynkk-reload-session" style="margin-top: 12px; background-color: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 13px;">
              Reload Session
            </button>
          </div>
        `;
        
        // Add button listener
        const reloadButton = document.getElementById('lynkk-reload-session');
        if (reloadButton) {
          reloadButton.addEventListener('click', () => {
            // Attempt to reload session data
            chrome.runtime.sendMessage({type: 'CHECK_AUTH'});
            setTimeout(renderAnonymousComponents, 500);
          });
        }
      }
      return;
    }

    const authToken = result.authState.token;

    console.log(`Session ID: ${sessionId}, Auth token exists: ${!!authToken}`);

    // Now proceed with the rest of the function
    if (result.authState.user && result.authState.user.role === 'professor') {
      // Render professor question dashboard
      const container = document.getElementById('lynkk-prof-questions-container');
      if (container) {
        renderProfessorQuestionDashboard(container, sessionId, authToken);
      } else {
        console.error('Professor questions container not found');
      }
    } else {
      // For students, initialize the anonymous question dashboard
      initializeAnonymousQuestionDashboard(sessionId, authToken);
    }
  });

    // Fix anonymous tab switching in renderAnonymousComponents
  
  // Add this to the end of renderAnonymousComponents function:
  document.addEventListener('DOMContentLoaded', () => {
    // Add tab switching for anonymous questions dashboard
    const tabs = document.querySelectorAll('.anon-tab');
    
    if (tabs.length > 0) {
      console.log('Adding event listeners to anonymous tabs');
      tabs.forEach(tab => {
        tab.addEventListener('click', function() {
          // Get the tab name
          const tabName = this.getAttribute('data-tab');
          console.log(`Clicked tab: ${tabName}`);
          
          // Remove active class from all tabs
          tabs.forEach(t => t.classList.remove('active'));
          
          // Add active class to clicked tab
          this.classList.add('active');
          
          // Hide all tab content
          document.querySelectorAll('.anon-tab-content').forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
          });
          
          // Show the selected tab content
          const tabContent = document.getElementById(`tab-${tabName}`);
          if (tabContent) {
            tabContent.classList.add('active');
            tabContent.style.display = 'block';
            
            // Special handling for class questions tab
            if (tabName === 'class-questions') {
              // Force a refresh of class questions when tab is shown
              chrome.storage.local.get(['activeSession', 'authState'], (result) => {
                if (result.activeSession && result.authState) {
                  const sessionId = result.activeSession.id || result.activeSession.data?.id;
                  const authToken = result.authState.token;
                  
                  if (sessionId && authToken) {
                    loadClassQuestionsForSession(sessionId, authToken);
                  }
                }
              });
            }
          }
        });
      });
      
      // Trigger a click on the class questions tab to show questions
      const classQuestionsTab = document.querySelector('.anon-tab[data-tab="class-questions"]');
      if (classQuestionsTab) {
        classQuestionsTab.click();
      }
    }
  });

  // Cleanup handlers for voice capture
  window.addEventListener('beforeunload', () => {
    console.log('Page unloading - stopping voice capture');
    if (isVoiceCapturing) {
      stopVoiceCapture();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isVoiceCapturing) {
      console.log('Page hidden - stopping voice capture');
      stopVoiceCapture();
    }
  });
}


// Fix missing questions display by properly connecting the tab system
// Update showTab function to include this logic
function showTab(tabName) {
  // Log tab change
  console.log(`Switching to tab: ${tabName}`);
  
  // First hide all tabs
  document.querySelectorAll('.lynkk-content').forEach(content => {
    content.classList.remove('active');
    content.style.display = 'none';
  });
  
  // Remove active class from tab buttons
  document.querySelectorAll('.lynkk-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Get the content for the selected tab
  const contentElement = document.getElementById(`lynkk-${tabName}-content`);
  if (contentElement) {
    contentElement.classList.add('active');
    contentElement.style.display = 'flex';
    
    // IMPORTANT: If we're showing the anonymous tab, ensure it's properly initialized
    if (tabName === 'anonymous' && !document.querySelector('.anon-tab')) {
      renderAnonymousComponents();
    }
  }
  
  // Add active class to the selected tab button
  const tabElement = document.getElementById(`lynkk-${tabName}-tab`);
  if (tabElement) {
    tabElement.classList.add('active');
  }
  
  // Handle input containers
  const inputContainers = [
    'lynkk-ai-input-container',
    'lynkk-chat-input-container',
    'lynkk-anonymous-input-container',
    'lynkk-polls-input-container'
  ];

  inputContainers.forEach(containerId => {
    const container = document.getElementById(containerId);
    if (container) {
      container.style.display = 'none';
    }
  });
  
  // Show the input container for the selected tab
  const inputContainer = document.getElementById(`lynkk-${tabName}-input-container`);
  if (inputContainer) {
    inputContainer.style.display = 'block';
  }
  
  // Save the active tab preference
  chrome.storage.local.set({ activeTab: tabName });
}
// Add this debugging function to check dashboard state


// Add keyboard shortcut to trigger debugging
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    chrome.storage.local.get(['activeSession', 'authState'], (result) => {
      if (result.activeSession?.id) {
        debugAnonymousQuestions(result.activeSession.id);
      } else {
        console.log('No active session found for debugging');
      }
    });
  }
});


// Add this to your event listeners to trigger debugging
document.addEventListener('keydown', (e) => {
  // Press Alt+Shift+D to debug anonymous dashboard
  if (e.altKey && e.shiftKey && e.key === 'D') {
    debugAnonymousDashboard();
  }
});

function getAnonymousNameDisplay(sessionId) {
  // Try from localStorage first
  const cachedName = localStorage.getItem(`anonymousName_${sessionId}`);
  if (cachedName) {
    return cachedName;
  }
  
  // If not in cache, show placeholder and fetch from server
  fetchAnonymousIdentity(sessionId, authToken).then(name => {
    if (name) {
      localStorage.setItem(`anonymousName_${sessionId}`, name);
      // Update UI with the name
      document.querySelectorAll('.anonymous-name-display').forEach(el => {
        el.textContent = name;
      });
    }
  });
  
  return "Loading...";
}



// Update fetchAnonymousIdentity function to properly handle and display identity
function fetchAnonymousIdentity(sessionId, authToken) {
  return new Promise((resolve, reject) => {
    console.log(`Fetching anonymous identity for session ${sessionId}...`);
    
    // Update UI loading state
    const anonymousNameElement = document.getElementById('lynkk-anonymous-name');
    if (anonymousNameElement) {
      anonymousNameElement.innerHTML = `<span class="loading-text">Loading...</span>`;
    }
    
    // First check for cached identity
    if (window.cachedAnonymousIdentities && window.cachedAnonymousIdentities[sessionId]) {
      const cachedName = window.cachedAnonymousIdentities[sessionId];
      console.log(`Using cached anonymous identity: ${cachedName}`);
      
      // Update UI with cached name
      if (anonymousNameElement) {
        anonymousNameElement.textContent = cachedName;
      }
      
      // Return cached identity but also fetch fresh in background
      const cachedResult = {
        anonymous_name: cachedName,
        source: 'cache'
      };
      resolve(cachedResult);
      
      // Still try to refresh in the background without blocking
      refreshAnonymousIdentityInBackground(sessionId, authToken, cachedName);
      return;
    }
    
    // If no cached identity, check storage
    chrome.storage.local.get([`anonymousIdentity_${sessionId}`], (result) => {
      const storedName = result[`anonymousIdentity_${sessionId}`];
      
      if (storedName) {
        console.log(`Using stored anonymous identity: ${storedName}`);
        
        // Update UI with stored name
        if (anonymousNameElement) {
          anonymousNameElement.textContent = storedName;
        }
        
        // Cache in memory
        if (typeof window.cachedAnonymousIdentities === 'undefined') {
          window.cachedAnonymousIdentities = {};
        }
        window.cachedAnonymousIdentities[sessionId] = storedName;
        
        // Return stored identity but also fetch fresh in background
        const storedResult = {
          anonymous_name: storedName,
          source: 'storage'
        };
        resolve(storedResult);
        
        // Still try to refresh in the background without blocking
        refreshAnonymousIdentityInBackground(sessionId, authToken, storedName);
        return;
      }
      
      // No cached or stored identity, fetch from server
      makeIdentityApiRequest(sessionId, authToken, resolve, reject);
    });
  });
}

// Helper function to refresh identity in background
function refreshAnonymousIdentityInBackground(sessionId, authToken, currentName) {
  console.log(`Refreshing anonymous identity in background for session ${sessionId}...`);
  
  // Make API request without blocking the main flow
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `http://localhost:3000/api/anonymous/${sessionId}/identity`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  }, (response) => {
    try {
      if (!response || !response.ok) {
        console.log("Background refresh failed, keeping current identity");
        return;
      }
      
      // Extract the name from response
      let anonymousName = null;
      
      if (response.data && response.data.data && response.data.data.anonymous_name) {
        anonymousName = response.data.data.anonymous_name;
      } else if (response.data && response.data.anonymous_name) {
        anonymousName = response.data.anonymous_name;
      }
      
      if (!anonymousName) {
        console.log("Invalid response format in background refresh");
        return;
      }
      
      // If identity changed, update cache and UI
      if (anonymousName !== currentName) {
        console.log(`Identity updated in background from ${currentName} to ${anonymousName}`);
        
        // Update memory cache
        if (typeof window.cachedAnonymousIdentities === 'undefined') {
          window.cachedAnonymousIdentities = {};
        }
        window.cachedAnonymousIdentities[sessionId] = anonymousName;
        
        // Update storage
        chrome.storage.local.set({ [`anonymousIdentity_${sessionId}`]: anonymousName });
        
        // Update UI if needed
        const nameElements = document.querySelectorAll('.lynkk-anonymous-name');
        nameElements.forEach(el => {
          el.textContent = anonymousName;
        });
      } else {
        console.log("Background refresh confirmed current identity is up-to-date");
      }
    } catch (error) {
      console.warn("Error in background identity refresh:", error);
    }
  });
}

// Helper function to make the actual API request
function makeIdentityApiRequest(sessionId, authToken, resolve, reject) {
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `http://localhost:3000/api/anonymous/${sessionId}/identity`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  }, (response) => {
    console.log("Identity API response:", response);
    
    try {
      if (!response || !response.ok) {
        console.error("Error fetching identity:", response?.error || 'Unknown error');
        throw new Error("Failed to fetch anonymous identity");
      }
      
      // Extract identity from response
      let anonymousName = null;
      
      if (response.data && response.data.data && response.data.data.anonymous_name) {
        anonymousName = response.data.data.anonymous_name;
      } else if (response.data && response.data.anonymous_name) {
        anonymousName = response.data.anonymous_name;
      }
      
      if (!anonymousName) {
        console.error("Anonymous name not found in response:", response);
        throw new Error("Anonymous name not found in response");
      }
      
      console.log(`Successfully retrieved anonymous identity: ${anonymousName}`);
      
      // Update UI
      const anonymousNameElement = document.getElementById('lynkk-anonymous-name');
      if (anonymousNameElement) {
        anonymousNameElement.textContent = anonymousName;
      }
      
      // Update all other name elements
      document.querySelectorAll('.lynkk-anonymous-name').forEach(el => {
        el.textContent = anonymousName;
      });
      
      // Cache in memory
      if (typeof window.cachedAnonymousIdentities === 'undefined') {
        window.cachedAnonymousIdentities = {};
      }
      window.cachedAnonymousIdentities[sessionId] = anonymousName;
      
      // Store in local storage
      chrome.storage.local.set({ [`anonymousIdentity_${sessionId}`]: anonymousName });
      
      // Return the identity
      resolve({
        anonymous_name: anonymousName,
        source: 'server'
      });
    } catch (error) {
      console.error("Error processing identity response:", error);
      reject(error);
    }
  });
}


function synchronizeAnonymousIdentity(sessionId, authToken) {
  return new Promise((resolve, reject) => {
    console.log(`Synchronizing anonymous identity for session ${sessionId}`);
    
    // Use cache if available (for immediate response)
    if (window.cachedAnonymousIdentities && window.cachedAnonymousIdentities[sessionId]) {
      const cachedName = window.cachedAnonymousIdentities[sessionId];
      console.log(`Using cached anonymous identity: ${cachedName}`);
      
      // Immediately resolve with cached data
      resolve({
        anonymous_name: cachedName,
        source: 'cache'
      });
      
      // Still try to fetch fresh in background (non-blocking)
      setTimeout(() => {
        fetchAnonymousIdentity(sessionId, authToken)
          .catch(err => console.warn("Background identity refresh failed:", err));
      }, 100);
      
      return;
    }
    
    // If no cache, try to fetch
    fetchAnonymousIdentity(sessionId, authToken)
      .then(identityData => {
        console.log(`Successfully synchronized anonymous identity: ${identityData.anonymous_name}`);
        resolve(identityData);
      })
      .catch(error => {
        console.error("Failed to synchronize identity:", error);
        
        // Try storage as fallback
        chrome.storage.local.get([`anonymousIdentity_${sessionId}`], (result) => {
          const storedName = result[`anonymousIdentity_${sessionId}`];
          
          if (storedName) {
            console.log(`Using stored anonymous identity as fallback: ${storedName}`);
            
            // Cache it in memory
            if (typeof window.cachedAnonymousIdentities === 'undefined') {
              window.cachedAnonymousIdentities = {};
            }
            window.cachedAnonymousIdentities[sessionId] = storedName;
            
            resolve({
              anonymous_name: storedName,
              source: 'storage'
            });
          } else {
            // Generate a temporary name as last resort
            const tempName = generateTemporaryName();
            console.log(`Generated temporary anonymous name: ${tempName}`);
            
            // Cache it in memory
            if (typeof window.cachedAnonymousIdentities === 'undefined') {
              window.cachedAnonymousIdentities = {};
            }
            window.cachedAnonymousIdentities[sessionId] = tempName;
            
            // Store for future use
            chrome.storage.local.set({ [`anonymousIdentity_${sessionId}`]: tempName });
            
            resolve({
              anonymous_name: tempName,
              source: 'generated',
              temporary: true
            });
          }
        });
      });
  });
}

// Helper function to generate a temporary name as last resort
function generateTemporaryName() {
  const adjectives = ['Anonymous', 'Unnamed', 'Mystery', 'Hidden', 'Secret'];
  const nouns = ['Student', 'User', 'Scholar', 'Learner', 'Participant'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1000);
  
  return `${adj}${noun}${num}`;
}

  async function submitAnonymousQuestion(sessionId, authToken, questionText) {
    const submitButton = document.querySelector('#lynkk-question-submit');
    
    try {
      // Show loading state
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="animate-pulse">Sending...</span>';
      }
      
      // First synchronize the identity to ensure consistency
      const identity = await synchronizeAnonymousIdentity(sessionId, authToken);
      console.log(`Submitting question as ${identity.anonymous_name}`);
      
      // Submit question with synchronized identity
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          url: `http://localhost:3000/api/anonymous/${sessionId}/questions`,
          method: 'POST',
          timeoutMS: 10000, // 10 second timeout
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: {
            content: questionText.trim(),
            is_anonymous: true
          }
        }, (response) => {
          if (!response || !response.ok) {
            console.error('Failed to submit question:', response);
            return reject(new Error(response?.data?.error || 'Failed to submit question'));
          }
          
          console.log('Question submitted successfully');
          
          // Update any UI elements as needed
          const questionsList = document.getElementById('lynkk-class-questions');
          if (questionsList) {
            // Trigger a refresh of questions
            loadClassQuestionsForSession(sessionId, authToken);
          }
          
          resolve(response.data);
        });
      });
    } catch (error) {
      console.error('Error submitting question:', error);
      throw error;
    } finally {
      // Restore button state
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Ask';
      }
    }
  }

  // Helper function to render the identity name with proper styling and tooltip
  function renderIdentityName(element, name, isGenerated) {
    element.style.opacity = '0';
    
    setTimeout(() => {
      element.innerHTML = `
        <span class="lynkk-identity-name" style="font-weight: 500; color: #4f46e5; cursor: default;">
          ${name}
          ${isGenerated ? `
            <span class="lynkk-identity-tooltip">
              Auto-generated identity
            </span>
          ` : ''}
        </span>
      `;
      
      element.style.animation = 'lynkk-identity-reveal 0.4s forwards';
      element.style.opacity = '1';
      
      // Add a subtle highlight animation to draw attention
      setTimeout(() => {
        element.querySelector('.lynkk-identity-name').classList.add('lynkk-identity-highlight');
        setTimeout(() => {
          element.querySelector('.lynkk-identity-name').classList.remove('lynkk-identity-highlight');
        }, 1500);
      }, 100);
    }, 150);
  }

// Add the CSS styles for the animations if they don't exist yet
if (!document.getElementById('anonymous-identity-styles')) {
  const style = document.createElement('style');
  style.id = 'anonymous-identity-styles';
  style.textContent = `
    #lynkk-anonymous-name {
      transition: opacity 0.2s ease-out;
    }
    
    .highlight-flash {
      animation: highlightFlash 1s ease-out;
    }
    
    @keyframes highlightFlash {
      0%, 100% { background-color: transparent; }
      50% { background-color: rgba(99, 102, 241, 0.1); }
    }
    
    .animate-pulse {
      animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    
    /* Tooltip styles for the generated identity */
    .group:hover .group-hover\\:block {
      display: block;
    }
    
    .text-2xs {
      font-size: 0.65rem;
      line-height: 1rem;
    }
  `;
  document.head.appendChild(style);
}



function renderStudentQuestionHistory(container, sessionId, authToken) {
  if (!container) return;
  
  console.log("Rendering student question history in container:", container.id);
  
  // Clear previous content and show loading state
  container.innerHTML = `
    <div class="lynkk-loading-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px;">
      <div class="lynkk-loading-spinner" style="width: 18px; height: 18px; border: 2px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: lynkk-spin 0.8s linear infinite;"></div>
      <p style="margin: 8px 0 0 0; font-size: 11px; color: #6b7280;">Loading your questions...</p>
    </div>
  `;
  
  // This function uses a different endpoint - critical fix from your original code
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `http://localhost:3000/api/anonymous/${sessionId}/questions`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  }, (response) => {
    console.log("Student history response:", response);
  
    try {
      if (!response || !response.ok) {
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; color: #6b7280;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p style="margin: 8px 0 0 0; font-size: 12px;">Could not load your questions</p>
            <button id="lynkk-retry-history" style="margin-top: 8px; font-size: 11px; background-color: #f3f4f6; color: #4b5563; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
              Retry
            </button>
          </div>
        `;
        
        // Add retry functionality
        const retryButton = document.getElementById('lynkk-retry-history');
        if (retryButton) {
          retryButton.addEventListener('click', () => {
            renderStudentQuestionHistory(container, sessionId, authToken);
          });
        }
        return;
      }
  
      // CRITICAL FIX: Safely extract the questions array with multiple fallbacks
      let questions = [];
      
      if (response.data) {
        if (Array.isArray(response.data)) {
          questions = response.data;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          questions = response.data.data;
        } else if (response.data.questions && Array.isArray(response.data.questions)) {
          questions = response.data.questions;
        } else if (response.data.messages && Array.isArray(response.data.messages)) {
          questions = response.data.messages;
        } else if (typeof response.data === 'object') {
          // Try to find any array in the response
          const possibleArrays = Object.values(response.data).filter(val => Array.isArray(val));
          if (possibleArrays.length > 0) {
            questions = possibleArrays[0];
          }
        }
      }
  
      // CRITICAL FIX: Log and ensure questions is an array
      console.log(`Extracted ${questions?.length || 0} questions for history`);
      if (!Array.isArray(questions)) {
        console.warn("Questions is not an array, using empty array instead");
        questions = [];
      }
      
      if (questions.length === 0) {
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; color: #6b7280; height: 100%;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              <line x1="9" y1="10" x2="15" y2="10"></line>
              <line x1="12" y1="7" x2="12" y2="13"></line>
            </svg>
            <p style="margin: 8px 0 0 0; font-size: 12px;">You haven't asked any questions yet</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #9ca3af;">
              Your questions will appear here after you submit them
            </p>
          </div>
        `;
        return;
      }
      
      // Sort questions by date (newest first)
      const sortedQuestions = [...questions].sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
        const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
        return dateB - dateA;
      });
      
      // Generate HTML for the questions
      let html = '';
      
      sortedQuestions.forEach((question, index) => {
        // Handle date formatting
        let createdAt = new Date();
        try {
          createdAt = new Date(question.created_at);
          if (isNaN(createdAt.getTime())) createdAt = new Date(); // Fallback
        } catch(e) {
          createdAt = new Date(); // Fallback
        }
        
        const isToday = new Date().toDateString() === createdAt.toDateString();
        
        const formattedDate = isToday ? 
          `Today, ${createdAt.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}` : 
          createdAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
          });
        
        // Truncate long content
        const content = question.content || '';
        const maxLength = 120;
        const shouldTruncate = content.length > maxLength;
        const displayContent = shouldTruncate ? 
          `${content.substring(0, maxLength)}...` : 
          content;
        
        // Get other question data (safely)
        const anonymousName = question.anonymous_name || 'Anonymous';
        const resolved = !!question.resolved; // Convert to boolean
        
        // Generate card HTML
        html += `
          <div class="lynkk-history-item" style="position: relative; background-color: ${resolved ? '#f0fdf4' : '#f0f9ff'}; border-radius: 8px; padding: 10px; margin-bottom: 10px; border-left: 3px solid ${resolved ? '#10b981' : '#3b82f6'};">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <div style="width: 16px; height: 16px; background-color: ${resolved ? '#d1fae5' : '#dbeafe'}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    ${resolved ? 
                      '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' : 
                      '<circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line>'}
                  </svg>
                </div>
                <span style="font-size: 11px; font-weight: 600; color: ${resolved ? '#059669' : '#2563eb'};">
                  ${resolved ? 'Answered' : 'Pending'}
                </span>
              </div>
              <div style="font-size: 10px; color: #6b7280; display: flex; align-items: center; gap: 4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${formattedDate}
              </div>
            </div>
            
            <p style="margin: 6px 0; font-size: 12px; line-height: 1.4; color: #1f2937;">${displayContent}</p>
            
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #6b7280;">
              <div style="display: flex; align-items: center; gap: 4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                Asked as: <span style="font-weight: 500;">${anonymousName}</span>
              </div>
              
              ${shouldTruncate ? `
                <button class="lynkk-view-full-btn" data-question-id="${question.id}" style="font-size: 10px; color: #4f46e5; background: none; border: none; cursor: pointer; padding: 0; display: flex; align-items: center; gap: 4px;">
                  View full
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lynkk-btn-icon">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      });
      
      // Set the HTML content
      container.innerHTML = html;
      console.log("Set question history HTML. Element now has", container.children.length, "children");
      
      // Add "View Full" button listeners
      const viewFullButtons = container.querySelectorAll('.lynkk-view-full-btn');
      viewFullButtons.forEach(button => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          const questionId = button.getAttribute('data-question-id');
          const question = sortedQuestions.find(q => q.id === questionId);
          if (question) {
            showQuestionDetailModal(question);
          }
        });
      });
      
    } catch (error) {
      console.error("Error rendering student question history:", error);
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; color: #6b7280;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p style="margin: 8px 0 0 0; font-size: 12px;">Error loading questions</p>
          <button id="lynkk-retry-history" style="margin-top: 8px; font-size: 11px; background-color: #f3f4f6; color: #4b5563; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
            Retry
          </button>
        </div>
      `;
      
      // Add retry button listener
      const retryButton = document.getElementById('lynkk-retry-history');
      if (retryButton) {
        retryButton.addEventListener('click', () => {
          renderStudentQuestionHistory(container, sessionId, authToken);
        });
      }
    }
  });
}




  // This function initializes the complete anonymous questions dashboard
function initializeAnonymousQuestionDashboard(sessionId, authToken) {
  console.log('Initializing anonymous question dashboard for session:', sessionId);
  
  if (!sessionId || !authToken) {
    console.error('Missing session ID or auth token for anonymous question dashboard');
    return;
  }

  // Get container for the anonymous dashboard content
  const container = document.getElementById('lynkk-anonymous-content');
  if (!container) return;
  
  // Create the tabbed interface HTML
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; height: 100%; padding: 12px; overflow: hidden;">
      <!-- Anonymous Dashboard Tabs -->
      <div class="anon-tabs">
        <div class="anon-tab" data-tab="class-questions">Class Q</div>
        <div class="anon-tab active" data-tab="ask-question">Ask Q</div>
        <div class="anon-tab" data-tab="my-questions">My Q</div>
      </div>
      
      <!-- Tab Content -->
      <div style="flex-grow: 1; overflow: hidden; display: flex; flex-direction: column;">
        <!-- Class Questions Tab -->
        <div id="tab-class-questions" class="anon-tab-content">
          <div class="lynkk-card" style="height: 100%; overflow: hidden; display: flex; flex-direction: column;">
            <div class="lynkk-card-header">
              <h3 class="lynkk-card-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Questions from Current Session
              </h3>
            </div>
            <div id="lynkk-class-questions" class="lynkk-custom-scrollbar" style="flex: 1; overflow-y: auto; padding: 10px;">
              <div class="lynkk-loading-state">
                <div class="lynkk-animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                </div>
                <p style="font-size: 11px; margin-top: 4px;">Loading questions for this session...</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Ask Question Tab (Active by default) -->
        <div id="tab-ask-question" class="anon-tab-content active">
          <div class="lynkk-card" style="margin-bottom: 12px;">
            <div class="lynkk-card-header">
              <h3 class="lynkk-card-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                Ask a Question
              </h3>
            </div>
            <div style="padding: 10px;">
              <div id="lynkk-anonymous-identity" style="display: flex; flex-direction: column; margin-bottom: 8px;">
                <!-- Identity indicator -->
                <div style="display: flex; align-items: center; background-color: #f3f4f6; padding: 6px 8px; border-radius: 6px; margin-bottom: 6px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <div style="font-size: 11px; color: #6b7280;">
                    Your identity: <span id="lynkk-anonymous-name" style="font-weight: 500; color: #4b5563;">Loading...</span>
                  </div>
                </div>
                
                <!-- Enhanced toggle with descriptions -->
                <div style="display: flex; align-items: center; justify-content: space-between; background-color: #f9fafb; padding: 6px 8px; border-radius: 6px;">
                  <div style="display: flex; align-items: center;">
                    <label class="lynkk-toggle" style="margin-right: 8px;">
                      <input type="checkbox" id="lynkk-anonymous-toggle" checked>
                      <span class="lynkk-toggle-slider"></span>
                    </label>
                    <span id="toggle-label" style="font-size: 11px; color: #4f46e5; font-weight: 500;">Ask Anonymously</span>
                  </div>
                  <div id="toggle-description" style="font-size: 10px; color: #6b7280;">
                    Your name will be hidden
                  </div>
                </div>
              </div>
              
              <textarea
                id="lynkk-question-input"
                class="lynkk-question-input"
                rows="3"
                placeholder="Type your question here..."
              ></textarea>
              
              <div style="display: flex; justify-content: flex-end; align-items: center; margin-top: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span id="lynkk-char-count" style="font-size: 11px; color: #6b7280;">0/500</span>
                  <button id="lynkk-submit-question" class="lynkk-submit-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                    Send
                  </button>
                </div>
              </div>
              
              <div id="lynkk-question-error" style="margin-top: 8px; padding: 8px; background-color: #fee2e2; border-left: 3px solid #ef4444; border-radius: 4px; font-size: 11px; color: #b91c1c; display: none;"></div>
              
              <div id="lynkk-question-feedback" style="margin-top: 8px; padding: 8px; border-radius: 4px; font-size: 11px; display: none;"></div>
            </div>
          </div>
          
          <!-- Recent questions preview on ask question tab -->
          <div class="lynkk-card">
            <div class="lynkk-card-header">
              <h3 class="lynkk-card-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Recent Questions
              </h3>
              <div style="cursor: pointer; font-size: 11px; color: #4f46e5;" onclick="document.querySelector('.anon-tab[data-tab=\'class-questions\']').click()">
                View All
              </div>
            </div>
            <div id="lynkk-class-questions-preview" class="lynkk-custom-scrollbar" style="max-height: 150px; overflow-y: auto; padding: 8px;">
              <div class="lynkk-loading-state">
                <p style="font-size: 11px; margin-top: 4px;">Loading recent questions...</p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- My Questions Tab -->
        <div id="tab-my-questions" class="anon-tab-content">
          <div class="lynkk-card" style="height: 100%; overflow: hidden; display: flex; flex-direction: column;">
            <div class="lynkk-card-header">
              <h3 class="lynkk-card-title">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Your Questions
              </h3>
            </div>
            <div id="lynkk-student-questions-history-container" class="lynkk-custom-scrollbar" style="flex: 1; overflow-y: auto; padding: 10px;">
              <div class="lynkk-loading-state">
                <p style="font-size: 11px; margin-top: 4px;">Loading your questions for this session...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Add the necessary styling
  addDashboardStyles();
  
  // Add tab switching functionality
  const tabs = container.querySelectorAll('.anon-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // Remove active class from all tabs and content
      tabs.forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.anon-tab-content').forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
      });
      
      // Add active class to clicked tab
      this.classList.add('active');
      
      // Show corresponding content
      const tabName = this.getAttribute('data-tab');
      const tabContent = document.getElementById(`tab-${tabName}`);
      tabContent.classList.add('active');
      tabContent.style.display = 'block';
      
      // Special handling for class questions tab
      if (tabName === 'class-questions') {
        loadClassQuestionsForSession(sessionId, authToken);
      } else if (tabName === 'my-questions') {
        loadStudentQuestionsForSession(sessionId, authToken);
      }
    });
  });
  
  // Apply critical CSS fixes for scrolling
  applyScrollingFixes();
  
  // Fetch anonymous identity
  fetchAnonymousIdentity(sessionId, authToken)
    .then(identity => {
      console.log('Anonymous identity loaded:', identity);
      
      // Load class questions for this session only
      loadClassQuestionsForSession(sessionId, authToken);
      
      // Load student's questions for this session only
      loadStudentQuestionsForSession(sessionId, authToken);
      
      // Setup question form
      setupQuestionForm(sessionId, authToken);
    })
    .catch(error => {
      console.error('Error loading anonymous identity:', error);
      document.getElementById('lynkk-anonymous-name').textContent = 'Error loading identity';
    });
}

  

    // At line ~4500
    function applyScrollingFixes() {
      const scrollContainers = [
        'lynkk-class-questions',
        'lynkk-student-questions-history-container'
      ];
      
      scrollContainers.forEach(id => {
        const container = document.getElementById(id);
        if (container) {
          container.style.overflowY = 'auto';
          container.style.maxHeight = '100%';
          container.style.flex = '1';
          container.style.display = 'block';
          container.style.opacity = '1';
          container.style.visibility = 'visible';
        }
      });
    }
  // Function to add necessary styles for the dashboard

// Add necessary styles for the dashboard
function addDashboardStyles() {
  if (!document.getElementById('lynkk-dashboard-styles')) {
    const style = document.createElement('style');
    style.id = 'lynkk-dashboard-styles';
    style.textContent = `
      /* Tab styling */
      .anon-tabs {
        display: flex;
        background: #f1f5f9;
        border-radius: 8px;
        padding: 4px;
        margin-bottom: 12px;
      }
      
      .anon-tab {
        flex: 1;
        text-align: center;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 500;
        color: #64748b;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s ease;
      }
      
      .anon-tab.active {
        background: #ffffff;
        color: #4f46e5;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      }
      
      .anon-tab-content {
        display: none;
        height: 100%;
        overflow-y: auto;
      }
      
      .anon-tab-content.active {
        display: block;
      }
      
      /* Card styling */
      .lynkk-card {
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        margin-bottom: 12px;
        overflow: hidden;
      }
      
      .lynkk-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        border-bottom: 1px solid #f1f5f9;
      }
      
      .lynkk-card-title {
        display: flex;
        align-items: center;
        font-size: 14px;
        font-weight: 600;
        color: #334155;
        margin: 0;
      }
      
      .lynkk-card-title svg {
        margin-right: 6px;
      }
      
      /* Question input styling */
      .lynkk-question-input {
        width: 100%;
        padding: 10px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 13px;
        resize: none;
        transition: border-color 0.2s;
      }
      
      .lynkk-question-input:focus {
        outline: none;
        border-color: #818cf8;
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
      }
      
      /* Toggle switch */
      .lynkk-toggle {
        position: relative;
        display: inline-block;
        width: 32px;
        height: 16px;
      }
      
      .lynkk-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      
      .lynkk-toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #cbd5e1;
        transition: .4s;
        border-radius: 34px;
      }
      
      .lynkk-toggle-slider:before {
        position: absolute;
        content: "";
        height: 12px;
        width: 12px;
        left: 2px;
        bottom: 2px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
      }
      
      input:checked + .lynkk-toggle-slider {
        background-color: #4f46e5;
      }
      
      input:checked + .lynkk-toggle-slider:before {
        transform: translateX(16px);
      }
      
      /* Submit button */
      .lynkk-submit-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        background-color: #4f46e5;
        color: white;
        border: none;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .lynkk-submit-btn:hover {
        background-color: #4338ca;
      }
      
      /* Custom scrollbar */
      .lynkk-custom-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 #f8fafc;
      }
      
      .lynkk-custom-scrollbar::-webkit-scrollbar {
        width: 6px;
      }
      
      .lynkk-custom-scrollbar::-webkit-scrollbar-track {
        background: #f8fafc;
      }
      
      .lynkk-custom-scrollbar::-webkit-scrollbar-thumb {
        background-color: #cbd5e1;
        border-radius: 6px;
      }
      
      /* Question card styling */
      .lynkk-question-card {
        background: #f8fafc;
        border-radius: 6px;
        padding: 10px;
        margin-bottom: 8px;
        border-left: 3px solid #4f46e5;
      }
      
      .lynkk-question-card.resolved {
        border-left-color: #10b981;
      }
      
      .lynkk-question-meta {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #64748b;
        margin-bottom: 4px;
      }
      
      .lynkk-question-content {
        font-size: 12px;
        color: #334155;
        line-height: 1.4;
      }
      
      .lynkk-question-status {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        margin-top: 6px;
        color: #64748b;
      }
      
      .lynkk-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background-color: #4f46e5;
      }
      
      .lynkk-status-dot.resolved {
        background-color: #10b981;
      }
      
      /* Loading animation */
      @keyframes lynkk-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      
      .lynkk-loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px;
        color: #64748b;
      }
    `;
    document.head.appendChild(style);
  }
}



// Function to load class questions for this session only

function loadClassQuestionsForSession(sessionId, authToken) {
  // Find the right container
  let container = document.getElementById('lynkk-class-questions');
  
  if (!container) {
    console.error('Class questions container not found');
    return;
  }
  
  console.log(`Loading class questions for session ${sessionId}`);
  
  // Show loading indicator
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center;">
      <div style="width: 24px; height: 24px; border: 2px solid #e2e8f0; border-top: 2px solid #4f46e5; border-radius: 50%; margin-bottom: 12px; animation: lynkk-spin 1s linear infinite;"></div>
      <p style="font-size: 13px; color: #64748b;">Loading questions from the class...</p>
    </div>
  `;
  
  // Make API request to the correct endpoint
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `http://localhost:3000/api/anonymous/session/${sessionId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  }, (response) => {
    console.log("Class questions response:", response);
    
    try {
      // Extract questions from response based on your API response structure
      let questions = [];
      
      // Access nested data structure correctly
      if (response && response.ok && response.data && response.data.data) {
        questions = response.data.data;
        console.log("Extracted questions array:", questions);
      }
      
      console.log(`Found ${questions.length} class questions`);
      
      // Handle empty questions
      if (!questions || questions.length === 0) {
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 150px; text-align: center; color: #64748b;">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              <line x1="9" y1="10" x2="15" y2="10"></line>
              <line x1="12" y1="7" x2="12" y2="13"></line>
            </svg>
            <p style="margin-top: 12px; font-size: 14px;">No questions have been asked yet</p>
            <p style="margin-top: 4px; font-size: 12px;">Questions from other students will appear here</p>
          </div>
        `;
        return;
      }
      
      // Sort by date (newest first)
      questions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      // Generate HTML for questions
      let html = '';
      
      questions.forEach(question => {
        const timeAgo = getTimeAgoString(new Date(question.created_at));
        const resolvedClass = question.resolved ? 'resolved' : '';
        
        // FIXED: Use display_name instead of anonymous_name
        // This displays the correct name based on whether the question is anonymous or not
        const isAnonymous = question.type === 'anonymous';
        
        // Use display_name field which comes from the database view
        // If not available, fall back to sensible defaults
        const displayName = question.display_name || (isAnonymous ? 'Anonymous' : 'Student');
        
        // Log for debugging
        console.log(`Question: type=${question.type}, display_name=${question.display_name}, showing as=${displayName}`);
        
        html += `
          <div class="lynkk-question-card ${resolvedClass}" style="margin-bottom: 10px; padding: 12px; background-color: ${question.resolved ? '#f0fdf4' : '#f8fafc'}; border-radius: 8px; border-left: 3px solid ${question.resolved ? '#10b981' : '#4f46e5'};">
            <div class="lynkk-question-meta" style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 4px;">
              <span>${displayName}</span>
              <span>${timeAgo}</span>
            </div>
            <div class="lynkk-question-content" style="font-size: 13px; color: #334155; line-height: 1.4; word-break: break-word;">
              ${question.content}
            </div>
            <div class="lynkk-question-status" style="display: flex; align-items: center; gap: 4px; font-size: 11px; margin-top: 6px; color: ${question.resolved ? '#059669' : '#4f46e5'};">
              <span class="lynkk-status-dot ${resolvedClass}"></span>
              <span>${question.resolved ? 'Answered' : 'Pending answer'}</span>
            </div>
          </div>
        `;
      });
      
      container.innerHTML = html;
      
    } catch (error) {
      console.error('Error loading class questions:', error);
      container.innerHTML = `
        <div style="text-align: center; padding: 16px;">
          <p style="color: #ef4444; font-size: 12px;">Error loading questions</p>
          <button id="lynkk-retry-class" style="margin-top: 8px; padding: 6px 12px; background: #f1f5f9; border: none; border-radius: 4px; font-size: 11px; cursor: pointer;">
            Try Again
          </button>
        </div>
      `;
      
      document.getElementById('lynkk-retry-class')?.addEventListener('click', () => {
        loadClassQuestionsForSession(sessionId, authToken);
      });
    }
  });
}



// Function to load student's questions for this session only

function loadStudentQuestionsForSession(sessionId, authToken) {
  const container = document.getElementById('lynkk-student-questions-history-container');
  if (!container) return;
  
  console.log(`Loading student questions for session: ${sessionId}`);
  
  // Show an improved loading indicator
  container.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; padding: 24px; text-align: center;">
      <div style="display: flex; flex-direction: column; align-items: center;">
        <div style="width: 30px; height: 30px; border: 3px solid #e5e7eb; border-top: 3px solid #6366f1; border-radius: 50%; animation: lynkk-spin 1s linear infinite;"></div>
        <p style="margin-top: 14px; font-size: 14px; font-weight: 500; color: #4f46e5;">Loading your questions...</p>
      </div>
    </div>
  `;
  
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `http://localhost:3000/api/anonymous/${sessionId}/questions`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  }, (response) => {
    try {
      console.log("Student questions response:", response);
      
      let questions = [];
      
      if (response && response.ok) {
        if (response.data && response.data.data) {
          questions = response.data.data;
        } else if (Array.isArray(response.data)) {
          questions = response.data;
        }
      }
      
      console.log(`Extracted ${questions.length} student questions for session ${sessionId}`);
      
      // Handle empty case with a more engaging empty state
      if (questions.length === 0) {
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; background-color: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
              <line x1="9" y1="9" x2="9.01" y2="9"></line>
              <line x1="15" y1="9" x2="15.01" y2="9"></line>
            </svg>
            <h3 style="margin: 14px 0 6px 0; font-size: 16px; font-weight: 600; color: #334155;">No questions yet</h3>
            <p style="margin: 0; font-size: 14px; color: #64748b; max-width: 260px;">You haven't asked any questions in this session. Use the form above to get started!</p>
          </div>
        `;
        return;
      }
      
      // Sort questions by date (newest first)
      const sortedQuestions = [...questions].sort((a, b) => {
        return new Date(b.created_at) - new Date(a.created_at);
      });
      
      // Generate HTML for the questions
      let html = '<div style="padding: 8px 0;">';
      
      // Add a header
      html += `
        <div style="margin-bottom: 16px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0;">
          <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #334155;">Your Questions</h3>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">You've asked ${sortedQuestions.length} question${sortedQuestions.length > 1 ? 's' : ''} in this session</p>
        </div>
      `;
      
      sortedQuestions.forEach((question, index) => {
        // Format the date for display
        const createdAt = new Date(question.created_at);
        const timeAgo = getTimeAgoString(createdAt);
        
        // Use display_name when anonymous_name is null
        const isAnonymous = question.type === 'anonymous';
        const displayName = question.display_name || (isAnonymous ? 'Anonymous' : 'Student');
        
        // Determine status colors and icons
        const statusColor = question.resolved ? '#059669' : '#4f46e5';
        const statusBgColor = question.resolved ? '#f0fdf4' : '#f8fafc';
        const borderColor = question.resolved ? '#10b981' : '#6366f1';
        
        // Create HTML for each question with enhanced styling
        html += `
          <div class="lynkk-my-question-card" style="position: relative; margin-bottom: 16px; padding: 16px; background-color: ${statusBgColor}; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 2px 5px rgba(0,0,0,0.03); transition: all 0.2s ease;">
            <!-- Card header with user info and time -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <!-- User avatar/icon -->
                <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${isAnonymous ? '#8b5cf6' : '#3b82f6'}; display: flex; justify-content: center; align-items: center; color: white; font-size: 12px; font-weight: 600;">
                  ${isAnonymous ? 'A' : displayName.charAt(0).toUpperCase()}
                </div>
                <!-- Username and badge -->
                <div>
                  <span style="font-size: 14px; font-weight: 500; color: #334155;">${displayName}</span>
                  <span style="margin-left: 6px; font-size: 11px; padding: 2px 6px; background-color: ${isAnonymous ? '#ddd6fe' : '#bfdbfe'}; color: ${isAnonymous ? '#5b21b6' : '#1e40af'}; border-radius: 4px; font-weight: 500;">
                    ${isAnonymous ? 'Anonymous' : 'Identified'}
                  </span>
                </div>
              </div>
              <span style="font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 4px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${timeAgo}
              </span>
            </div>
            
            <!-- Question content with better typography -->
            <div style="font-size: 14px; color: #1e293b; line-height: 1.5; margin-bottom: 12px; padding: 12px; background-color: white; border-radius: 8px; border-left: 3px solid ${borderColor}; word-break: break-word;">
              ${question.content}
            </div>
            
            <!-- Status indicator -->
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${statusColor}; background-color: ${question.resolved ? 'rgba(16, 185, 129, 0.1)' : 'rgba(79, 70, 229, 0.1)'}; padding: 6px 10px; border-radius: 4px; width: fit-content;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${question.resolved ? 
                  `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>` : 
                  `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`
                }
              </svg>
              <span style="font-weight: 500;">${question.resolved ? 'Answered' : 'Pending answer'}</span>
            </div>
          </div>
        `;
      });
      
      html += '</div>';
      
      // Set the HTML content
      container.innerHTML = html;
      console.log(`Rendered ${sortedQuestions.length} questions for session ${sessionId}`);
      
      // Add hover effects with JavaScript
      const questionCards = container.querySelectorAll('.lynkk-my-question-card');
      questionCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
          card.style.transform = 'translateY(-2px)';
          card.style.boxShadow = '0 4px 10px rgba(0,0,0,0.08)';
        });
        
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'translateY(0)';
          card.style.boxShadow = '0 2px 5px rgba(0,0,0,0.03)';
        });
      });
      
    } catch (error) {
      console.error("Error rendering student questions:", error);
      container.innerHTML = `
        <div style="text-align: center; padding: 24px; background-color: #fef2f2; border-radius: 12px; border: 1px solid #fee2e2;">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto 12px auto; display: block;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #b91c1c;">Something went wrong</h3>
          <p style="margin: 0 0 16px 0; font-size: 14px; color: #ef4444;">Unable to load your questions at this time.</p>
          <button id="lynkk-retry-my-questions" style="padding: 8px 16px; background-color: white; color: #b91c1c; border: 1px solid #fecaca; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s ease;">
            Try Again
          </button>
        </div>
      `;
      
      const retryButton = document.getElementById('lynkk-retry-my-questions');
      if (retryButton) {
        retryButton.addEventListener('click', () => {
          loadStudentQuestionsForSession(sessionId, authToken);
        });
        
        // Add hover effect to retry button
        retryButton.addEventListener('mouseenter', () => {
          retryButton.style.backgroundColor = '#fef2f2';
        });
        
        retryButton.addEventListener('mouseleave', () => {
          retryButton.style.backgroundColor = 'white';
        });
      }
    }
  });
}

function setupQuestionForm(sessionId, authToken) {
  // Get all the necessary elements first
  const questionInput = document.getElementById('lynkk-question-input');
  const charCount = document.getElementById('lynkk-char-count');
  const submitButton = document.getElementById('lynkk-submit-question');
  const anonymousToggle = document.getElementById('lynkk-anonymous-toggle');
  const errorElement = document.getElementById('lynkk-question-error');
  const feedbackElement = document.getElementById('lynkk-question-feedback');
  const anonymousNameElement = document.getElementById('lynkk-anonymous-name');
  const toggleLabel = document.getElementById('toggle-label');
  const toggleDescription = document.getElementById('toggle-description');
  
  // Check if elements exist before proceeding
  if (!questionInput || !submitButton) return;

  // Important: Default the toggle to ON
  if (anonymousToggle) {
    anonymousToggle.checked = true;
  }
  
  // First, load the anonymous identity
  fetchAnonymousIdentity(sessionId, authToken)
    .then(identity => {
      if (anonymousNameElement && identity && identity.anonymous_name) {
        anonymousNameElement.textContent = identity.anonymous_name;
        console.log('Displaying anonymous identity:', identity.anonymous_name);
      }
    })
    .catch(error => {
      console.error('Error fetching anonymous identity:', error);
    });
  
  // Set initial toggle UI state
  if (toggleLabel) toggleLabel.textContent = "Ask Anonymously";
  if (toggleDescription) toggleDescription.textContent = "Your identity will be hidden";
  
  // Get user information from storage
  chrome.storage.local.get(['authState'], (result) => {
    const user = result.authState?.user;
    if (!user) {
      console.error('User data not found in storage');
      return;
    }
    
    console.log('User data loaded:', user);
    
    // IMPORTANT: Store the real name for later use
    const realName = user.firstName && user.lastName ? 
      `${user.firstName} ${user.lastName}` : 
      user.name || user.username || (user.email ? user.email.split('@')[0] : "Your Real Identity");
    
    // Log real identity for debugging
    console.log('Real identity to use:', realName);
    
    // NOW set up the toggle event listener with both identities available
    if (anonymousToggle) {
      anonymousToggle.addEventListener('change', () => {
        console.log('Toggle changed! New value:', anonymousToggle.checked);
        
        if (!anonymousNameElement) {
          console.error('Anonymous name element not found');
          return;
        }
        
        if (anonymousToggle.checked) {
          // When ON: Show anonymous identity
          fetchAnonymousIdentity(sessionId, authToken)
            .then(identity => {
              if (identity && identity.anonymous_name) {
                anonymousNameElement.textContent = identity.anonymous_name;
                console.log('Switched to anonymous identity:', identity.anonymous_name);
                
                if (toggleLabel) toggleLabel.textContent = "Ask Anonymously";
                if (toggleDescription) toggleDescription.textContent = "Your identity will be hidden";
              }
            })
            .catch(error => {
              console.error('Error fetching anonymous identity:', error);
            });
        } else {
          // When OFF: Show real username
          anonymousNameElement.textContent = realName;
          console.log('Switched to real identity:', realName);
          
          if (toggleLabel) toggleLabel.textContent = "Ask with Identity";
          if (toggleDescription) toggleDescription.textContent = "Your real name will be visible";
        }
        
        // Highlight change with animation
        anonymousNameElement.classList.add('highlight-flash');
        setTimeout(() => anonymousNameElement.classList.remove('highlight-flash'), 1000);
      });
    }
  });
  
  // Handle character count for textarea (your existing code)
  if (questionInput && charCount) {
    // Your character count code remains the same
  }
  
  // Submit question functionality
  if (submitButton) {
    submitButton.addEventListener('click', async () => {
      // Hide previous errors/feedback
      if (errorElement) errorElement.style.display = 'none';
      if (feedbackElement) feedbackElement.style.display = 'none';
      
      const questionText = questionInput.value.trim();
      
      // Validate input
      if (!questionText) {
        if (errorElement) {
          errorElement.textContent = 'Please enter a question';
          errorElement.style.display = 'block';
        }
        questionInput.focus();
        return;
      }
      
      // Show loading state on button
      const originalButtonText = submitButton.innerHTML;
      submitButton.innerHTML = `
        <div style="display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: lynkk-spin 1s linear infinite;"></div>
        <span style="margin-left: 6px;">Sending...</span>
      `;
      submitButton.disabled = true;
      
      try {
        // Log submission details for debugging
        console.log('Submitting question with toggle state:', anonymousToggle ? anonymousToggle.checked : 'toggle not found');
        
        // Use different API calls based on toggle state
        if (!anonymousToggle || anonymousToggle.checked) {
          // Submit anonymously
          console.log('Submitting as ANONYMOUS user');
          await submitAnonymousQuestion(sessionId, authToken, questionText);
        } else {
          // Submit with real identity
          console.log('Submitting as REAL user');
          await submitIdentifiedQuestion(sessionId, authToken, questionText);
        }
        
        // Success - clear input
        questionInput.value = '';
        if (charCount) {
          charCount.textContent = '0/500';
          charCount.style.color = '#6b7280';
        }
        
        // Show success feedback
        if (feedbackElement) {
          feedbackElement.textContent = 'Question submitted successfully!';
          feedbackElement.style.backgroundColor = '#d1fae5';
          feedbackElement.style.color = '#065f46';
          feedbackElement.style.padding = '8px 12px';
          feedbackElement.style.borderRadius = '6px';
          feedbackElement.style.display = 'block';
        }
        
        // Refresh questions list
        loadStudentQuestionsForSession(sessionId, authToken);
        if (typeof loadRecentQuestionsPreview === 'function') {
          loadRecentQuestionsPreview(sessionId, authToken);
        }
        loadClassQuestionsForSession(sessionId, authToken);
        
        // Hide success message after 3 seconds
        setTimeout(() => {
          if (feedbackElement) feedbackElement.style.display = 'none';
        }, 3000);
      } catch (error) {
        console.error('Error submitting question:', error);
        
        // Show error feedback
        if (errorElement) {
          errorElement.textContent = error.message || 'Failed to submit your question. Please try again.';
          errorElement.style.display = 'block';
        }
      } finally {
        // Reset button state
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
      }
    });
  }
}

// Function to submit a question with the user's real identity
async function submitIdentifiedQuestion(sessionId, authToken, questionText) {
  const submitButton = document.querySelector('#lynkk-question-submit');
  
  try {
    // Show loading state
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = '<span class="animate-pulse">Sending...</span>';
    }
    
    console.log('Submitting identified question for session:', sessionId);
    
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: `http://localhost:3000/api/anonymous/${sessionId}/identified-questions`,
        method: 'POST',
        timeoutMS: 10000, // Add timeout for consistency
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: {
          content: questionText.trim()
          // Note: 'type' parameter is unnecessary as the endpoint already knows it's for identified questions
        }
      }, (response) => {
        console.log('Identified question API response:', response);
        
        if (!response || !response.ok) {
          reject(new Error(response?.error || 'Failed to submit question'));
        } else {
          console.log('Identified question submitted successfully');
          
          // Update any UI elements as needed
          const questionsList = document.getElementById('lynkk-class-questions');
          if (questionsList) {
            // Trigger a refresh of questions
            loadClassQuestionsForSession(sessionId, authToken);
          }
          
          resolve(response.data);
        }
      });
    });
  } catch (error) {
    console.error('Error submitting identified question:', error);
    throw error;
  } finally {
    // Restore button state
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Ask';
    }
  }
}



// Then make sure to call this function after initializing the anonymous question dashboard

// setupExtraQuestionFormHandlers();
// Function to load a preview of recent questions
function loadRecentQuestionsPreview(sessionId, authToken) {
  const container = document.getElementById('lynkk-class-questions-preview');
  if (!container) return;
  
  // Make API request for recent questions, limit to 3
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `http://localhost:3000/api/anonymous/session/${sessionId}?limit=3`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  }, (response) => {
    try {
      if (!response || !response.ok) {
        container.innerHTML = `<p style="font-size: 11px; color: #6b7280; text-align: center;">Could not load recent questions</p>`;
        return;
      }
      
      // Safely extract questions array
      let questions = [];
      
      if (Array.isArray(response.data)) {
        questions = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        questions = response.data.data;
      } else if (response.data && response.data.data && Array.isArray(response.data.data.questions)) {
        questions = response.data.data.questions;
      }
      
      if (questions.length === 0) {
        container.innerHTML = `<p style="font-size: 11px; color: #6b7280; text-align: center;">No questions yet</p>`;
        return;
      }
      
      // Sort and limit to most recent 3
      const recentQuestions = [...questions]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 3);
      
      let html = '';
      
      recentQuestions.forEach(question => {
        const timeAgo = getTimeAgoString(new Date(question.created_at));
        
        html += `
          <div class="lynkk-question-card ${question.resolved ? 'resolved' : ''}" style="margin-bottom: 6px; padding: 8px;">
            <div class="lynkk-question-meta">
              <span>${question.anonymous_name || 'Anonymous'}</span>
              <span>${timeAgo}</span>
            </div>
            <div class="lynkk-question-content" style="font-size: 11px;">${question.content}</div>
          </div>
        `;
      });
      
      container.innerHTML = html;
      
    } catch (error) {
      console.error("Error rendering question preview:", error);
      container.innerHTML = `<p style="font-size: 11px; color: #6b7280; text-align: center;">Error loading questions</p>`;
    }
  });
}

 
function loadClassQuestions(sessionId, authToken, targetContainer) {
  const container = targetContainer || document.getElementById('lynkk-class-questions');
  if (!container) return;
  
  console.log("Loading class questions in container:", container.id);
  
  // Show loading state
  container.innerHTML = `
    <div class="lynkk-loading-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px;">
      <div class="lynkk-loading-spinner" style="width: 18px; height: 18px; border: 2px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: lynkk-spin 0.8s linear infinite;"></div>
      <p style="margin: 8px 0 0 0; font-size: 11px; color: #6b7280;">Loading class questions...</p>
    </div>
  `;
  
  // Ensure container is visible and scrollable
  container.style.overflowY = 'auto';
  container.style.maxHeight = container.id === 'lynkk-class-questions-preview' ? '120px' : '300px';
  container.style.display = 'block';
  
  // Use the proper endpoint and handle the response correctly
  chrome.runtime.sendMessage({
    type: 'API_REQUEST',
    url: `http://localhost:3000/api/anonymous/session/${sessionId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    }
  }, (response) => {
    console.log("Class questions response:", response);
    
    try {
      // Extract questions safely from response with multiple fallbacks
      let questions = [];
      
      if (response && response.ok) {
        if (Array.isArray(response.data)) {
          questions = response.data;
        } else if (response.data && Array.isArray(response.data.data)) {
          questions = response.data.data;
        } else if (response.data && response.data.ok && Array.isArray(response.data.data)) {
          questions = response.data.data;
        }
      }
      
      // Debug the actual data structure
      console.log("Extracted questions array:", questions);
      console.log("First question:", questions.length > 0 ? questions[0] : "No questions");
      
      // Ensure we have an array
      if (!Array.isArray(questions)) {
        console.warn("Questions is not an array, using empty array instead");
        questions = [];
      }
      
      if (questions.length === 0) {
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 80px; text-align: center;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 15h8"></path>
              <path d="M9 9h.01"></path>
              <path d="M15 9h.01"></path>
            </svg>
            <p style="margin: 8px 0 0 0; font-size: 12px; color: #6b7280;">No questions yet</p>
          </div>
        `;
        return;
      }
      
      // Sort the questions by date
      const sortedQuestions = [...questions].sort((a, b) => {
        // First sort by resolution status
        if (a.resolved !== b.resolved) {
          return a.resolved ? 1 : -1;
        }
        // Then by date (newest first)
        return new Date(b.created_at) - new Date(a.created_at);
      });
      
      // Only show the latest questions (all for full view, limit for preview)
      const displayQuestions = container.id === 'lynkk-class-questions-preview' ? 
        sortedQuestions.slice(0, 3) : sortedQuestions;
      
      // Generate HTML for questions
      let html = '';
      
      displayQuestions.forEach((question, index) => {
        const createdAt = new Date(question.created_at);
        const timeAgo = getTimeAgoString(createdAt);
        
        // Determine if question is anonymous based on type field
        const isAnonymous = question.type === 'anonymous';
        
        // IMPORTANT: Use display_name from the database view
        // This properly handles both anonymous and identified users
        // If display_name is not available, fall back to sensible defaults
        const displayName = question.display_name || (isAnonymous ? 'Anonymous' : 'Student');
        
        console.log(`Question ${index}: type=${question.type}, anonymous_name=${question.anonymous_name}, display_name=${question.display_name}, final display=${displayName}`);
        
        // Visual indicators for different question types
        const badgeHtml = isAnonymous 
          ? `<span style="font-size: 9px; padding: 1px 4px; background-color: #ddd6fe; color: #5b21b6; border-radius: 4px; margin-left: 4px;">Anonymous</span>`
          : `<span style="font-size: 9px; padding: 1px 4px; background-color: #bfdbfe; color: #1e40af; border-radius: 4px; margin-left: 4px;">Identified</span>`;
        
        const borderColor = isAnonymous ? '#8b5cf6' : '#3b82f6';
        
        html += `
          <div class="lynkk-class-question" style="padding: 8px; border-radius: 6px; background-color: ${index % 2 === 0 ? '#f9fafb' : 'white'}; margin-bottom: 6px; border-left: 3px solid ${borderColor}; ${question.resolved ? 'opacity: 0.7;' : ''}">
            <div style="font-size: 12px; color: #1f2937; margin-bottom: 4px; word-break: break-word;">
              ${question.content}
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10px; color: #6b7280; display: flex; align-items: center;">
                ${displayName}
                ${badgeHtml}
              </span>
              <span style="font-size: 10px; color: #6b7280; display: flex; align-items: center; gap: 4px;">
                ${question.resolved ? `
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <span style="color: #10b981">Resolved</span>
                ` : ''}
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${timeAgo}
              </span>
            </div>
          </div>
        `;
      });
      
      // Add "View all" button if in preview mode and there are more questions
      if (container.id === 'lynkk-class-questions-preview' && sortedQuestions.length > 3) {
        html += `
          <div style="text-align: center; padding: 4px 0;">
            <button id="lynkk-view-all-questions" style="font-size: 11px; color: #4f46e5; background: none; border: none; cursor: pointer;">
              View all ${sortedQuestions.length} questions
            </button>
          </div>
        `;
      }
      
      // Set the HTML content
      container.innerHTML = html;
      console.log("Set class questions HTML. Element now has", container.children.length, "children");
      
      // Add "View all" button listener
      const viewAllButton = document.getElementById('lynkk-view-all-questions');
      if (viewAllButton) {
        viewAllButton.addEventListener('click', () => {
          // Switch to the class questions tab
          const classQuestionsTab = document.querySelector('.anon-tab[data-tab="class-questions"]');
          if (classQuestionsTab) {
            classQuestionsTab.click();
          }
        });
      }
      
    } catch (error) {
      console.error('Error handling response:', error);
      container.innerHTML = `
        <div style="text-align: center; padding: 12px;">
          <p style="font-size: 11px; color: #6b7280;">Error loading questions</p>
          <button id="lynkk-retry-load-${container.id}" style="font-size: 11px; margin-top: 6px; background-color: #f3f4f6; color: #4b5563; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Retry</button>
        </div>
      `;
      
      // Add retry button
      const retryButton = document.getElementById(`lynkk-retry-load-${container.id}`);
      if (retryButton) {
        retryButton.addEventListener('click', () => {
          loadClassQuestions(sessionId, authToken, container);
        });
      }
    }
  });
}

// Helper function to format time ago string
function getTimeAgoString(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return diffMin === 1 ? '1 min ago' : `${diffMin} mins ago`;
  } else if (diffHour < 24) {
    return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
  } else if (diffDay < 7) {
    return diffDay === 1 ? 'yesterday' : `${diffDay} days ago`;
  } else {
    // Format date for older posts
    const month = date.toLocaleString('default', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  }
}
//--======================= SESSION TABS & UI FUNCTIONS ====================



// ==================== AI ASSISTANT FUNCTIONS ====================
/**
 * Shows the selected tab and appropriate input container
 * @param {string} tabName - The name of the tab to show
 */

// Fix visibility for the anonymous tab
function showTab(tabName) {
    // Log tab change
    console.log(`Switching to tab: ${tabName}`);
    
    // First hide all tabs with CSS (both active class and inline style)
    document.querySelectorAll('.lynkk-content').forEach(content => {
      content.classList.remove('active');
      content.style.display = 'none'; // Force hide with inline style too
    });
    
    // Remove active class from tab buttons
    document.querySelectorAll('.lynkk-tab').forEach(tab => {
      tab.classList.remove('active');
    });
    
    // Get the content for the selected tab
    const contentElement = document.getElementById(`lynkk-${tabName}-content`);
    if (contentElement) {
      contentElement.classList.add('active');
      
      // Use the appropriate display type for each tab
      if (tabName === 'anonymous') {
        console.log("Setting display: flex for anonymous tab");
        contentElement.style.display = 'flex';
        
        // Force a refresh of anonymous components if we're showing that tab
        renderAnonymousComponents();
      } else {
        contentElement.style.display = 'block';
      }
      
      // Special handling for AI tab
      if (tabName === 'ai') {
        const aiMessagesContainer = document.getElementById('lynkk-ai-messages');
        if (aiMessagesContainer) {
          setTimeout(() => {
            aiMessagesContainer.scrollTop = aiMessagesContainer.scrollHeight;
          }, 10);
        }
      }
    }
    
    // Add active class to the selected tab button
    const tabElement = document.getElementById(`lynkk-${tabName}-tab`);
    if (tabElement) {
      tabElement.classList.add('active');
    }
    
    // Handle input containers
    const inputContainers = [
      'lynkk-ai-input-container',
      'lynkk-chat-input-container',
      'lynkk-anonymous-input-container',
      'lynkk-polls-input-container'
    ];
  
    inputContainers.forEach(containerId => {
      const container = document.getElementById(containerId);
      if (container) {
        container.style.display = 'none';
      }
    });
    
    // Show the input container for the selected tab
    const inputContainer = document.getElementById(`lynkk-${tabName}-input-container`);
    if (inputContainer) {
      inputContainer.style.display = 'block';
    }
    
    // Save the active tab preference
    chrome.storage.local.set({ activeTab: tabName });
  }


/**
 * Initialize Gemini context with session information
 * @param {Object} session - The session object
 */
function initGeminiContext(session) {
  console.log('Initializing Gemini context with session:', session);

  // Handle different response structures for professor vs student
  let sessionData;
  if (session.data) {
    // Professor response structure
    sessionData = session.data;
  } else {
    // Student response structure
    sessionData = session;
  }

  // Set context values
  geminiContext.sessionTitle = sessionData.title || 'Untitled Session';
  geminiContext.sessionDescription = sessionData.description || '';
  geminiContext.sessionId = sessionData.id;
  geminiContext.messages = [];

  // Get the welcome message element
  const welcomeMsg = document.getElementById('lynkk-ai-messages');
  
  // Only set welcome message if we're in a session context and have a title
  if (welcomeMsg && geminiContext.sessionTitle) {
    welcomeMsg.innerHTML = `
      <div class="lynkk-welcome-message">
        <p>Your question about <strong>${geminiContext.sessionTitle}</strong>:</p>
        ${geminiContext.sessionDescription ? 
          `<p class="lynkk-session-desc">${geminiContext.sessionDescription}</p>` 
          : ''}
      </div>
    `;

    // Add styles for session description
    if (!document.querySelector('.lynkk-session-desc-style')) {
      const style = document.createElement('style');
      style.className = 'lynkk-session-desc-style';
      style.textContent = `
        .lynkk-session-desc {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 6px;
          font-style: italic;
        }
      `;
      document.head.appendChild(style);
    }
  }
}

/**
 * Sends a question to the Gemini API
 * @param {string} question - The user's question
 * @param {string} contextPrompt - Context prompt for the AI
 * @returns {Promise<string>} The AI response
 */
async function makeGeminiRequest(question, contextPrompt) {
  // Using the correct format with roles
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: contextPrompt }
        ]
      },
      {
        role: "model",
        parts: [
          { text: "I understand. I'll help students with their questions about the class session, providing clear explanations and using markdown formatting when it helps clarify the content." }
        ]
      },
      {
        role: "user",
        parts: [
          { text: question }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 800,
    }
  };
  
  try {
    console.log('Sending Gemini request with payload:', payload);
    
    // Make the API request through the background script
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'GEMINI_API_REQUEST',
        payload
      }, result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!result || !result.success) {
          reject(new Error((result && result.error) || 'API request failed'));
        } else {
          resolve(result.data);
        }
      });
    });
    
    // Extract the response text
    if (response.candidates && 
        response.candidates.length > 0 && 
        response.candidates[0].content && 
        response.candidates[0].content.parts && 
        response.candidates[0].content.parts.length > 0) {
      
      return response.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Invalid response format from Gemini API');
    }
  } catch (error) {
    console.error('Error making Gemini API request:', error);
    throw error;
  }
}

/**
 * Helper function to summarize conversation context
 * @param {Array} messages - The conversation messages
 * @returns {string} The summarized context
 */
function summarizeContext(messages) {
  if (messages.length <= 4) {
    return messages.map(m => `${m.role}: ${m.content}`).join('\n');
  }

  return [
    messages[0],
    { role: 'system', content: `[Previous conversation summarized: ${messages.length - 4} messages omitted]` },
    ...messages.slice(-3)
  ].map(m => `${m.role}: ${m.content}`).join('\n');
}

/**
 * Sends an AI question and handles UI updates
 * @param {string} question - The user's question
 */
function sendAIQuestion(question) {
  // Show a loading indicator or message in the AI messages area
  const aiMessages = document.getElementById('lynkk-ai-messages');
  
  // First, display the user's question
  showAIMessage({
    content: question,
    isUser: true,
    timestamp: new Date()
  });
  
  // Add to context
  geminiContext.messages.push({
    role: 'user',
    content: question
  });
  
  // Show loading indicator
  const loadingId = 'loading-' + Date.now();
  const loadingElement = document.createElement('div');
  loadingElement.className = 'lynkk-ai-message lynkk-bot';
  loadingElement.id = loadingId;
  loadingElement.innerHTML = `
    <div class="lynkk-ai-bubble">
      <div class="lynkk-ai-header">
        <div class="lynkk-ai-sender">AI Assistant</div>
        <div class="lynkk-ai-time">${formatTime(new Date())}</div>
      </div>
      <div class="lynkk-ai-text">
        <div class="lynkk-typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
  
  // Add typing indicator styles if not present
  if (!document.querySelector('.lynkk-typing-style')) {
    const style = document.createElement('style');
    style.className = 'lynkk-typing-style';
    style.textContent = `
      .lynkk-typing-indicator {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      
      .lynkk-typing-indicator span {
        width: 8px;
        height: 8px;
        background-color: #cbd5e1;
        border-radius: 50%;
        display: inline-block;
        animation: lynkk-typing 1.4s infinite ease-in-out both;
      }
      
      .lynkk-typing-indicator span:nth-child(1) {
        animation-delay: 0s;
      }
      
      .lynkk-typing-indicator span:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      .lynkk-typing-indicator span:nth-child(3) {
        animation-delay: 0.4s;
      }
      
      @keyframes lynkk-typing {
        0%, 80%, 100% { 
          transform: scale(0.6);
        }
        40% { 
          transform: scale(1);
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  if (aiMessages) {
    aiMessages.appendChild(loadingElement);
    aiMessages.scrollTop = aiMessages.scrollHeight;
  }
  
  // Get session context
  const contextPrompt = geminiContext.sessionTitle ? 
    `You are an AI teaching assistant for the class session "${geminiContext.sessionTitle}". ${geminiContext.sessionDescription ? "Class description: " + geminiContext.sessionDescription : ""}` : 
    "You are an AI teaching assistant helping a student.";
  
  // Make API request to Gemini
  makeGeminiRequest(question, contextPrompt)
    .then(response => {
      // Remove loading indicator
      const loadingElement = document.getElementById(loadingId);
      if (loadingElement) {
        loadingElement.remove();
      }
      
      // Add to context
      geminiContext.messages.push({
        role: 'assistant',
        content: response
      });
      
      // Display the AI's response
      showAIMessage({
        content: response,
        isUser: false,
        timestamp: new Date()
      });
      
      // Save the conversation to database
      saveAIConversation(question, response)
        .then(success => {
          if (success) {
            console.log('Conversation saved successfully');
          } else {
            console.warn('Failed to save conversation');
          }
        });
    })
    .catch(error => {
      console.error('Error asking Gemini AI:', error);
      
      // Remove loading indicator
      const loadingElement = document.getElementById(loadingId);
      if (loadingElement) {
        loadingElement.remove();
      }
      
      // Show error message
      showAIMessage({
        content: "Sorry, I couldn't process your request right now. Please try again later.",
        isUser: false,
        timestamp: new Date()
      });
    });
}
/**
 * Formats a date object into a readable time string
 * @param {Date} date - The date object to format
 * @return {string} - The formatted time string
 */
function formatTime(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return "Just now";
  }
  
  // Format time as HH:MM AM/PM
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Helper function to show AI messages
 * @param {Object} message - The message to show
 */
// function showAIMessage(message) {
//   const aiMessages = document.getElementById('lynkk-ai-messages');
//   if (!aiMessages) return;
  
//   // Remove welcome message if it exists and this is the first message
//   const welcomeMsg = aiMessages.querySelector('.lynkk-welcome-message');
//   if (welcomeMsg && message.isUser) {
//     aiMessages.innerHTML = '';
//   }
  
//   // Create message element
//   const messageElement = document.createElement('div');
//   messageElement.className = message.isUser ? 'lynkk-ai-message lynkk-user' : 'lynkk-ai-message lynkk-bot';
  
//   messageElement.innerHTML = `
//     <div class="lynkk-ai-bubble">
//       <div class="lynkk-ai-header">
//         <div class="lynkk-ai-sender">${message.isUser ? 'You' : 'AI Assistant'}</div>
//         <div class="lynkk-ai-time">${formatTime(message.timestamp || new Date())}</div>
//       </div>
//       <div class="lynkk-ai-text">${message.content}</div>
//     </div>
//   `;
  
//   aiMessages.appendChild(messageElement);
//   aiMessages.scrollTop = aiMessages.scrollHeight;
// }

// Helper function to show AI messages with beautiful formatting
function showAIMessage(message) {
  const aiMessages = document.getElementById('lynkk-ai-messages');
  if (!aiMessages) return;
  
  // Remove welcome message if it exists and this is the first message
  const welcomeMsg = aiMessages.querySelector('.lynkk-welcome-message');
  if (welcomeMsg && message.isUser) {
    aiMessages.innerHTML = '';
  }
  
  // Create message element
  const messageElement = document.createElement('div');
  messageElement.className = message.isUser ? 'lynkk-ai-message lynkk-user' : 'lynkk-ai-message lynkk-bot';
  
  // Format the content with markdown if it's from the AI
  let formattedContent = message.content;
  
  if (!message.isUser) {
    // Process markdown for AI messages
    formattedContent = parseMarkdown(message.content);
  }
  
  messageElement.innerHTML = `
    <div class="lynkk-ai-bubble">
      <div class="lynkk-ai-header">
        <div class="lynkk-ai-sender">
          ${message.isUser ? 
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> You' : 
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="14.31" y1="8" x2="20.05" y2="17.94"></line><line x1="9.69" y1="8" x2="21.17" y2="8"></line><line x1="7.38" y1="12" x2="13.12" y2="2.06"></line><line x1="9.69" y1="16" x2="3.95" y2="6.06"></line><line x1="14.31" y1="16" x2="2.83" y2="16"></line><line x1="16.62" y1="12" x2="10.88" y2="21.94"></line></svg> AI Assistant'}
        </div>
        <div class="lynkk-ai-time">${formatTime(message.timestamp || new Date())}</div>
      </div>
      <div class="lynkk-ai-text ${message.isUser ? '' : 'lynkk-ai-formatted'}">
        ${formattedContent}
      </div>
    </div>
  `;
  
  aiMessages.appendChild(messageElement);
  aiMessages.scrollTop = aiMessages.scrollHeight;
  
  // Add syntax highlighting to code blocks
  if (!message.isUser) {
    const codeBlocks = messageElement.querySelectorAll('pre code');
    if (codeBlocks.length > 0) {
      highlightCodeBlocks(codeBlocks);
    }
  }
}

// Helper function to parse markdown
function parseMarkdown(text) {
  if (!text) return '';
  
  // Add AI chat formatting styles if they don't exist yet
  if (!document.getElementById('lynkk-ai-formatting-styles')) {
    addAIChatStyles();
  }
  
  // Handle code blocks with language specification ```language
  text = text.replace(/```([\w-]*)\n([\s\S]*?)\n```/g, function(match, language, code) {
    language = language.trim();
    const langClass = language ? ` class="language-${language}"` : '';
    return `<pre class="lynkk-code-block"><code${langClass}>${escapeHtml(code.trim())}</code></pre>`;
  });
  
  // Handle inline code
  text = text.replace(/`([^`]+)`/g, '<code class="lynkk-inline-code">$1</code>');
  
  // Handle headers
  text = text.replace(/^### (.*$)/gm, '<h3 class="lynkk-h3">$1</h3>');
  text = text.replace(/^## (.*$)/gm, '<h2 class="lynkk-h2">$1</h2>');
  text = text.replace(/^# (.*$)/gm, '<h1 class="lynkk-h1">$1</h1>');
  
  // Handle bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Handle italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Handle lists
  text = text.replace(/^\s*\*\s(.*)/gm, '<li class="lynkk-list-item">$1</li>');
  text = text.replace(/^\s*-\s(.*)/gm, '<li class="lynkk-list-item">$1</li>');
  text = text.replace(/^\s*\d+\.\s(.*)/gm, '<li class="lynkk-list-item lynkk-numbered">$1</li>');
  
  // Wrap lists in ul/ol
  text = text.replace(/<li class="lynkk-list-item">[\s\S]*?(?=<li class="lynkk-list-item lynkk-numbered"|<h|<p|<\/div|$)/g, match => {
    if (match.includes('<li')) {
      return '<ul class="lynkk-list">' + match + '</ul>';
    }
    return match;
  });
  
  text = text.replace(/<li class="lynkk-list-item lynkk-numbered">[\s\S]*?(?=<li class="lynkk-list-item(?! lynkk-numbered)"|<h|<p|<\/div|$)/g, match => {
    if (match.includes('<li')) {
      return '<ol class="lynkk-list">' + match + '</ol>';
    }
    return match;
  });
  
  // Handle links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="lynkk-link">$1</a>');
  
  // Handle paragraphs - wrap non-wrapped text in p tags
  text = text.replace(/^(?!<[uo]l|<li|<h[1-3]|<pre|<code)(.*$)/gm, function(match, content) {
    if (content.trim() === '') return '';
    return `<p>${content}</p>`;
  });
  
  return text;
}

// Function to add AI chat styling
function addAIChatStyles() {
  const style = document.createElement('style');
  style.id = 'lynkk-ai-formatting-styles';
  style.textContent = `
    /* Message containers */
    .lynkk-ai-message {
      display: flex;
      flex-direction: column;
      margin-bottom: 16px;
      max-width: 90%;
      animation: fadeIn 0.3s ease-out;
    }
    
    .lynkk-user {
      align-self: flex-end;
    }
    
    .lynkk-bot {
      align-self: flex-start;
    }
    
    .lynkk-ai-bubble {
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      overflow: hidden;
    }
    
    .lynkk-user .lynkk-ai-bubble {
      background-color: #4f46e5;
      color: white;
      border-bottom-right-radius: 4px;
    }
    
    .lynkk-bot .lynkk-ai-bubble {
      background-color: white;
      color: #1f2937;
      border-bottom-left-radius: 4px;
      border-left: 3px solid #4f46e5;
    }
    
    .lynkk-ai-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      font-size: 12px;
    }
    
    .lynkk-user .lynkk-ai-header {
      background-color: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.9);
    }
    
    .lynkk-bot .lynkk-ai-header {
      background-color: #f9fafb;
      color: #6b7280;
      border-bottom: 1px solid #f3f4f6;
    }
    
    .lynkk-ai-sender {
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .lynkk-ai-time {
      font-size: 10px;
      opacity: 0.8;
    }
    
    .lynkk-ai-text {
      padding: 12px 16px;
      line-height: 1.5;
      font-size: 14px;
      overflow-wrap: break-word;
    }
    
    /* Markdown formatting */
    .lynkk-ai-formatted {
      line-height: 1.6;
    }
    
    .lynkk-ai-formatted p {
      margin: 0 0 12px 0;
    }
    
    .lynkk-ai-formatted p:last-child {
      margin-bottom: 0;
    }
    
    .lynkk-h1, .lynkk-h2, .lynkk-h3 {
      margin: 16px 0 12px 0;
      font-weight: 600;
      line-height: 1.3;
    }
    
    .lynkk-h1 {
      font-size: 1.4em;
      color: #111827;
    }
    
    .lynkk-h2 {
      font-size: 1.2em;
      color: #1f2937;
    }
    
    .lynkk-h3 {
      font-size: 1.1em;
      color: #374151;
    }
    
    .lynkk-list {
      margin: 8px 0 16px 0;
      padding-left: 24px;
    }
    
    .lynkk-list-item {
      margin-bottom: 4px;
      position: relative;
    }
    
    .lynkk-link {
      color: #4f46e5;
      text-decoration: none;
      border-bottom: 1px solid rgba(79, 70, 229, 0.3);
      transition: border-bottom 0.2s;
    }
    
    .lynkk-link:hover {
      border-bottom: 1px solid rgba(79, 70, 229, 0.8);
    }
    
    /* Code blocks */
    .lynkk-code-block {
      background-color: #f9fafb;
      border-radius: 6px;
      margin: 12px 0;
      padding: 12px;
      overflow-x: auto;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 13px;
      line-height: 1.45;
      color: #24292e;
      position: relative;
      border: 1px solid #e5e7eb;
    }
    
    .lynkk-inline-code {
      background-color: #f3f4f6;
      padding: 2px 4px;
      border-radius: 4px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
      font-size: 0.9em;
      color: #4f46e5;
    }
    
    /* Animation */
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    /* Syntax highlighting placeholder styles */
    .hljs-keyword {
      color: #cf222e;
    }
    
    .hljs-string {
      color: #0a3069;
    }
    
    .hljs-comment {
      color: #6e7781;
      font-style: italic;
    }
    
    .hljs-function {
      color: #8250df;
    }
    
    .hljs-number {
      color: #0550ae;
    }
  `;
  document.head.appendChild(style);
}

// Function to highlight code blocks
function highlightCodeBlocks(codeBlocks) {
  // Basic syntax highlighting for common languages
  codeBlocks.forEach(block => {
    const code = block.textContent;
    const language = block.className.replace('language-', '');
    
    let highlighted = code;
    
    // Very basic syntax highlighting for a few languages
    if (['javascript', 'js', 'typescript', 'ts'].includes(language)) {
      // Keywords
      highlighted = highlighted.replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|new|this|break|continue)\b/g, '<span class="hljs-keyword">$1</span>');
      
      // Strings
      highlighted = highlighted.replace(/(['"`])(.*?)\1/g, '<span class="hljs-string">$1$2$1</span>');
      
      // Comments
      highlighted = highlighted.replace(/\/\/(.*)/g, '<span class="hljs-comment">//$1</span>');
      highlighted = highlighted.replace(/\/\*([\s\S]*?)\*\//g, '<span class="hljs-comment">/*$1*/</span>');
      
      // Numbers
      highlighted = highlighted.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hljs-number">$1</span>');
    } else if (['python', 'py'].includes(language)) {
      // Keywords
      highlighted = highlighted.replace(/\b(def|class|if|else|elif|for|while|in|import|from|return|try|except|finally|raise|with|as|pass|break|continue|global|nonlocal|lambda|yield)\b/g, '<span class="hljs-keyword">$1</span>');
      
      // Strings
      highlighted = highlighted.replace(/(['"])(.*?)\1/g, '<span class="hljs-string">$1$2$1</span>');
      
      // Comments
      highlighted = highlighted.replace(/#(.*)/g, '<span class="hljs-comment">#$1</span>');
      
      // Numbers
      highlighted = highlighted.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hljs-number">$1</span>');
    } 
    
    block.innerHTML = highlighted;
    
    // Add a language label if it's specified
    if (language && language !== 'code') {
      const pre = block.parentElement;
      const languageLabel = document.createElement('div');
      languageLabel.className = 'lynkk-language-label';
      languageLabel.textContent = language;
      languageLabel.style.position = 'absolute';
      languageLabel.style.top = '0';
      languageLabel.style.right = '0';
      languageLabel.style.padding = '2px 8px';
      languageLabel.style.fontSize = '10px';
      languageLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
      languageLabel.style.color = '#6b7280';
      languageLabel.style.borderBottomLeftRadius = '6px';
      
      pre.style.position = 'relative';
      pre.appendChild(languageLabel);
    }
  });
}

/**
 * Saves an AI conversation (user question and AI response) to the database
 * @param {string} question - The user's question
 * @param {string} response - The AI's response
 * @return {Promise<boolean>} - Whether the save was successful
 */
async function saveAIConversation(question, response) {
  try {
    // Get current session and user info
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['activeSession', 'authState'], result => resolve(result));
    });
    
    if (!result.activeSession || !result.authState?.token) {
      console.error('No active session or auth token');
      return false;
    }
    
    // Extract session ID (handle both direct and nested structure)
    let sessionId;
    if (result.activeSession.data && result.activeSession.data.id) {
      sessionId = result.activeSession.data.id;
    } else if (result.activeSession.id) {
      sessionId = result.activeSession.id;
    } else {
      console.error('Missing sessionId in activeSession:', result.activeSession);
      return false;
    }
    
    // Make sure we have a valid user ID
    if (!result.authState?.user?.id) {
      console.error('Missing user ID');
      return false;
    }
    
    const userId = result.authState.user.id;
    const authToken = result.authState.token;
    
    console.log(`Saving AI conversation with sessionId: ${sessionId} userId: ${userId}`);
    
    // First, try to create a new chat directly rather than looking up first
    console.log('Creating new chat with payload:', {
      user_id: userId,
      session_id: sessionId,
      store_chat: true
    });
    
    const newChatResponse = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: 'http://localhost:3000/api/ai/chats',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: {
          session_id: sessionId,
          user_id: userId,
          store_chat: true
        }
      }, result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
    
    console.log('New chat creation response:', newChatResponse);
    
    let chatId;
    
    // Handle nested response structure
    if (newChatResponse && newChatResponse.ok) {
      if (newChatResponse.data && newChatResponse.data.id) {
        chatId = newChatResponse.data.id;
      } else if (newChatResponse.data && newChatResponse.data.data && newChatResponse.data.data.id) {
        chatId = newChatResponse.data.data.id;
      } else {
        console.error('Chat ID not found in response:', newChatResponse);
        return false;
      }
      console.log('Got chat with ID:', chatId);
    } else {
      console.error('Failed to create/get chat entry:', 
        newChatResponse?.error || 
        (newChatResponse ? 'Status: ' + newChatResponse.status : 'Unknown error'));
      return false;
    }
    
    if (!chatId) {
      console.error('No valid chatId obtained');
      return false;
    }
    
    console.log('Saving messages to chat ID:', chatId);
    
   // Now save the user's question
   const userMessageResponse = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: 'http://localhost:3000/api/ai/messages',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        chat_id: chatId,
        role: 'user',
        content: question
      }
    }, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
  
  console.log('User message save response:', userMessageResponse);
  
  if (!userMessageResponse || !userMessageResponse.ok) {
    console.error('Failed to save user message:', 
      userMessageResponse?.error || 
      (userMessageResponse ? 'Status: ' + userMessageResponse.status : 'Unknown error'));
    return false;
  }
  
  // And save the AI's response
  const aiMessageResponse = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: 'http://localhost:3000/api/ai/messages',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        chat_id: chatId,
        role: 'assistant',
        content: response
      }
    }, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
  
  console.log('AI message save response:', aiMessageResponse);
  
  if (!aiMessageResponse || !aiMessageResponse.ok) {
    console.error('Failed to save AI response:', 
      aiMessageResponse?.error || 
      (aiMessageResponse ? 'Status: ' + aiMessageResponse.status : 'Unknown error'));
    return false;
  }
  
  // Optional: Log the interaction for analytics
  try {
    await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: 'http://localhost:3000/api/ai/interactions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: {
          session_id: sessionId,
          question: question,
          answer: response,
          model_used: 'gemini'
        }
      }, result => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
    console.log('Analytics logged successfully');
  } catch (analyticsError) {
    // Just log analytics errors but don't fail the whole save
    console.warn('Failed to log AI interaction:', analyticsError);
  }
  
  console.log('AI conversation saved successfully');
  return true;
} catch (error) {
  console.error('Error saving AI conversation:', error);
  return false;
}
}

/**
* Loads previous AI conversations when joining a session
* @return {Promise<Array>} - Array of message objects
*/
async function loadPreviousAIConversations() {
try {
  // Get current session and user info
  const result = await new Promise(resolve => {
    chrome.storage.local.get(['activeSession', 'authState'], result => resolve(result));
  });
  
  if (!result.activeSession || !result.authState?.token) {
    console.error('No active session or auth token');
    return [];
  }
  
  // Extract session ID (handle both direct and nested structure)
  let sessionId;
  if (result.activeSession.data && result.activeSession.data.id) {
    sessionId = result.activeSession.data.id;
  } else if (result.activeSession.id) {
    sessionId = result.activeSession.id;
  } else {
    console.error('Missing sessionId in activeSession:', result.activeSession);
    return [];
  }
  
  const userId = result.authState.user.id;
  
  if (!sessionId || !userId) {
    console.error('Missing sessionId or userId');
    return [];
  }
  
  const authToken = result.authState.token;
  console.log(`Loading AI conversations for session ${sessionId}, user ${userId}`);
  
  // Get or create a chat for this session
  console.log('Getting or creating chat for user and session');
  const chatResponse = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: 'http://localhost:3000/api/ai/chats',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: {
        session_id: sessionId,
        user_id: userId,
        store_chat: true
      }
    }, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
  
  if (!chatResponse || !chatResponse.ok || !chatResponse.data) {
    console.log('No chat found or could not be created');
    return [];
  }
  
  // Extract the chat ID from the response
  let chatId;
  if (chatResponse.data.id) {
    chatId = chatResponse.data.id;
  } else if (chatResponse.data.data && chatResponse.data.data.id) {
    chatId = chatResponse.data.data.id;
  } else {
    console.error('Could not find chat ID in response:', chatResponse);
    return [];
  }
  
  console.log('Found/created chat with ID:', chatId);
  
  // Fetch messages for this chat
  const messagesResponse = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: 'API_REQUEST',
      url: `http://localhost:3000/api/ai/messages/${chatId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    }, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
  
  // Handle nested response structure
  let messages = [];
  if (messagesResponse && messagesResponse.ok) {
    if (Array.isArray(messagesResponse.data)) {
      messages = messagesResponse.data;
    } else if (messagesResponse.data && Array.isArray(messagesResponse.data.data)) {
      messages = messagesResponse.data.data;
    } else {
      console.log('No messages found or unexpected format:', 
                 typeof messagesResponse.data);
      return [];
    }
  } else {
    console.error('Failed to fetch messages:', 
                 messagesResponse?.error || 'Unknown error');
    return [];
  }
  
  console.log(`Loaded ${messages.length} messages from history`);
  
  // Return messages in chronological order
  return messages.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
} catch (error) {
  console.error('Error loading previous AI conversations:', error);
  return [];
}
}

/**
* Function to show standalone AI assistant modal
*/
function showStandaloneAIAssistant() {
const dashboardContainer = document.getElementById('lynkk-dashboard-container');
if (!dashboardContainer) return;

// Store original dashboard content for going back
const originalContent = dashboardContainer.innerHTML;

// Replace dashboard content with AI assistant UI
dashboardContainer.innerHTML = `
  <div style="display: flex; flex-direction: column; height: 100%; background-color: #f8fafc;">
    <!-- Header with no back button and reduced height -->
    <div style="background: linear-gradient(90deg, #28a745 0%, #34d058 100%); color: white; padding: 8px 16px; display: flex; justify-content: center; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 24px; height: 24px; background-color: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; justify-content: center; align-items: center; margin-right: 2px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="8.5" y1="8.5" x2="15.5" y2="15.5"></line><line x1="15.5" y1="8.5" x2="8.5" y2="15.5"></line><circle cx="12" cy="8" r="0.5" fill="currentColor"></circle><circle cx="12" cy="16" r="0.5" fill="currentColor"></circle><circle cx="16" cy="12" r="0.5" fill="currentColor"></circle><circle cx="8" cy="12" r="0.5" fill="currentColor"></circle></svg>
        </div>
        <div style="font-size: 15px; font-weight: 600;">AI Assistant</div>
      </div>
    </div>
    
    <!-- Chat messages area -->
    <div id="lynkk-standalone-messages" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
      <!-- Motivational quote message -->
      <div style="background-color: white; border-radius: 10px; padding: 16px; border-left: 4px solid #28a745; max-width: 90%; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          <div style="color: #28a745; font-size: 24px; line-height: 1;">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
          </div>
          <div style="flex: 1;">
            <p id="user-greeting" style="margin: 0 0 6px 0; color: #28a745; line-height: 1.5; font-size: 15px; font-weight: 500;">
              Hey ,
            </p>
            <p id="quote-text" style="margin: 0 0 4px 0; color: #4b5563; line-height: 1.5; font-size: 14px; font-style: italic; font-weight: 400;">
              "The beautiful thing about learning is that no one can take it away from you."
            </p>
            <p id="quote-author" style="margin: 0; color: #6b7280; line-height: 1.5; font-size: 12px; text-align: right; font-weight: 500;">
              — B.B. King
            </p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Input area -->
    <div style="padding: 12px; background: white; border-top: 1px solid #e2e8f0; display: flex; gap: 8px;">
      <input 
        id="lynkk-standalone-input" 
        type="text" 
        placeholder="Ask me anything..." 
        style="flex: 1; padding: 10px 14px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; transition: border-color 0.2s; outline: none;"
      />
      <button 
        id="lynkk-standalone-send" 
        style="background-color: #28a745; color: white; border: none; padding: 0 16px; border-radius: 6px; cursor: pointer; font-weight: 500; transition: all 0.2s ease; display: flex; align-items: center; justify-content: center;"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    </div>
  </div>
`;

// Keep track of conversation in this AI assistant
const standaloneConversation = [];

// Array of motivational quotes related to learning and education
const motivationalQuotes = [
  { text: "The beautiful thing about learning is that no one can take it away from you.", author: "B.B. King" },
  { text: "Education is not the filling of a pail, but the lighting of a fire.", author: "W.B. Yeats" },
  { text: "Live as if you were to die tomorrow. Learn as if you were to live forever.", author: "Mahatma Gandhi" },
  { text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.", author: "Dr. Seuss" },
  { text: "Develop a passion for learning. If you do, you will never cease to grow.", author: "Anthony J. D'Angelo" },
  { text: "The mind is not a vessel to be filled, but a fire to be kindled.", author: "Plutarch" },
  { text: "Curiosity is the wick in the candle of learning.", author: "William Arthur Ward" },
  { text: "The purpose of learning is growth, and our minds, unlike our bodies, can continue growing as we continue to live.", author: "Mortimer Adler" },
  { text: "I am still learning.", author: "Michelangelo at age 87" },
  { text: "The expert in anything was once a beginner.", author: "Helen Hayes" },
  { text: "Never let formal education get in the way of your learning.", author: "Mark Twain" },
  { text: "Tell me and I forget. Teach me and I remember. Involve me and I learn.", author: "Benjamin Franklin" },
  { text: "The only person who is educated is the one who has learned how to learn and change.", author: "Carl Rogers" },
  { text: "Education is not preparation for life; education is life itself.", author: "John Dewey" },
  { text: "The difference between school and life? In school, you're taught a lesson and then given a test. In life, you're given a test that teaches you a lesson.", author: "Tom Bodett" }
];

// Get user's first name from the currentUser variable
// Safely extract the first name, falling back to a default if not available
let userFirstName = "Explorer";
if (typeof currentUser !== 'undefined' && currentUser) {
  if (currentUser.firstName) {
    userFirstName = currentUser.firstName;
  } else if (currentUser.name) {
    // If only full name is available, extract first name
    userFirstName = currentUser.name.split(' ')[0];
  } else if (currentUser.email) {
    // If only email is available, use part before @ as username
    userFirstName = currentUser.email.split('@')[0];
  }
}

// Select a random quote
const randomQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];

// Generate a random greeting style
const greetings = [
  `Hey ${userFirstName},`,
  `Hi ${userFirstName},`,
  `${userFirstName},`,
  `Hello ${userFirstName},`,
  `Dear ${userFirstName},`
];

const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

// Update greeting and quote in the UI
document.getElementById('user-greeting').textContent = randomGreeting;
document.getElementById('quote-text').textContent = `"${randomQuote.text}"`;
document.getElementById('quote-author').textContent = `— ${randomQuote.author}`;

// Focus input field
const inputField = document.getElementById('lynkk-standalone-input');
setTimeout(() => {
  if (inputField) inputField.focus();
}, 100);

// Send button event
document.getElementById('lynkk-standalone-send').addEventListener('click', () => {
  sendStandaloneMessage();
});

// Enter key to send
inputField.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendStandaloneMessage();
  }
});

// Add hover effect for send button
const sendBtn = document.getElementById('lynkk-standalone-send');
sendBtn.addEventListener('mouseenter', () => {
  sendBtn.style.backgroundColor = '#218838';
  sendBtn.style.transform = 'translateY(-1px)';
});

sendBtn.addEventListener('mouseleave', () => {
  sendBtn.style.backgroundColor = '#28a745';
  sendBtn.style.transform = 'translateY(0)';
});

// Add focus effect for input
inputField.addEventListener('focus', () => {
  inputField.style.borderColor = '#28a745';
});

inputField.addEventListener('blur', () => {
  inputField.style.borderColor = '#d1d5db';
});

// Send message function
function sendStandaloneMessage() {
  const messageText = inputField.value.trim();
  if (!messageText) return;
  
  // Clear input
  inputField.value = '';
  
  // Add user message to UI
  addMessageToUI(messageText, true);
  
  // Add to conversation history
  standaloneConversation.push({
    role: 'user',
    content: messageText
  });
  
  // Show loading indicator
  const messagesContainer = document.getElementById('lynkk-standalone-messages');
  const loadingId = 'loading-' + Date.now();
  const loadingMessage = document.createElement('div');
  loadingMessage.id = loadingId;
  loadingMessage.style.backgroundColor = 'white';
  loadingMessage.style.borderRadius = '10px';
  loadingMessage.style.padding = '14px';
  loadingMessage.style.borderLeft = '4px solid #28a745';
  loadingMessage.style.maxWidth = '90%';
  loadingMessage.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
  loadingMessage.style.alignSelf = 'flex-start';
  
  loadingMessage.innerHTML = `
    <div style="font-weight: 600; color: #28a745; margin-bottom: 6px; font-size: 14px; display: flex; align-items: center; gap: 6px;">
      <div>AI Assistant</div>
      <div class="typing-dots" style="display: flex; gap: 4px; align-items: center;">
        <span style="width: 5px; height: 5px; background-color: #28a745; border-radius: 50%; animation: typing-bounce 1.4s infinite ease-in-out both;"></span>
        <span style="width: 5px; height: 5px; background-color: #28a745; border-radius: 50%; animation: typing-bounce 1.4s infinite ease-in-out 0.2s both;"></span>
        <span style="width: 5px; height: 5px; background-color: #28a745; border-radius: 50%; animation: typing-bounce 1.4s infinite ease-in-out 0.4s both;"></span>
      </div>
    </div>
  `;
  
  // Add animation if not already added
  if (!document.getElementById('typing-animation-style')) {
    const animStyle = document.createElement('style');
    animStyle.id = 'typing-animation-style';
    animStyle.textContent = `
      @keyframes typing-bounce {
        0%, 80%, 100% { transform: scale(0.6); }
        40% { transform: scale(1); }
      }
    `;
    document.head.appendChild(animStyle);
  }
  
  messagesContainer.appendChild(loadingMessage);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  // Prepare the request payload
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: "You are a helpful AI assistant for teachers and students. You're currently in a general conversation, not tied to any specific class session." }
        ]
      },
      {
        role: "model",
        parts: [
          { text: "I understand my role as a general AI assistant for educational purposes. I'll provide helpful, accurate information for both teachers and students, without assuming any specific class context. How can I help you today?" }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 800,
    }
  };
  
  // Add conversation history (up to last 5 messages)
  const recentMessages = standaloneConversation.slice(-5);
  recentMessages.forEach(msg => {
    payload.contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  });
  
  // Send to Gemini API
  chrome.runtime.sendMessage({
    type: 'GEMINI_API_REQUEST',
    payload
  }, result => {
    // Remove loading indicator
    const loadingElement = document.getElementById(loadingId);
    if (loadingElement) loadingElement.remove();
    
    if (!result || !result.success) {
      // Show error message
      addMessageToUI("I'm sorry, I encountered an error while processing your request. Please try again later.", false);
      console.error("Error from Gemini API:", result?.error);
      return;
    }
    
    // Extract response
    let aiResponse = "I'm sorry, I couldn't generate a response at this time.";
    
    if (result.data?.candidates && 
        result.data.candidates.length > 0 && 
        result.data.candidates[0].content?.parts?.[0]?.text) {
      aiResponse = result.data.candidates[0].content.parts[0].text;
      
      // Add to conversation history
      standaloneConversation.push({
        role: 'assistant',
        content: aiResponse
      });
    }
    
    // Display response
    addMessageToUI(aiResponse, false);
  });
}

// Function to add message to UI
function addMessageToUI(message, isUser) {
  const messagesContainer = document.getElementById('lynkk-standalone-messages');
  const messageEl = document.createElement('div');
  
  if (isUser) {
    messageEl.style.backgroundColor = '#f0f9ff';
    messageEl.style.borderRadius = '10px';
    messageEl.style.padding = '14px';
    messageEl.style.borderRight = '4px solid #4a66dd';
    messageEl.style.maxWidth = '90%';
    messageEl.style.alignSelf = 'flex-end';
    messageEl.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
    
    messageEl.innerHTML = `
      <div style="font-weight: 600; color: #4a66dd; margin-bottom: 6px; font-size: 14px;">You</div>
      <p style="margin: 0; color: #334155; line-height: 1.5; font-size: 13px;">${message}</p>
    `;
  } else {
    messageEl.style.backgroundColor = 'white';
    messageEl.style.borderRadius = '10px';
    messageEl.style.padding = '14px';
    messageEl.style.borderLeft = '4px solid #28a745';
    messageEl.style.maxWidth = '90%';
    messageEl.style.alignSelf = 'flex-start';
    messageEl.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
    
    // Process markdown-like formatting
    const formattedText = message
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
      .replace(/`(.*?)`/g, '<code style="background: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace;">$1</code>') // Code
      .replace(/\n\n/g, '</p><p>') // Paragraphs
      .replace(/\n/g, '<br>'); // Line breaks
    
    messageEl.innerHTML = `
      <div style="font-weight: 600; color: #28a745; margin-bottom: 6px; font-size: 14px;">AI Assistant</div>
      <p style="margin: 0; color: #334155; line-height: 1.5; font-size: 13px;">${formattedText}</p>
    `;
  }
  
  messagesContainer.appendChild(messageEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
}

// ==================== CHAT & MESSAGE FUNCTIONS ====================


/**
* Renders chat messages with improved styling
* @param {Array} messages - The messages to render
*/
function renderChatMessages(messages) {
const messagesContainer = document.getElementById('lynkk-messages-container');
if (!messagesContainer) return;

if (!messages || messages.length === 0) {
  messagesContainer.innerHTML = '<p style="text-align: center; color: #6b7280; padding: 20px; font-size: 14px;">No messages yet. Start the conversation!</p>';
  return;
}

// Get current user for message styling (my messages vs others)
chrome.storage.local.get(['authState'], (result) => {
  const currentUser = result.authState && result.authState.user ? result.authState.user : null;
  const currentUserId = currentUser ? currentUser.id : null;
  
  let html = '';
  
  messages.forEach(message => {
    const isMyMessage = message.sender_id === currentUserId;
    const isProfessor = message.type === 'professor';
    
    // Different styling based on message sender
    const messageAlignment = isMyMessage ? 'flex-end' : 'flex-start';
    const messageBgColor = isMyMessage ? '#4a66dd' : (isProfessor ? '#6c5ce7' : '#f3f4f6');
    const messageTextColor = isMyMessage || isProfessor ? 'white' : '#111827';
    
    // Format timestamp
    const messageDate = new Date(message.created_at);
    const formattedTime = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    html += `
      <div style="display: flex; flex-direction: column; align-items: ${messageAlignment}; margin-bottom: 12px;">
        <div style="max-width: 80%; background-color: ${messageBgColor}; color: ${messageTextColor}; padding: 10px 12px; border-radius: 12px; word-break: break-word;">
          ${isProfessor ? '<div style="font-size: 11px; opacity: 0.8; margin-bottom: 2px;">Professor</div>' : ''}
          <div style="font-size: 13px; font-weight: ${isProfessor ? '500' : 'normal'}">${message.content}</div>
        </div>
        <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
          ${message.sender_name} • ${formattedTime}
        </div>
      </div>
    `;
  });
  
  messagesContainer.innerHTML = html;
  
  // Scroll to the bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});
}

/**
 * Function to send message in class chat
 */
async function sendMessage() {
    const chatInput = document.getElementById('lynkk-chat-input');
    const message = chatInput.value.trim();
    
    const authToken = await getAuthToken();
    
    if (!authToken) {
      console.error('No auth token available');
      showToast('Authentication error - please log in again', 'error');
      return;
    }
  
    if (!message) return;
    
    try {
      // Get active session
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['activeSession'], result => resolve(result));
      });
      
      if (!result.activeSession || (!result.activeSession.id && !result.activeSession?.data?.id)) {
        console.error('No active session or session ID is missing');
        showToast('Session error - missing session ID. Please refresh', 'error');
        return;
      }
  
      // Handle nested data structure
      const sessionData = result.activeSession?.data;
      
      // Get session ID from either direct or nested structure
      const sessionId = sessionData?.id || result.activeSession.id;
  
      if (!sessionId) {
        console.error('No session ID found');
        showToast('Session error - missing session ID. Please refresh', 'error');
        return;
      }
      
      // Get auth token
      const authToken = await getAuthToken();
  
      if(!authToken) {
        console.error('No auth token available');
        showToast('Authentication error - please log in again', 'error');
        return;
      }
  
      // Get user information for the message
      const authState = await new Promise(resolve => {
        chrome.storage.local.get(['authState'], result => resolve(result.authState || {}));
      });
       
      const userId = authState.user.id;
      const userName = authState.user.username || authState.user.full_name || 'User';
      
      if (!userId) {
        console.error('User ID not found');
        showToast('Authentication error - user information missing', 'error');
        return;
      }
  
      // Generate a unique ID for this message
      const tempMessageId = 'temp-' + Date.now();
      
      // Clear input right away for better UX
      chatInput.value = '';
      
      // Optimistically render the message
      const messagesContainer = document.getElementById('lynkk-messages-container');
      if (messagesContainer) {
        const tempMessage = document.createElement('div');
        tempMessage.id = tempMessageId;
        tempMessage.style.display = 'flex';
        tempMessage.style.flexDirection = 'column';
        tempMessage.style.alignItems = 'flex-end';
        tempMessage.style.marginBottom = '12px';
        
        tempMessage.innerHTML = `
          <div style="max-width: 80%; background-color: #4a66dd; color: white; padding: 10px 12px; border-radius: 12px; word-break: break-word; opacity: 0.7;">
            <div style="font-size: 13px;">${message}</div>
          </div>
          <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
            You • Sending...
          </div>
        `;
        
        messagesContainer.appendChild(tempMessage);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
      
      // Prepare message data - match backend expectations
      const messageData = {
        content: message,
        type: 'public'
      };
      
      // Send message to server
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        url: `http://localhost:3000/api/sessions/${sessionId}/messages`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: messageData
      }, (response) => {
        console.log('Complete response from server:', response);
        
        // Handle response
        try {
          if (!response.ok || response.error) {
            console.error('Error sending message:', response.error || 'Unknown error');
            
            // Show error message to user
            showToast('Failed to send message. Please try again.', 'error');
            
            // Put the message back in the input
            chatInput.value = message;
            
            // Remove the temporary message
            const tempMessage = document.getElementById(tempMessageId);
            if (tempMessage && tempMessage.parentNode) {
              tempMessage.parentNode.removeChild(tempMessage);
            }
            
            return;
          }
          
          console.log('Message sent successfully:', response.data);
          
          // Get the current messages from storage
          chrome.storage.local.get(['sessionMessages'], (msgResult) => {
            const messages = msgResult.sessionMessages || [];
            
            // Add new message to array
            if (response.data) {
              messages.push(response.data);
            }
            
            // Store updated messages
            chrome.storage.local.set({ sessionMessages: messages }, () => {
              // Remove the temporary message
              const tempMessage = document.getElementById(tempMessageId);
              if (tempMessage) {
                tempMessage.remove();
              }
              
              // Render all messages
              renderChatMessages(messages);
            });
          });
        } catch (error) {
          console.error('Error handling response:', error);
          
          // Remove the temporary message in case of any error
          const tempMessage = document.getElementById(tempMessageId);
          if (tempMessage) {
            tempMessage.remove();
          }
          
          showToast('An error occurred while sending your message', 'error');
        }
      });
    } catch (error) {
      console.error('Error in sendMessage:', error);
      showToast('An unexpected error occurred', 'error');
    }
  }
  
    // ==================== ANONYMOUS QUESTION Dashboard FUNCTIONS ====================
    
 
  
  // ==================== POLL FUNCTIONS ====================
  
  /**
   * Function to show create poll modal
   */
  function showCreatePollModal() {
    // Remove any existing modal
    const existingModal = document.getElementById('lynkk-create-poll-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Create modal container
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'lynkk-create-poll-modal';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.zIndex = '10000';
    
    // Create modal content
    modalOverlay.innerHTML = `
      <div style="background: white; width: 90%; max-width: 500px; border-radius: 8px; padding: 20px; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #111827;">Create New Poll</h3>
          <button id="lynkk-modal-close" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; line-height: 1; color: #6b7280;">×</button>
        </div>
        
        <div style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; color: #374151;">Question</label>
          <input 
            id="lynkk-poll-question" 
            type="text" 
            style="width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
            placeholder="Enter your poll question"
          />
        </div>
        
        <div style="margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <label style="font-weight: 500; font-size: 14px; color: #374151;">Options</label>
            <button 
              id="lynkk-add-option"
              style="background: none; border: none; color: #4a66dd; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 4px;"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Option
            </button>
          </div>
          
          <div id="lynkk-poll-options">
            <div class="poll-option" style="display: flex; gap: 8px; margin-bottom: 8px;">
              <input 
                type="text" 
                class="poll-option-input"
                style="flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
                placeholder="Option 1"
              />
              <button class="remove-option" style="visibility: hidden; background: none; border: none; color: #ef4444; cursor: pointer; padding: 0 6px;">×</button>
            </div>
            <div class="poll-option" style="display: flex; gap: 8px; margin-bottom: 8px;">
              <input 
                type="text" 
                class="poll-option-input"
                style="flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
                placeholder="Option 2"
              />
              <button class="remove-option" style="visibility: hidden; background: none; border: none; color: #ef4444; cursor: pointer; padding: 0 6px;">×</button>
            </div>
          </div>
        </div>
        
        <button 
          id="lynkk-create-poll" 
          style="width: 100%; padding: 12px; background-color: #4a66dd; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          <span>Create Poll</span>
        </button>
      </div>
    `;
    
    document.body.appendChild(modalOverlay);
    
    // Add event listeners
    document.getElementById('lynkk-modal-close').addEventListener('click', () => {
      modalOverlay.remove();
    });
    
    // Close modal when clicking outside
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
      }
    });
    
    // Add option button
    document.getElementById('lynkk-add-option').addEventListener('click', () => {
      const optionsContainer = document.getElementById('lynkk-poll-options');
      const optionCount = optionsContainer.querySelectorAll('.poll-option').length + 1;
      
      const optionDiv = document.createElement('div');
      optionDiv.className = 'poll-option';
      optionDiv.style.display = 'flex';
      optionDiv.style.gap = '8px';
      optionDiv.style.marginBottom = '8px';
      
      optionDiv.innerHTML = `
        <input 
          type="text" 
          class="poll-option-input"
          style="flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;"
          placeholder="Option ${optionCount}"
        />
        <button class="remove-option" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0 6px;">×</button>
      `;
      
      optionsContainer.appendChild(optionDiv);
      
      // Add event listener to the remove button
      optionDiv.querySelector('.remove-option').addEventListener('click', () => {
        optionDiv.remove();
        updateRemoveButtons();
      });
      
      updateRemoveButtons();
      
      // Focus the new input
      optionDiv.querySelector('input').focus();
    });
    
    // Initial setup for remove buttons
    const updateRemoveButtons = () => {
      const options = document.querySelectorAll('.poll-option');
      options.forEach((option, index) => {
        const removeButton = option.querySelector('.remove-option');
        if (options.length <= 2) {
          removeButton.style.visibility = 'hidden';
        } else {
          removeButton.style.visibility = 'visible';
        }
      });
    };
    
    // Add event listeners to initial remove buttons
    document.querySelectorAll('.remove-option').forEach(button => {
      button.addEventListener('click', () => {
        button.closest('.poll-option').remove();
        updateRemoveButtons();
      });
    });
    
    updateRemoveButtons();
    
    // Create poll button
    document.getElementById('lynkk-create-poll').addEventListener('click', createPoll);
    
    // Focus on question input
    document.getElementById('lynkk-poll-question').focus();
  }
  
  /**
   * Function to create poll
   */
  async function createPoll() {
    const questionInput = document.getElementById('lynkk-poll-question');
    const question = questionInput.value.trim();
    
    if (!question) {
      showToast('Please enter a poll question', 'error');
      questionInput.focus();
      return;
    }
    
    // Collect options
    const optionInputs = document.querySelectorAll('.poll-option-input');
    const options = [];
    
    optionInputs.forEach(input => {
      const option = input.value.trim();
      if (option) {
        options.push(option);
      }
    });
    
    if (options.length < 2) {
      showToast('Please enter at least two poll options', 'error');
      return;
    }
    
    // Get active session and auth token
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['activeSession', 'authState'], result => resolve(result));
    });
    
    const activeSession = result.activeSession;
    const authState = result.authState || {};
  
    if (!activeSession || !authState.token) {
      console.error('No active session or auth token');
      showToast('Session error - please refresh', 'error');
      return;
    }
    
    // Show loading state
    const createButton = document.getElementById('lynkk-create-poll');
    const originalButtonText = createButton.innerHTML;
    createButton.innerHTML = `
      <div class="loading-spinner" style="border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; width: 16px; height: 16px; animation: spin 1s linear infinite;"></div>
      <span>Creating...</span>
    `;
    createButton.disabled = true;
    
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({
          type: 'API_REQUEST',
          url: `http://localhost:3000/api/sessions/${activeSession.id}/polls`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authState.token}`
          },
          body: {
            question,
            options
          }
        }, resolve);
      });
  
      if (!response.ok || response.error) {
        throw new Error(response.error || 'Failed to create poll');
      }
  
      console.log('Poll created successfully:', response.data);
      
      // Close the modal
      const modal = document.getElementById('lynkk-create-poll-modal');
      if (modal) {
        modal.remove();
      }
      
      // Show success toast
      showToast('Poll created successfully!', 'success');
      
      // Update polls list
      const currentPolls = await new Promise(resolve => {
        chrome.storage.local.get(['sessionPolls'], result => resolve(result.sessionPolls || []));
      });
      
      // Add new poll to the array
      currentPolls.unshift(response.data);
      
      // Update storage and UI
      chrome.storage.local.set({ sessionPolls: currentPolls }, () => {
        // If we're currently on the polls tab, refresh it
        const activeTab = document.getElementById('lynkk-polls-tab');
        if (activeTab && activeTab.style.backgroundColor === '#4a66dd') {
          renderPolls(currentPolls);
        } else {
          // Switch to polls tab to show the new poll
          showTab('polls');
        }
      });
    } catch (error) {
      console.error('Error creating poll:', error);
      createButton.innerHTML = originalButtonText;
      createButton.disabled = false;
      showToast(`Error: ${error.message}`, 'error');
    }
  }
  
  /**
   * Function to render polls with improved styling
   * @param {Array} polls - The polls to render
   */
  function renderPolls(polls) {
    const container = document.getElementById('lynkk-polls-list');
    
    if (!container) return;
    
    // Check if polls is a valid array before proceeding
    if (!polls || !Array.isArray(polls)) {
      console.warn('Polls is not an array:', polls);
      container.innerHTML = `
        <div class="lynkk-empty-state">No polls available for this session.</div>
      `;
      return;
    }
    
    // Clear container
    container.innerHTML = '';
    
    // Display all polls
    polls.forEach(poll => {
      const element = document.createElement('div');
      element.className = 'lynkk-poll';
      
      // Create options HTML
      let optionsHtml = '';
      if (poll.options && Array.isArray(poll.options) && poll.options.length) {
        poll.options.forEach(option => {
          const percentage = poll.totalVotes > 0 
            ? Math.round((option.votes / poll.totalVotes) * 100) 
            : 0;
            
          optionsHtml += `
            <div class="lynkk-poll-option" data-poll-id="${poll.id}" data-option-id="${option.id}">
              <div class="lynkk-poll-option-label">
                <input type="radio" name="poll_${poll.id}" id="option_${option.id}" ${option.selected ? 'checked' : ''}>
                <label for="option_${option.id}">${option.text}</label>
              </div>
              <div class="lynkk-poll-option-stats">
                <div class="lynkk-poll-option-bar" style="width: ${percentage}%"></div>
                <span class="lynkk-poll-option-percentage">${percentage}%</span>
              </div>
            </div>
          `;
        });
      }
      
      element.innerHTML = `
        <div class="lynkk-poll-header">
          <h3 class="lynkk-poll-question">${poll.question}</h3>
          <div class="lynkk-poll-meta">
            <span class="lynkk-poll-votes">${poll.totalVotes || 0} votes</span>
            <span class="lynkk-poll-time">${formatTime(poll.createdAt || poll.created_at)}</span>
          </div>
        </div>
        <div class="lynkk-poll-options">
          ${optionsHtml}
        </div>
        <div class="lynkk-poll-footer">
          <button class="lynkk-poll-vote-btn" data-poll-id="${poll.id}">Vote</button>
        </div>
      `;
      
      container.appendChild(element);
      
      // Add event listener for voting
      const voteButton = element.querySelector('.lynkk-poll-vote-btn');
      if (voteButton) {
        voteButton.addEventListener('click', () => {
          const pollId = voteButton.getAttribute('data-poll-id');
          const selectedOption = element.querySelector(`input[name="poll_${pollId}"]:checked`);
          
          if (selectedOption) {
            const optionId = selectedOption.id.replace('option_', '');
            submitVote(pollId, optionId);
          } else {
            // Show error if no option selected
            alert('Please select an option before submitting.');
          }
        });
      }
    });
    
    // Add styles for polls if not already present
    if (!document.querySelector('.lynkk-poll-styles')) {
      const styles = document.createElement('style');
      styles.className = 'lynkk-poll-styles';
      styles.textContent = `
        .lynkk-poll {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 16px;
          overflow: hidden;
        }
        
        .lynkk-poll-header {
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .lynkk-poll-question {
          font-size: 15px;
          font-weight: 600;
          color: #0f172a;
          margin: 0 0 8px 0;
        }
        
        .lynkk-poll-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #64748b;
        }
        
        .lynkk-poll-options {
          padding: 12px 16px;
        }
        
        .lynkk-poll-option {
          margin-bottom: 10px;
        }
        
        .lynkk-poll-option-label {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
          font-size: 13px;
        }
        
        .lynkk-poll-option-stats {
          height: 6px;
          background: #f1f5f9;
          border-radius: 3px;
          position: relative;
          margin-left: 24px;
          margin-top: 4px;
        }
        
        .lynkk-poll-option-bar {
          height: 100%;
          background: #6366f1;
          border-radius: 3px;
          min-width: 4px;
        }
        
        .lynkk-poll-option-percentage {
          position: absolute;
          right: 0;
          top: -18px;
          font-size: 11px;
          color: #64748b;
        }
        
        .lynkk-poll-footer {
          padding: 12px 16px;
          border-top: 1px solid #e2e8f0;
          text-align: right;
        }
        
        .lynkk-poll-vote-btn {
          background: #6366f1;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
        }
        
        .lynkk-poll-vote-btn:hover {
          background: #4f46e5;
        }
        
        .lynkk-empty-state {
          text-align: center;
          color: #94a3b8;
          padding: 15px;
          font-size: 13px;
        }
      `;
      document.head.appendChild(styles);
    }
  }
  
  /**
   * Function to submit poll answers with improved UI
   * @param {string} pollId - The poll ID
   * @param {string} optionId - The option ID
   */
  async function submitVote(pollId, optionId) {
    console.log(`Submitting answer for poll ${pollId}, option ${optionId}`);
    
    // Get active session and auth token
    const result = await new Promise(resolve => {
      chrome.storage.local.get(['activeSession', 'authState'], result => resolve(result));
    });
    
    const activeSession = result.activeSession;
    const authState = result.authState || {};
  
    if (!activeSession || !authState.token) {
      console.error('No active session or auth token');
      return;
    }
    
    // Show loading state
    const pollContainer = document.querySelector(`.lynkk-poll button[data-poll-id="${pollId}"]`).closest('.lynkk-poll');
    const submitButton = document.querySelector(`.lynkk-poll button[data-poll-id="${pollId}"]`);
    
    if (submitButton) {
      const originalText = submitButton.textContent;
      submitButton.innerHTML = `
        <span class="spinner" style="display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s linear infinite; margin-right: 6px;"></span>
        Submitting...
      `;
      submitButton.disabled = true;
      
      try {
        const response = await new Promise(resolve => {
          chrome.runtime.sendMessage({
            type: 'API_REQUEST',
            url: `http://localhost:3000/api/sessions/${activeSession.id}/polls/${pollId}/answers`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authState.token}`
            },
            body: {
              option_index: optionId
            }
          }, resolve);
        });
    
        if (!response.ok || response.error) {
          throw new Error(response.error || 'Failed to submit poll answer');
        }
    
        console.log('Poll answer submitted successfully:', response.data);
        
        // Update the poll UI to show it's been answered
        if (pollContainer) {
          // Apply a "voted" style to the selected option
          const selectedOptionLabel = pollContainer.querySelector(`input[value="${optionId}"]`).closest('label');
          if (selectedOptionLabel) {
            selectedOptionLabel.style.backgroundColor = '#f0f7ff';
            selectedOptionLabel.style.padding = '8px 12px';
            selectedOptionLabel.style.borderRadius = '6px';
            selectedOptionLabel.style.border = '1px solid #4a66dd';
            selectedOptionLabel.style.fontWeight = '500';
          }
          
          // Update button
          submitButton.textContent = 'Submitted ✓';
          submitButton.style.backgroundColor = '#4CAF50';
          
          // Disable all poll options for this poll
          const pollOptions = pollContainer.querySelectorAll('input[type="radio"]');
          pollOptions.forEach(option => {
            option.disabled = true;
          });
          
          // Show poll results if available in the response
          if (response.data && response.data.results) {
            const results = response.data.results;
            const totalVotes = results.reduce((sum, count) => sum + count, 0);
            
            // Add result percentages below each option
            pollContainer.querySelectorAll('label').forEach((label, idx) => {
                const votes = results[idx] || 0;
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            
            // Create or update the percentage display
            let percentElem = label.querySelector('.poll-percentage');
            if (!percentElem) {
              percentElem = document.createElement('div');
              percentElem.className = 'poll-percentage';
              percentElem.style.fontSize = '12px';
              percentElem.style.color = '#6b7280';
              percentElem.style.marginTop = '4px';
              label.appendChild(percentElem);
            }
            
            percentElem.textContent = `${percentage}% (${votes} vote${votes !== 1 ? 's' : ''})`;
            
            // Add a progress bar
            let progressBar = label.querySelector('.poll-progress');
            if (!progressBar) {
              progressBar = document.createElement('div');
              progressBar.className = 'poll-progress';
              progressBar.style.height = '4px';
              progressBar.style.backgroundColor = '#e5e7eb';
              progressBar.style.borderRadius = '2px';
              progressBar.style.marginTop = '6px';
              progressBar.style.overflow = 'hidden';
              label.appendChild(progressBar);
              
              const progress = document.createElement('div');
              progress.style.height = '100%';
              progress.style.backgroundColor = '#4a66dd';
              progress.style.width = '0%';
              progress.style.transition = 'width 0.5s ease';
              progressBar.appendChild(progress);
            }
            
            // Animate the progress bar
            setTimeout(() => {
              progressBar.querySelector('div').style.width = `${percentage}%`;
            }, 100);
          });
          
          // Add total votes info
          let totalElement = pollContainer.querySelector('.poll-total');
          if (!totalElement) {
            totalElement = document.createElement('div');
            totalElement.className = 'poll-total';
            totalElement.style.fontSize = '12px';
            totalElement.style.color = '#6b7280';
            totalElement.style.marginTop = '15px';
            totalElement.style.textAlign = 'right';
            pollContainer.appendChild(totalElement);
          }
          
          totalElement.textContent = `Total votes: ${totalVotes}`;
        }
      }
      
      // Show success toast
      showToast('Vote submitted successfully!', 'success');
    } catch (error) {
      console.error('Error submitting poll answer:', error);
      submitButton.textContent = originalText;
      submitButton.disabled = false;
      showToast(`Error: ${error.message}`, 'error');
    }
  }
}

/**
 * Helper function to safely extract data from API responses with different structures
 * @param {Object} response - The API response object
 * @param {string} dataType - Description of what we're extracting (for logging)
 * @returns {Array|Object} The extracted data
 */
function extractDataFromResponse(response, dataType = 'data') {
    if (!response) {
      console.warn(`No response received for ${dataType}`);
      return null;
    }
    
    if (!response.ok) {
      console.error(`API error for ${dataType}:`, response.error || 'Unknown error');
      return null;
    }
    
    // Try to extract data from different response structures
    if (!response.data) {
      console.warn(`No data in response for ${dataType}`);
      return null;
    }
    
    // Handle different response structures
    if (Array.isArray(response.data)) {
      return response.data;
    } else if (response.data.data && Array.isArray(response.data.data)) {
      return response.data.data;
    } else if (typeof response.data === 'object' && !Array.isArray(response.data)) {
      // If it's a single object, return it directly
      return response.data;
    } else if (response.data.data && typeof response.data.data === 'object') {
      return response.data.data;
    }
    
    console.warn(`Unexpected response structure for ${dataType}:`, response.data);
    return response.data; // Return whatever we have as a fallback
  }

// ==================== EXTENSION INITIALIZATION ====================

/**
 * Initialize the extension
 */
function initializeExtension() {
  if (isInitialized) return;
  
  checkAuthState();
  createDraggableChatButton();
  
  // Add window resize listener to reposition chat if needed
  window.addEventListener('resize', () => {
    if (chatContainerCreated && document.getElementById('lynkk-chat-container').style.display !== 'none') {
      const button = document.getElementById('lynkk-float-button');
      if (button) {
        positionChatContainer(button);
      }
    }
  });
  
  isInitialized = true;
  console.log('Extension initialized successfully');
}

/**
 * Initialize chat interface
 */
function initializeChatInterface() {
  createDraggableChatButton();
  
  // Add window resize listener to reposition chat if needed
  window.addEventListener('resize', () => {
    if (chatContainerCreated && document.getElementById('lynkk-chat-container').style.display !== 'none') {
      const button = document.getElementById('lynkk-float-button');
      if (button) {
        positionChatContainer(button);
      }
    }
  });
}

// ==================== MESSAGE LISTENERS ====================

// Listen for auth changes and commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'AUTH_CHANGED') {
    currentUser = message.authState.isLoggedIn ? message.authState.user : null;
    console.log('Auth state updated:', currentUser);
    
    // Update chat UI if it exists
    if (chatContainerCreated) {
      updateChatUI();
    }
    
    // If the floating button exists, update its appearance
    updateDraggableButton();
    
    // Send response to acknowledge receipt
    sendResponse({ success: true });
  }
  
  if (message.type === 'OPEN_CHAT') {
    if (currentUser) {
      if (!chatContainerCreated) {
        initializeChatInterface();
      }
      if (!chatVisible) {
        toggleChat();
      }
      sendResponse({ success: true });
    } else {
      showAuthRequiredMessage();
      sendResponse({ success: false, reason: 'not_authenticated' });
    }
  }
  
  return true; // Keep the message channel open for async responses
});

// Call immediately
initializeExtension();

// Also initialize on page load (for safety)
window.addEventListener('load', function() {
  console.log('Page loaded, ensuring components are initialized');
  initializeExtension();
});

// Initialize Gemini AI with session context if available
chrome.storage.local.get(['activeSession'], (result) => {
  if (result.activeSession) {
    initGeminiContext(result.activeSession);
  }
});

// At the very bottom of your file
function testAnonymousDashboard() {
  chrome.storage.local.get(['activeSession', 'authState'], (result) => {
    if (result.activeSession && result.authState && result.authState.token) {
      const sessionId = result.activeSession.id;
      const authToken = result.authState.token;
      
      console.log('=========== TEST DASHBOARD ===========');
      console.log('Session ID:', sessionId);
      console.log('Auth Token exists:', !!authToken);
      
      // Force initialize
      initializeAnonymousQuestionDashboard(sessionId, authToken);
      
      // Log key elements
      setTimeout(() => {
        console.log('Anonymous tabs found:', document.querySelectorAll('.anon-tab').length);
        console.log('Class questions container:', document.getElementById('lynkk-class-questions'));
        console.log('Student questions container:', document.getElementById('lynkk-student-questions-history-container'));
      }, 500);
    } else {
      console.error('No session data found for testing');
    }
  });
}

// Expose to console for manual testing
window.testAnonymousDashboard = testAnonymousDashboard;