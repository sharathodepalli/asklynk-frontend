# AskLynk Chrome Extension Frontend Documentation

## Project ### AI Assistant Integration

The AI assistant provides smart educational support:

- Context-aware responses based on session content
- Message history preservation
- Code syntax highlighting
- Markdown rendering
- Session-specific knowledge

### 5. Voice Capture & Transcript Processing

The Smart Continuous Voice Capture system automatically records and processes live lecture content with intelligent handling of natural speech patterns:

- **Smart Continuous Recognition**: Never stops due to silence - automatically restarts after any interruption
- **Intelligent Gap Handling**: Handles natural lecture pauses (questions, demonstrations, thinking breaks)
- **Exponential Backoff Restart**: Smart error recovery with progressive delay increases
- **Manual Pause/Resume Control**: Professors can pause and resume capture as needed
- **Activity Monitoring**: Tracks voice activity and notifies about prolonged silence without stopping
- **Chunked Processing**: Processes voice in 7-second intervals for optimal performance
- **Background Embeddings**: Converts transcript chunks to vector embeddings for semantic search
- **Database Storage**: Stores transcripts with session context for future retrieval
- **Authenticated Processing**: Uses Supabase user session tokens for secure data handling
- **Cross-platform Support**: Works on Google Meet and other supported classroom platforms
  AskLynk is a powerful Chrome Extension designed to enhance classroom interactions between professors and students. It enables anonymous question submission, real-time classroom discussions, AI-powered assistance, and polling functionality.

## Tech Stack

- **Core Technologies**: JavaScript, HTML, CSS
- **Extension Framework**: Chrome Extension Manifest V3
- **Backend Connection**: REST API via background script messaging
- **Authentication**: JWT-based auth via Supabase
- **AI Integration**: Google Gemini API
- **Storage**: Chrome Storage API (sync and local)

## Architecture Overview

The extension follows a modular architecture with these main components:

1. **Content Script (`content.js`)**: Injects UI components into web pages and handles user interactions
2. **Background Script (`background.js`)**: Manages authentication, API requests, and cross-context communication
3. **Popup UI (`popup.html`, `popup.jsx`)**: Provides quick access to extension functions
4. **Supabase Integration (`supabase.js`)**: Handles authentication and database interactions

## Key Components & Features

### 1. User Interface Components

The UI is dynamically generated and injected into web pages:

- **Floating Button**: Main entry point for the extension
- **Chat Container**: Houses all dashboard components
- **Dashboard Tabs**: AI Assistant, Chat, Anonymous Questions, Polls
- **Session Management**: Creation and joining for professors and students
- **Authentication Flow**: Login/logout functionality

### 2. Role-Based User Experience

#### Professor Experience

- Create and manage classroom sessions
- View and resolve anonymous questions
- Create and administer polls
- Access session analytics
- Utilize AI teaching assistant

#### Student Experience

- Join sessions with a session code
- Submit anonymous or identified questions
- Participate in polls
- Access AI study assistant

### 3. Anonymous Question System

The anonymous question system ensures students can ask questions without fear of judgment:

- Consistent anonymous identities within a session
- Question submission and management
- Real-time updates of questions
- Question resolution by professors

### 4. AI Assistant Integration

The AI assistant provides smart educational support:

- Context-aware responses based on session content
- Message history preservation
- Code syntax highlighting
- Markdown rendering
- Session-specific knowledge

## File Structure

```
asklynk/
├── background.html        # HTML container for background script
├── background.js          # Background service worker
├── content.js             # Main content script with UI and logic
├── manifest.json          # Extension manifest
├── popup.html             # Popup UI structure
├── popup.jsx              # Popup UI logic
├── supabase.js            # Supabase client configuration
├── .env                   # Environment variables
├── icon/                  # Extension icons
│   ├── icon.png
│   ├── icon128.png
│   ├── icon48.png
│   └── icon16.png
└── src/                   # Source code
    └── api/               # API integration
        └── api-client.js  # Client-side API wrapper
```

## Key Functions Documentation

### Voice Capture System

