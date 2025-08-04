# AskLynk Chrome Extension - Complete API Documentation

## 📡 API Overview

AskLynk Chrome Extension integrates with multiple backend services to provide a comprehensive educational experience. This documentation covers all API endpoints used by the extension, their purposes, request/response formats, and implementation details.

**Base URL**: `https://asklynk-bkend-d5qpx8shx-sharath-chandra-s-projects.vercel.app`
**Frontend URL**: `https://asklynk-58z1r8wvq-sharath-chandra-s-projects.vercel.app`

---

## 🎯 API Categories

### 1. [Session Management APIs](#session-management-apis)

### 2. [AI Assistant APIs](#ai-assistant-apis)

### 3. [Anonymous Question System APIs](#anonymous-question-system-apis)

### 4. [Voice Transcription APIs](#voice-transcription-apis)

### 5. [Authentication APIs](#authentication-apis)

### 6. [Real-time Communication APIs](#real-time-communication-apis)

### 7. [Analytics APIs](#analytics-apis)

---

## 🏫 Session Management APIs

### Create Session

**Purpose**: Allows professors to create new classroom sessions with unique codes for student joining.

```http
POST /api/sessions
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "title": "Introduction to Computer Science",
  "description": "Basic programming concepts and algorithms",
  "professorId": "user_123",
  "settings": {
    "allowAnonymousQuestions": true,
    "voiceTranscriptionEnabled": true,
    "aiAssistantEnabled": true
  }
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "sessionCode": "ABC123",
    "title": "Introduction to Computer Science",
    "description": "Basic programming concepts and algorithms",
    "professorId": "user_123",
    "createdAt": "2025-08-03T12:00:00Z",
    "isActive": true,
    "settings": {
      "allowAnonymousQuestions": true,
      "voiceTranscriptionEnabled": true,
      "aiAssistantEnabled": true
    }
  }
}
```

**Used in Extension**: Professor dashboard session creation workflow

---

### Join Session

**Purpose**: Allows students to join active sessions using session codes.

```http
POST /api/sessions/join
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "sessionCode": "ABC123",
  "userId": "user_456"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "title": "Introduction to Computer Science",
    "description": "Basic programming concepts and algorithms",
    "professorName": "Dr. Smith",
    "joinedAt": "2025-08-03T12:15:00Z",
    "userRole": "student",
    "permissions": {
      "canAskQuestions": true,
      "canUseAI": true,
      "canViewTranscripts": false
    }
  }
}
```

**Used in Extension**: Student session joining workflow

---

### Get Session Details

**Purpose**: Retrieves comprehensive session information for UI updates and context.

```http
GET /api/sessions/{sessionId}
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "title": "Introduction to Computer Science",
    "description": "Basic programming concepts and algorithms",
    "professorId": "user_123",
    "professorName": "Dr. Smith",
    "participantCount": 25,
    "isActive": true,
    "createdAt": "2025-08-03T12:00:00Z",
    "settings": {
      "allowAnonymousQuestions": true,
      "voiceTranscriptionEnabled": true,
      "aiAssistantEnabled": true
    },
    "stats": {
      "questionsCount": 12,
      "pollsCount": 3,
      "transcriptChunks": 45
    }
  }
}
```

**Used in Extension**: Session dashboard updates, context loading

---

### End Session

**Purpose**: Allows professors to end active sessions and archive data.

```http
POST /api/sessions/{sessionId}/end
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "endReason": "class_completed",
  "summary": "Covered topics 1-3, homework assigned"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "endedAt": "2025-08-03T13:30:00Z",
    "duration": "90 minutes",
    "finalStats": {
      "totalParticipants": 25,
      "questionsAnswered": 12,
      "pollsCreated": 3,
      "transcriptLength": "2.5 hours"
    }
  }
}
```

**Used in Extension**: Professor session termination workflow

---

### Get Professor Sessions

**Purpose**: Retrieves all sessions created by a professor for session management.

```http
GET /api/sessions/professor/{professorId}
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "sess_abc123",
        "title": "Introduction to Computer Science",
        "isActive": true,
        "participantCount": 25,
        "createdAt": "2025-08-03T12:00:00Z",
        "lastActivity": "2025-08-03T13:25:00Z"
      },
      {
        "sessionId": "sess_def456",
        "title": "Advanced Algorithms",
        "isActive": false,
        "participantCount": 18,
        "createdAt": "2025-08-02T10:00:00Z",
        "endedAt": "2025-08-02T11:30:00Z"
      }
    ]
  }
}
```

