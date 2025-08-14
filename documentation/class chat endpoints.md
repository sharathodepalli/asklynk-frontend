# 🎓 Chrome Extension - Class Chat API Endpoints

## 🔗 Base URL

```
https://asklynk-backend-424701115132.us-central1.run.app
```

## 🔑 Authentication

All chat endpoints require authentication. Include in all requests:

```javascript
{
  credentials: "include", // Required for cookie-based auth
  headers: {
    "Content-Type": "application/json"
  }
}
```

---

## 🤖 AI Chat Endpoints

### 1. **Create/Get Chat for a Session**

**Endpoint:** `POST /api/ai/chats`

**Purpose:** Creates or retrieves an AI chat instance for a specific session

**Request:**

```javascript
{
  "session_id": "session-uuid",
  "store_chat": true  // Optional, defaults to true
}
```

**Response:**

```javascript
{
  "ok": true,
  "data": {
    "id": "chat-uuid",
    "session_id": "session-uuid",
    "user_id": "user-uuid",
    "created_at": "2025-08-13T12:00:00Z",
    "updated_at": "2025-08-13T12:00:00Z"
  }
}
```

**Example:**

```javascript
const response = await fetch(`${baseURL}/api/ai/chats`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    session_id: "123e4567-e89b-12d3-a456-426614174000",
  }),
});
```

---

### 2. **Get Chat Messages**

**Endpoint:** `GET /api/ai/messages/:chatId`

**Purpose:** Retrieves all messages in a specific chat

**Response:**

```javascript
{
  "ok": true,
  "data": [
    {
      "id": "message-uuid",
      "chat_id": "chat-uuid",
      "role": "user", // "user" or "assistant"
      "content": "What is machine learning?",
      "created_at": "2025-08-13T12:00:00Z"
    },
    {
      "id": "message-uuid-2",
      "chat_id": "chat-uuid",
      "role": "assistant",
      "content": "Machine learning is...",
      "created_at": "2025-08-13T12:01:00Z"
    }
  ]
}
```

**Example:**

```javascript
const response = await fetch(`${baseURL}/api/ai/messages/${chatId}`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
```

---

### 3. **Send Message to Chat**

**Endpoint:** `POST /api/ai/messages`

**Purpose:** Saves a message (user or AI) to a chat

**Request:**

```javascript
{
  "chat_id": "chat-uuid",
  "role": "user", // "user" or "assistant"
  "content": "Explain arrays in JavaScript"
}
```

**Response:**

```javascript
{
  "ok": true,
  "data": {
    "id": "message-uuid",
    "chat_id": "chat-uuid",
    "role": "user",
    "content": "Explain arrays in JavaScript",
    "created_at": "2025-08-13T12:00:00Z"
  }
}
```

**Example:**

```javascript
const response = await fetch(`${baseURL}/api/ai/messages`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    role: "user",
    content: "How do arrays work in JavaScript?",
  }),
});
```

---

### 4. **Record AI Interaction**

**Endpoint:** `POST /api/ai/interactions`

**Purpose:** Records AI interaction metrics (usage tracking)

**Request:**

```javascript
{
  "session_id": "session-uuid",
  "question": "What is machine learning?",
  "answer": "Machine learning is a subset of AI...",
  "model": "gpt-4", // Optional
  "tokens_used": 150, // Optional
  "response_time": 1200 // Optional, in milliseconds
}
```

**Response:**

```javascript
{
  "ok": true,
  "data": {
    "id": "interaction-uuid",
    "session_id": "session-uuid",
    "user_id": "user-uuid",
    "question": "What is machine learning?",
    "answer": "Machine learning is a subset of AI...",
    "model": "gpt-4",
    "tokens_used": 150,
    "response_time": 1200,
    "created_at": "2025-08-13T12:00:00Z"
  }
}
```

---

### 5. **Get Session AI Interactions**

**Endpoint:** `GET /api/ai/interactions/session/:sessionId`

**Purpose:** Get all AI interactions for a specific session

**Response:**

```javascript
{
  "ok": true,
  "data": [
    {
      "id": "interaction-uuid",
      "session_id": "session-uuid",
      "user_id": "user-uuid",
      "question": "What is machine learning?",
      "answer": "Machine learning is...",
      "model": "gpt-4",
      "tokens_used": 150,
      "response_time": 1200,
      "created_at": "2025-08-13T12:00:00Z"
    }
  ]
}
```

---

### 6. **Get User AI Interactions**

**Endpoint:** `GET /api/ai/interactions/user`

**Purpose:** Get all AI interactions for the authenticated user

**Query Parameters:**

- `session_id` (optional): Filter by specific session

**Response:**

```javascript
{
  "ok": true,
  "data": [
    {
      "id": "interaction-uuid",
      "session_id": "session-uuid",
      "user_id": "user-uuid",
      "question": "What is machine learning?",
      "answer": "Machine learning is...",
      "model": "gpt-4",
      "tokens_used": 150,
      "response_time": 1200,
      "created_at": "2025-08-13T12:00:00Z"
    }
  ]
}
```

**Example:**

```javascript
// Get all user interactions
const response = await fetch(`${baseURL}/api/ai/interactions/user`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});

// Get user interactions for specific session
const response2 = await fetch(
  `${baseURL}/api/ai/interactions/user?session_id=${sessionId}`,
  {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  }
);
```

---

## 🎯 Enhanced Session AI (Context-Aware)

### 7. **Context-Aware Streaming AI**

**Endpoint:** `POST /api/enhanced/sessions/:sessionId/ask-stream`