```javascript
// Initialize smart continuous voice capture functionality
function initializeVoiceCapture() {
  // Sets up Web Speech Recognition API with intelligent restart mechanisms
  // Handles errors with exponential backoff and never stops due to silence
}

// Start smart continuous recording for lectures
function startVoiceCapture(sessionId) {
  // Begins continuous speech recognition with smart gap handling
  // Automatically processes transcript data and handles natural pauses
}

// Manually pause voice capture during breaks
function pauseVoiceCapture() {
  // Pauses capture temporarily - can be resumed when professor continues
}

// Resume voice capture after manual pause
function resumeVoiceCapture() {
  // Resumes from pause with full restart capabilities
}

// Stop voice recording completely
function stopVoiceCapture() {
  // Stops speech recognition and cleans up all resources
}

// Smart restart with exponential backoff
function scheduleVoiceRecognitionRestart(reason) {
  // Intelligently restarts voice recognition after errors or interruptions
  // Uses exponential backoff to prevent infinite restart loops
}

// Monitor for prolonged silence without stopping
function startSilenceMonitoring() {
  // Tracks voice activity and notifies about long silence periods
  // Never automatically stops - only suggests manual pause
}

// Send transcript chunk to backend for embedding generation
async function sendTranscriptToBackend(transcriptChunk) {
  // Validates user authentication token
  // Sends transcript to backend API for vector embedding processing
  // Stores transcript data in database with session context
}

// Get authenticated Supabase user session token
async function getUserSessionToken() {
  // Retrieves current user's Supabase session token
  // Validates token permissions for database operations
}

// Store user session token for voice processing
function storeUserSessionToken(token) {
  // Stores authenticated token in Chrome storage
  // Used for secure voice transcript database operations
}
```

### Authentication Flow

```javascript
// Check user's authentication state
function checkAuthState() {
  chrome.runtime.sendMessage({ type: "CHECK_AUTH" }, (response) => {
    // Updates the UI based on auth state
  });
}

// Open the authentication page
function openAuthPage() {
  chrome.runtime.sendMessage({ type: "OPEN_AUTH_PAGE" });
}

// Log out the current user
function logout() {
  chrome.runtime.sendMessage({ type: "LOGOUT" }, (response) => {
    // Handle logout response
  });
}
```

### UI Management

```javascript
// Creates the main chat container UI
function createChatContainer() {
  // Injects the main UI container into the page
}

// Creates the floating action button
function createDraggableChatButton() {
  // Creates and positions the draggable chat button
}

// Toggles chat visibility
function toggleChat() {
  // Shows or hides the chat interface
}

// Shows different dashboards based on user role
function renderRoleBasedDashboard() {
  // Renders professor or student dashboard
}
```

### Session Management

```javascript
// Create a new teaching session (professor)
async function createSession() {
  // Creates a new session with title and description
}

// Join an existing session (student)
async function joinSession() {
  // Joins a session using a session code
}

// Open a specific session
async function openSession(sessionId) {
  // Opens a session and loads its data
}

// End an active session (professor)
function endSession(sessionId) {
  // Ends an active session
}
```

### Anonymous Questions System

```javascript
// Initialize anonymous question dashboard
function initializeAnonymousQuestionDashboard(sessionId, authToken) {
  // Sets up the complete dashboard
}

// Submit an anonymous question
async function submitAnonymousQuestion(sessionId, authToken, questionText) {
  // Submits question to the server
}

// Get or create anonymous identity
async function synchronizeAnonymousIdentity(sessionId, authToken) {
  // Ensures consistent anonymous identity
}

// Load questions for current session
function loadClassQuestionsForSession(sessionId, authToken) {
  // Loads and displays questions
}
```

### AI Assistant Integration

```javascript
// Initialize Gemini AI context with session data
function initGeminiContext(session) {
  // Sets up context for AI responses
}

// Send a question to the AI
function sendAIQuestion(question) {
  // Processes and sends question to AI
}

// Make API request to Gemini
async function makeGeminiRequest(question, contextPrompt) {
  // Sends request to Gemini API
}

// Display AI response with formatting
function showAIMessage(message) {
  // Renders AI response with markdown/code formatting
}
```

## Communication Flow

### Content Script to Background Script

The extension uses Chrome's messaging system for communication:

```javascript
// Send message from content script to background
chrome.runtime.sendMessage(
  {
    type: "API_REQUEST",
    url: "http://localhost:3000/api/endpoint",
    method: "POST",
    headers: {
      /* headers */
    },
    body: {
      /* request body */
    },
  },
  (response) => {
    // Handle response
  }
);
```

### Background Script API Handling

The background script handles API requests and voice processing:

```javascript
// In background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "API_REQUEST") {
    // Process API request including voice transcript submissions
    fetch(message.url, {
      method: message.method,
      headers: message.headers,
      body: JSON.stringify(message.body),
    })
      .then((response) => response.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true; // Keep message channel open for async response
  }

  // Handle user session token management for voice processing
  if (message.type === "GET_USER_SESSION_TOKEN") {
    chrome.storage.local.get(["userSessionToken"], (result) => {
      sendResponse({ token: result.userSessionToken });
    });
    return true;
  }

  if (message.type === "SET_USER_SESSION_TOKEN") {
    chrome.storage.local.set({ userSessionToken: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});
```