**Used in Extension**: Professor dashboard session list

---

### Get Student Sessions

**Purpose**: Retrieves all sessions a student has joined for navigation.

```http
GET /api/students/{userId}/sessions
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "sessionId": "sess_abc123",
        "title": "Introduction to Computer Science",
        "professorName": "Dr. Smith",
        "isActive": true,
        "joinedAt": "2025-08-03T12:15:00Z",
        "lastAccess": "2025-08-03T13:20:00Z"
      }
    ]
  }
}
```

**Used in Extension**: Student dashboard session list

---

## 🤖 AI Assistant APIs

### Context-Aware AI (Enhanced Backend)

**Purpose**: Provides intelligent AI responses based on session context, transcripts, and embeddings.

```http
POST /api/enhanced/sessions/{sessionId}/ask-stream
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json",
  "Accept": "text/event-stream"
}
```

**Request Body**:

```json
{
  "question": "Can you explain the concept of recursion we just discussed?",
  "sessionId": "sess_abc123",
  "user": {
    "id": "user_456",
    "role": "student",
    "username": "john_doe"
  }
}
```

**Response (Server-Sent Events)**:

```
data: {"type": "start", "timestamp": "2025-08-03T13:25:00Z", "assistant_type": "classroom_companion", "session_id": "sess_abc123"}

data: {"type": "chunk", "content": "Based on our recent discussion, "}

data: {"type": "chunk", "content": "recursion is a programming technique where "}

data: {"type": "chunk", "content": "a function calls itself to solve smaller subproblems..."}

data: [DONE]
```

**Error Response**:

```
data: {"type": "error", "error": "Failed to generate response. Please try again."}
```

**Used in Extension**: Student AI assistant when in active sessions

**Key Features**:

- Uses session transcript embeddings for context-aware responses
- Filters out off-topic questions
- Provides personalized educational assistance
- Real-time streaming for ChatGPT-like experience

---

### General AI Assistant

**Purpose**: Provides general educational AI assistance when not in a session context.

```http
POST /api/ai/general/ask-stream
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json",
  "Accept": "text/event-stream"
}
```

**Request Body**:

```json
{
  "question": "What is the time complexity of binary search?"
}
```

**Response (Server-Sent Events)**:

```
data: {"type": "start", "timestamp": "2025-08-03T13:25:00Z", "assistant_type": "general_assistant"}

data: {"type": "chunk", "content": "Binary search has a time complexity of O(log n). "}

data: {"type": "chunk", "content": "This is because with each comparison, "}

data: {"type": "chunk", "content": "the search space is reduced by half..."}

data: [DONE]
```

**Used in Extension**: Standalone AI assistant mode, general academic questions

**Key Features**:

- Broad educational knowledge base
- No session context limitations
- Available to all authenticated users
- Supports both streaming and regular responses

---

## ❓ Anonymous Question System APIs

### Create Anonymous Identity

**Purpose**: Generates consistent anonymous identity for students within sessions while maintaining privacy.

```http
POST /api/anonymous/{sessionId}/identity
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "userId": "user_456",
  "sessionId": "sess_abc123"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "anonymousId": "anon_8a7b9c",
    "sessionId": "sess_abc123",
    "displayName": "Anonymous Panda",
    "avatar": "🐼",
    "createdAt": "2025-08-03T12:15:00Z"
  }
}
```

**Used in Extension**: Anonymous question system initialization

---

### Submit Anonymous Question

**Purpose**: Allows students to submit questions safely without revealing identity.

```http
POST /api/anonymous/{sessionId}/questions
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "question": "I'm confused about the difference between recursion and iteration",
  "anonymousId": "anon_8a7b9c",
  "sessionId": "sess_abc123",
  "category": "concept_clarification",
  "timestamp": "2025-08-03T13:20:00Z"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "questionId": "q_123456",
    "question": "I'm confused about the difference between recursion and iteration",
    "anonymousId": "anon_8a7b9c",
    "displayName": "Anonymous Panda",
    "avatar": "🐼",
    "status": "new",
    "submittedAt": "2025-08-03T13:20:00Z",
    "sessionId": "sess_abc123"
  }
}
```

