# AskLynk Chrome Extension Frontend Documentation

## Project Overview

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

The background script handles API requests:

```javascript
// In background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "API_REQUEST") {
    // Process API request
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

## Future Development Roadmap

1. **Performance Optimization**

   - Bundle and minimize extension code
   - Implement more efficient rendering

2. **UI Enhancements**

   - Support dark mode
   - Add accessibility features
   - Implement responsive design for mobile views

3. **Feature Expansion**

   - Add support for file attachments in questions
   - Implement real-time collaboration tools
   - Add more analytics for professors

4. **Security Enhancements**
   - Implement stronger token management
   - Add end-to-end encryption for sensitive data

## Contact & Support

For questions or issues with the frontend implementation, please contact the development team:

- **Primary Contact**: [Contact email or name]
- **GitHub Repository**: [Repository URL]
- **Bug Reports**: [Issue tracker URL]

---

Last updated: April 27, 2025