## State Management

The extension uses Chrome Storage API for state management:

```javascript
// Store data
chrome.storage.local.set({ key: value }, () => {
  // Callback after data is stored
});

// Retrieve data
chrome.storage.local.get(["key1", "key2"], (result) => {
  // Use retrieved data
});
```

Key stored objects include:

- `authState`: Current user authentication state
- `activeSession`: Currently active session data
- `anonymousIdentity`: User's anonymous identity in the current session
- `userSessionToken`: Authenticated Supabase session token for voice processing
- `voiceCaptureSettings`: User preferences for voice capture functionality

## API Integration

The extension uses the [`api-client.js`](src/api/api-client.js) module to interact with the backend API:

```javascript
// Example API client method
async function getSessionById(sessionId, authToken) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "API_REQUEST",
        url: `http://localhost:3000/api/sessions/${sessionId}`,
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
      },
      (response) => {
        resolve(response);
      }
    );
  });
}

// Voice transcript API integration
async function submitVoiceTranscript(transcriptData, userToken) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "API_REQUEST",
        url: "http://localhost:3000/api/voice-transcript",
        method: "POST",
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: {
          transcript: transcriptData.text,
          session_id: transcriptData.sessionId,
          timestamp: transcriptData.timestamp,
          chunk_id: transcriptData.chunkId,
        },
      },
      (response) => {
        resolve(response);
      }
    );
  });
}
```

## Development Guide

### Extension Installation for Development

1. Clone the repository
2. Create a `.env` file with required API keys
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the project folder

### Environment Setup

Required environment variables:

```
VITE_API_BASE_URL=http://localhost:3000
VITE_AUTH_PAGE_URL=http://localhost:5173
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Voice Capture Setup

The voice capture functionality requires:

1. **Microphone Permissions**: Browser will request microphone access on first use
2. **HTTPS Context**: Voice recognition requires secure context (HTTPS or localhost)
3. **Supabase Authentication**: User must be logged in for transcript storage
4. **Backend API**: Voice transcript endpoint must be running at `localhost:3000`

### Manifest V3 Configuration

The extension uses Manifest V3 with these key permissions:

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "activeTab", "tabs"],
  "host_permissions": [
    "http://localhost:3000/*",
    "http://localhost:5173/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://meet.google.com/*", "https://*.instructure.com/*"],
      "js": ["content.js"]
    }
  ]
}
```

### Adding New Features

When adding new features:

1. Consider which context they belong in (content script, background, or popup)
2. Add API client methods in [`api-client.js`](src/api/api-client.js) if needed
3. Update UI components in [`content.js`](content.js)
4. Add message handlers in [`background.js`](background.js) if needed
5. Document new functions in this documentation

### Style Guide

- Use camelCase for variable and function names
- Add descriptive comments for all functions
- Group related functions together
- Follow the existing pattern for UI components
- Use the Chrome Extension Messaging API for all cross-context communication

## Troubleshooting Common Issues

### Authentication Issues

If users can't authenticate:

- Check the `OPEN_AUTH_PAGE` message handler in background.js
- Verify the auth page URL in your environment variables
- Ensure CORS is configured correctly on the backend

### UI Not Appearing

If UI components don't appear:

- Check for console errors
- Verify that content script is loading on the correct pages
- Check if createElement and appendChild calls are executing correctly

### API Connection Problems

If API requests fail:

- Verify the API base URL in environment variables
- Check if authentication tokens are being properly passed
- Ensure background script is handling API_REQUEST messages

### AI Assistant Issues

**Current Behavior When New Users Try AI Assistant:**

1. **Error 429 (Quota Exceeded)**: Most common issue due to Gemini API free tier limits

   - **Symptoms**: AI requests fail with "You exceeded your current quota" message
   - **User Impact**: AI Assistant appears broken while other features work fine
   - **Root Cause**: Google Gemini API has strict rate limits on free tier accounts

2. **What Still Works During AI Issues**:
   - ✅ Voice capture continues normally
   - ✅ Anonymous questions function perfectly
   - ✅ Session management works
   - ✅ All other extension features active

**Enhanced Error Handling (New Implementation):**

```javascript
// AI Assistant now provides clear error messages:
"🚫 AI Assistant Temporarily Unavailable