**Used in Extension**: Student anonymous question submission

---

### Get Session Questions

**Purpose**: Retrieves all questions for a session (professor view) with filtering options.

```http
GET /api/sessions/{sessionId}/questions?status={status}&limit={limit}
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}"
}
```

**Query Parameters**:

- `status`: Filter by question status (`new`, `viewed`, `resolved`)
- `limit`: Maximum number of questions to return
- `sort`: Sort order (`newest`, `oldest`, `priority`)

**Response**:

```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "questionId": "q_123456",
        "question": "I'm confused about the difference between recursion and iteration",
        "anonymousId": "anon_8a7b9c",
        "displayName": "Anonymous Panda",
        "avatar": "🐼",
        "status": "new",
        "submittedAt": "2025-08-03T13:20:00Z",
        "upvotes": 3,
        "tags": ["concept", "programming"]
      }
    ],
    "total": 12,
    "newCount": 4,
    "resolvedCount": 8
  }
}
```

**Used in Extension**: Professor question dashboard

---

### Resolve Question

**Purpose**: Allows professors to mark questions as resolved with optional responses.

```http
POST /api/sessions/{sessionId}/questions/{questionId}/resolve
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "response": "Great question! The key difference is that recursion calls the same function...",
  "resolvedBy": "user_123",
  "resolutionType": "answered"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "questionId": "q_123456",
    "status": "resolved",
    "resolvedAt": "2025-08-03T13:25:00Z",
    "resolvedBy": "Dr. Smith",
    "response": "Great question! The key difference is that recursion calls the same function..."
  }
}
```

**Used in Extension**: Professor question management

---

### Get Anonymous User Questions

**Purpose**: Allows students to view their own submitted questions and responses.

```http
GET /api/anonymous/{sessionId}/questions
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "questionId": "q_123456",
        "question": "I'm confused about the difference between recursion and iteration",
        "status": "resolved",
        "submittedAt": "2025-08-03T13:20:00Z",
        "resolvedAt": "2025-08-03T13:25:00Z",
        "response": "Great question! The key difference is that recursion calls the same function...",
        "upvotes": 3
      }
    ]
  }
}
```

**Used in Extension**: Student question history view

---

## 🎙️ Voice Transcription APIs

### Submit Voice Transcript

**Purpose**: Processes and stores voice transcript chunks for AI context and session records.

```http
POST /api/sessions/{sessionId}/voice-transcript
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "transcript": "Today we're going to learn about binary search algorithms. Binary search is a very efficient way to find elements in a sorted array.",
  "chunkId": "chunk_001",
  "startTime": "2025-08-03T13:00:00Z",
  "endTime": "2025-08-03T13:00:07Z",
  "confidence": 0.95,
  "speakerId": "professor",
  "sessionId": "sess_abc123"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "transcriptId": "trans_789",
    "chunkId": "chunk_001",
    "sessionId": "sess_abc123",
    "processedAt": "2025-08-03T13:00:08Z",
    "embeddingGenerated": true,
    "vectorId": "vec_456",
    "status": "processed"
  }
}
```

**Used in Extension**: Voice capture system, continuous transcript processing

**Key Features**:

- 7-second chunk processing for optimal performance
- Automatic embedding generation for AI context
- Speaker identification support
- Confidence scoring for quality control
- Real-time processing with background storage

---

## 🔐 Authentication APIs

### Refresh Authentication Token

**Purpose**: Refreshes expired authentication tokens for continuous session access.

```http
POST /api/auth/refresh
```

**Headers**:

```json
{
  "Authorization": "Bearer {refreshToken}",
  "Content-Type": "application/json"
}
```

**Request Body**:

```json
{
  "refreshToken": "refresh_token_abc123"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "accessToken": "new_access_token_xyz789",
    "refreshToken": "new_refresh_token_def456",
    "expiresIn": 3600,
    "user": {
      "id": "user_123",
      "email": "professor@university.edu",
      "role": "professor",
      "name": "Dr. Smith"
    }
  }
}
```

**Used in Extension**: Background token management, session persistence

---

## 📊 Real-time Communication APIs

### Get Session Messages

**Purpose**: Retrieves chat messages for session communication.

```http
GET /api/sessions/{sessionId}/messages
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "messageId": "msg_123",
        "content": "Great explanation of recursion!",
        "senderId": "user_456",
        "senderName": "John Doe",
        "timestamp": "2025-08-03T13:22:00Z",
        "type": "text"
      }
    ]
  }
}
```