**Purpose:** AI that understands session context (lecture content, transcripts)

**Request:**

```javascript
{
  "question": "Can you explain what the professor just said about loops?",
  "type": "anonymous" // Optional: "anonymous" or "identified"
}
```

**Response:** Server-Sent Events (SSE) stream

```
data: {"content": "Based on the current lecture transcript, "}
data: {"content": "the professor explained that loops are..."}
data: [DONE]
```

**Example:**

```javascript
const response = await fetch(
  `${baseURL}/api/enhanced/sessions/${sessionId}/ask-stream`,
  {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: "What did we cover about functions?",
      type: "anonymous",
    }),
  }
);

// Handle streaming response
const reader = response.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = new TextDecoder().decode(value);
  const lines = chunk.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        console.log("AI Response:", parsed.content);
      } catch (e) {
        console.error("Parse error:", e);
      }
    }
  }
}
```

---

## 🏗️ Complete Implementation Example

```javascript
class AskLynkClassChat {
  constructor() {
    this.baseURL = "https://asklynk-backend-424701115132.us-central1.run.app";
    this.currentChatId = null;
    this.currentSessionId = null;
  }

  // Initialize chat for a session
  async initializeChat(sessionId) {
    try {
      const response = await fetch(`${this.baseURL}/api/ai/chats`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create chat: ${response.status}`);
      }

      const result = await response.json();
      this.currentChatId = result.data.id;
      this.currentSessionId = sessionId;

      return result.data;
    } catch (error) {
      console.error("Error initializing chat:", error);
      throw error;
    }
  }

  // Send a message and get AI response
  async sendMessage(message) {
    if (!this.currentChatId) {
      throw new Error("Chat not initialized. Call initializeChat first.");
    }

    try {
      // Save user message
      await this.saveMessage("user", message);

      // Get AI response using context-aware endpoint
      const aiResponse = await this.getContextAwareResponse(message);

      // Save AI response
      await this.saveMessage("assistant", aiResponse);

      // Record interaction for analytics
      await this.recordInteraction(message, aiResponse);

      return aiResponse;
    } catch (error) {
      console.error("Error sending message:", error);
      throw error;
    }
  }

  // Save message to chat
  async saveMessage(role, content) {
    const response = await fetch(`${this.baseURL}/api/ai/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.currentChatId,
        role: role,
        content: content,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.status}`);
    }

    return await response.json();
  }

  // Get context-aware AI response
  async getContextAwareResponse(question) {
    const response = await fetch(
      `${this.baseURL}/api/enhanced/sessions/${this.currentSessionId}/ask-stream`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question,
          type: "anonymous",
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    // Handle streaming response
    const reader = response.body.getReader();
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            fullResponse += parsed.content || "";
          } catch (e) {
            console.error("Parse error:", e);
          }
        }
      }
    }

    return fullResponse;
  }

  // Record interaction for analytics
  async recordInteraction(question, answer) {
    try {
      await fetch(`${this.baseURL}/api/ai/interactions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: this.currentSessionId,
          question: question,
          answer: answer,
          model: "gpt-4",
          response_time: Date.now(), // You can calculate actual response time
        }),
      });
    } catch (error) {
      console.error("Error recording interaction:", error);
      // Don't throw - analytics failure shouldn't break chat
    }
  }

  // Get chat history
  async getChatHistory() {
    if (!this.currentChatId) {
      throw new Error("Chat not initialized.");
    }

    const response = await fetch(
      `${this.baseURL}/api/ai/messages/${this.currentChatId}`,
      {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get chat history: ${response.status}`);
    }

    const result = await response.json();
    return result.data;
  }

  // Get user's AI interaction history
  async getInteractionHistory(sessionId = null) {
    const url = sessionId
      ? `${this.baseURL}/api/ai/interactions/user?session_id=${sessionId}`
      : `${this.baseURL}/api/ai/interactions/user`;

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Failed to get interaction history: ${response.status}`);
    }

    const result = await response.json();
    return result.data;
  }
}

// Usage Example
const classChat = new AskLynkClassChat();

// Initialize for a session
await classChat.initializeChat("your-session-id");

// Send a message
const response = await classChat.sendMessage(
  "Can you explain what the professor just said about recursion?"
);
console.log("AI Response:", response);

// Get chat history
const history = await classChat.getChatHistory();
console.log("Chat History:", history);
```

---

## 🔍 Error Handling

```javascript
// Common error responses
{
  "ok": false,
  "error": "User not authenticated"          // 401
}

{
  "ok": false,
  "error": "Not authorized to access this session" // 403
}

{
  "ok": false,
  "error": "Session ID is required"          // 400
}

{
  "ok": false,
  "error": "Chat not found"                  // 404
}
```

---

## 📋 Key Points for Extension Team

### ✅ Authentication Required

- All endpoints require `credentials: "include"`
- User must be authenticated via cookies

### ✅ Session Access Control

- User must have access to the session to create/use chats
- Professors and enrolled students have access

### ✅ Context-Aware AI

- Use `/api/enhanced/sessions/:sessionId/ask-stream` for intelligent responses
- AI understands lecture context, transcripts, and session content

### ✅ Chat Persistence

- Chats are automatically saved and persist across sessions
- Each user gets their own chat per session

### ✅ Analytics Integration

- Record interactions for usage analytics
- Track model usage, response times, token consumption

### ✅ Error Handling

- Always check response.ok before processing
- Handle authentication and authorization errors gracefully

This comprehensive API reference covers all the class chat functionality your extension needs! 🚀