The Enhanced AI service is currently experiencing issues.

What's still working:
✅ Voice capture continues normally
✅ Anonymous questions work fine
✅ Session features are active

To resolve:
• Wait a moment and try again
• Check your internet connection
• Use other extension features while waiting"
```

**Upgraded AI Backend Integration:**

The extension now uses an enhanced backend instead of directly calling Gemini API:

- **Enhanced Backend Endpoint**: `/api/enhanced/sessions/{sessionId}/ask`
- **Context-Aware Responses**: Uses session embeddings for relevant answers
- **Relevance Filtering**: Automatically filters off-topic questions
- **Cost-Effective**: ~$0.00005 per question vs Gemini's quota limits
- **Better Error Handling**: Clear messages for different error types

**New AI Request Flow:**

```javascript
// Old Gemini API flow:
sendAIQuestion() → makeGeminiRequest() → chrome.runtime.sendMessage()

// New Enhanced Backend flow:
sendAIQuestion() → makeEnhancedBackendRequest() → direct fetch() to backend
```

**New Debug Commands for AI Issues** (run in browser console):

```javascript
// Check AI Assistant status and get troubleshooting info
checkAIAssistantStatus();

// Test AI request manually
testAIRequest("Hello, this is a test");

// View AI context and message history
console.log("AI Context:", geminiContext);
```

### Voice Capture Issues

If voice capture doesn't work:

- **Microphone Access**: Check if browser has microphone permissions
- **HTTPS Required**: Voice recognition only works on HTTPS or localhost
- **Browser Support**: Ensure browser supports Web Speech Recognition API
- **Authentication**: Verify user is logged in with valid Supabase session
- **Token Validation**: Check console for "Role: authenticated" message
- **Backend Connection**: Ensure voice transcript API endpoint is running

Common voice capture error messages:

```javascript
// Check console for these debug messages:
"🎤 Voice capture initialized successfully";
"🔴 CRITICAL: No user session token found";
"✅ EXCELLENT: Using USER SESSION token - will save to database!";
"⚠️ WARNING: Using ANONYMOUS key - transcripts won't be saved!";
```

**Smart Continuous Capture Debug Commands** (run in browser console):

```javascript
// Check current voice capture state
checkVoiceCaptureState();

// View configuration settings
checkVoiceCaptureConfig();

// Manual pause during long break
manualPauseVoiceCapture();

// Resume after break
manualResumeVoiceCapture();

// Force restart if issues occur
forceRestartVoiceCapture();
```

**Handling Lecture Scenarios**:

- **Student Questions**: System continues listening through pauses and student interaction
- **Board Writing**: Captures speech even during long silent periods while writing
- **Demonstrations**: Automatically restarts if recognition stops during hands-on activities
- **Break Time**: Professors can manually pause and resume as needed
- **Technical Issues**: Smart exponential backoff prevents restart loops

### Database Storage Issues

If voice transcripts aren't saving to database:

- Verify user session token is being used (not anonymous key)
- Check backend logs for database connection errors
- Ensure voice_transcripts table exists with proper schema
- Verify user has authenticated role permissions in Supabase

## Future Development Roadmap

1. **Performance Optimization**

   - Bundle and minimize extension code
   - Implement more efficient rendering
   - Optimize voice processing for longer lectures

2. **Voice & AI Enhancements**

   - Add speaker identification for multi-person lectures
   - Implement real-time transcript display
   - Add voice command controls for extension features
   - Integrate transcript search and semantic query functionality

3. **UI Enhancements**

   - Support dark mode
   - Add accessibility features
   - Implement responsive design for mobile views
   - Add voice capture status indicators

4. **Feature Expansion**

   - Add support for file attachments in questions
   - Implement real-time collaboration tools
   - Add more analytics for professors
   - Support offline voice processing and sync

5. **Security Enhancements**
   - Implement stronger token management
   - Add end-to-end encryption for sensitive data
   - Secure voice data transmission and storage

## Contact & Support

For questions or issues with the frontend implementation, please contact the development team:

- **Primary Contact**: [Contact email or name]
- **GitHub Repository**: [Repository URL]
- **Bug Reports**: [Issue tracker URL]

---

Last updated: August 3, 2025

**Recent Updates:**

- Added comprehensive voice capture and transcript processing functionality
- Implemented Manifest V3 compatibility with service worker background script
- Enhanced authentication system with Supabase user session token management
- Added real-time speech recognition with 7-second chunked processing
- Integrated voice-to-embeddings pipeline for semantic lecture search