**Used in Extension**: Chat functionality within sessions

---

### Get Session Polls

**Purpose**: Retrieves active and past polls for session interaction.

```http
GET /api/sessions/{sessionId}/polls
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "polls": [
      {
        "pollId": "poll_123",
        "question": "Which sorting algorithm is most efficient for large datasets?",
        "options": [
          { "id": "opt_1", "text": "Quick Sort", "votes": 12 },
          { "id": "opt_2", "text": "Merge Sort", "votes": 8 },
          { "id": "opt_3", "text": "Bubble Sort", "votes": 1 }
        ],
        "isActive": true,
        "createdAt": "2025-08-03T13:15:00Z",
        "expiresAt": "2025-08-03T13:20:00Z"
      }
    ]
  }
}
```

**Used in Extension**: Interactive polling system

---

## 📈 Analytics APIs

### Get Session Analytics

**Purpose**: Provides comprehensive session analytics for professors.

```http
GET /api/sessions/{sessionId}/analytics
```

**Headers**:

```json
{
  "Authorization": "Bearer {authToken}"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "sessionId": "sess_abc123",
    "duration": "90 minutes",
    "participationMetrics": {
      "totalParticipants": 25,
      "activeParticipants": 22,
      "questionSubmissions": 12,
      "pollParticipation": 89,
      "aiInteractions": 34
    },
    "engagementTrends": {
      "questionsByTime": [
        { "time": "13:00", "count": 2 },
        { "time": "13:15", "count": 5 },
        { "time": "13:30", "count": 3 }
      ],
      "aiUsageByTime": [
        { "time": "13:00", "count": 3 },
        { "time": "13:15", "count": 8 },
        { "time": "13:30", "count": 12 }
      ]
    },
    "contentAnalysis": {
      "mostAskedTopics": ["recursion", "algorithms", "time complexity"],
      "transcriptSummary": "Session covered binary search, recursion concepts, and algorithm analysis",
      "keyMoments": [
        {
          "time": "13:15",
          "topic": "Recursion explanation",
          "engagement": "high"
        },
        { "time": "13:45", "topic": "Q&A session", "engagement": "very high" }
      ]
    }
  }
}
```

**Used in Extension**: Professor analytics dashboard

---

## 🔄 API Error Handling

### Standard Error Response Format

All APIs return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SESSION",
    "message": "Session not found or has expired",
    "details": {
      "sessionId": "sess_abc123",
      "timestamp": "2025-08-03T13:30:00Z"
    }
  }
}
```

### Common Error Codes

| Code                     | HTTP Status | Description                                    |
| ------------------------ | ----------- | ---------------------------------------------- |
| `INVALID_TOKEN`          | 401         | Authentication token is invalid or expired     |
| `ACCESS_DENIED`          | 403         | User doesn't have permission for this resource |
| `SESSION_NOT_FOUND`      | 404         | Requested session doesn't exist                |
| `INVALID_SESSION`        | 400         | Session has expired or is inactive             |
| `RATE_LIMIT_EXCEEDED`    | 429         | Too many requests, please slow down            |
| `SERVER_ERROR`           | 500         | Internal server error                          |
| `AI_SERVICE_UNAVAILABLE` | 503         | AI service is temporarily unavailable          |

### Error Handling in Extension

The extension implements comprehensive error handling for all API calls:

```javascript
// Example error handling implementation
async function makeApiRequest(endpoint, options) {
  try {
    const response = await fetch(endpoint, options);

    if (!response.ok) {
      if (response.status === 401) {
        // Handle authentication error
        await refreshAuthToken();
        // Retry request
      } else if (response.status === 404) {
        // Handle not found
        showUserMessage("Resource not found");
      }
      // ... other error handling
    }

    return await response.json();
  } catch (error) {
    // Handle network errors
    showUserMessage("Connection error. Please check your internet.");
  }
}
```

---

## 🚀 API Performance & Optimization

### Caching Strategy

- **Session Data**: Cached locally for 5 minutes
- **User Authentication**: Cached until token expiry
- **Static Resources**: Browser cache with long expiry
- **AI Responses**: Not cached for freshness

### Rate Limiting

- **AI APIs**: 30 requests per minute per user
- **Session APIs**: 100 requests per minute per user
- **Anonymous Questions**: 10 submissions per minute per user
- **Voice Transcripts**: 120 chunks per minute per session

### Real-time Features

- **Server-Sent Events**: For AI streaming responses
- **WebSocket Connections**: For live session updates
- **Polling Intervals**: 30 seconds for non-critical updates

---

## 🔧 Development & Testing

### Environment Configuration

```javascript
// Development
const API_BASE_URL = "http://localhost:3000";

// Production
const API_BASE_URL =
  "https://asklynk-bkend-d5qpx8shx-sharath-chandra-s-projects.vercel.app";
```

### API Testing Tools

```javascript
// Built-in testing functions (available in console)
window.testAskLynk = {
  testAIIntegration: () => testEnhancedBackendIntegration(),
  testVoiceCapture: () => testVoiceRecognitionSystem(),
  testSessionManagement: () => testSessionFlow(),
  testAuthentication: () => testAuthentication(),
  testGeneralAI: () => testGeneralAI(),
};
```

### Debug Commands

```javascript
// Check AI Assistant status
checkAIAssistantStatus();

// Test enhanced backend connection
testEnhancedBackend();

// Check session context
checkSessionContext();

// Test authentication tokens
testAuthentication();
```

---

## 📝 API Usage Examples

### Complete Student Workflow

```javascript
// 1. Join session
const joinResponse = await fetch(`${API_BASE_URL}/api/sessions/join`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    sessionCode: "ABC123",
    userId: currentUser.id,
  }),
});

// 2. Get anonymous identity
const anonymousResponse = await fetch(
  `${API_BASE_URL}/api/anonymous/${sessionId}/identity`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: currentUser.id,
      sessionId: sessionId,
    }),
  }
);

// 3. Submit anonymous question
const questionResponse = await fetch(
  `${API_BASE_URL}/api/anonymous/${sessionId}/questions`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      question: "Can you explain recursion?",
      anonymousId: anonymousId,
      sessionId: sessionId,
    }),
  }
);

// 4. Ask AI assistant
const aiResponse = await fetch(
  `${API_BASE_URL}/api/enhanced/sessions/${sessionId}/ask-stream`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      question: "What is the time complexity of binary search?",
      sessionId: sessionId,
      user: currentUser,
    }),
  }
);
```

### Complete Professor Workflow

```javascript
// 1. Create session
const sessionResponse = await fetch(`${API_BASE_URL}/api/sessions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: "Advanced Algorithms",
    description: "Graph algorithms and optimization",
    professorId: currentUser.id,
    settings: {
      allowAnonymousQuestions: true,
      voiceTranscriptionEnabled: true,
      aiAssistantEnabled: true,
    },
  }),
});

// 2. Start voice transcription
const transcriptResponse = await fetch(
  `${API_BASE_URL}/api/sessions/${sessionId}/voice-transcript`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transcript: transcriptChunk,
      chunkId: generateChunkId(),
      startTime: new Date().toISOString(),
      sessionId: sessionId,
    }),
  }
);

// 3. Get session questions
const questionsResponse = await fetch(
  `${API_BASE_URL}/api/sessions/${sessionId}/questions`,
  {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  }
);

// 4. End session
const endResponse = await fetch(
  `${API_BASE_URL}/api/sessions/${sessionId}/end`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endReason: "class_completed",
      summary: "Covered graph algorithms successfully",
    }),
  }
);
```

---

## 🔒 Security & Privacy

### Authentication

- JWT tokens with secure expiration
- Refresh token rotation
- Role-based access control

### Data Privacy

- Anonymous question system protects student identity
- Encrypted data transmission (HTTPS)
- Minimal data collection approach

### CORS Configuration

```javascript
// Allowed origins for the extension
const allowedOrigins = [
  "chrome-extension://*",
  "https://meet.google.com",
  "https://*.instructure.com",
];
```

---

## 📞 API Support & Contact

For API-related questions or issues:

- **Technical Documentation**: This document
- **Backend Repository**: [Backend Repo URL]
- **API Status**: [Status Page URL]
- **Support Email**: [Support Email]

---

**Last Updated**: August 3, 2025
**API Version**: 1.0.0
**Extension Version**: 1.0.0

This documentation is maintained alongside the AskLynk Chrome Extension codebase and is updated with every API change or new feature addition.
