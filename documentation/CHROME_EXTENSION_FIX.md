# 🚨 Chrome Extension API Endpoint Fix

## Issue Identified

Your Chrome extension is getting **CORS errors** when calling the AI streaming endpoint from `https://meet.google.com` because:

1. **Route conflict**: Originally `/api/ai/general/ask-stream` conflicted with authenticated routes
2. **CORS headers conflict**: Streaming endpoints were setting `Access-Control-Allow-Origin: *` which conflicts with `credentials: "include"`

## Root Cause

The backend had two issues:

1. **Route Conflict**: Two routers mounted on the same path:

   - `/api/ai` → `aiRouter` (requires strict authentication)
   - `/api/ai` → `genericAIRoutes` (allows optional authentication)

2. **CORS Headers Conflict**: Streaming endpoints manually set `Access-Control-Allow-Origin: *` but when using `credentials: "include"`, the origin must be specifically allowed, not wildcard.

## ✅ Fixes Applied

**Backend Route Change:**

- Old: `/api/ai/general/ask-stream`
- New: `/api/ai-general/general/ask-stream`

**Backend CORS Fix:**

- Removed manual `Access-Control-Allow-Origin: *` headers from streaming endpoints
- Now uses main CORS middleware which properly handles specific origins
- `https://meet.google.com` is explicitly allowed in CORS configuration

- Old: `/api/ai/general/ask-stream`
- New: `/api/ai-general/general/ask-stream`

## 🔧 Extension Code Fix Required

Update your extension's AI endpoint URLs:

### Before (Broken):

`````markdown
# 🚨 Chrome Extension API Endpoint Fix

## Issue Identified

Your Chrome extension is getting a **401 Unauthorized error** when calling `/api/ai/general/ask-stream` because there was a **route conflict** in the backend.

## Root Cause

The backend had two routers mounted on the same path:

1. `/api/ai` → `aiRouter` (requires strict authentication)
2. `/api/ai` → `genericAIRoutes` (allows optional authentication)

The first router was intercepting all requests, requiring authentication even for the general AI endpoint that should work anonymously.

## ✅ Fix Applied

**Backend Route Change:**

- Old: `/api/ai/general/ask-stream`
- New: `/api/generic-ai/ask-stream`

## 🤖 **WHEN TO USE WHICH AI ENDPOINT**

### **Generic AI** - `/api/generic-ai/*`

**Use for:** General questions not related to any specific session

- ✅ **Standalone AI chat** (like ChatGPT)
- ✅ **General knowledge questions**
- ✅ **When user is NOT in a specific session**
- ✅ **Works for both authenticated and anonymous users**

**Examples:**

- "What is JavaScript?"
- "Explain machine learning"
- "How do I center a div in CSS?"

### **Session-Specific AI** - `/api/sessions/{sessionId}/ai`

**Use for:** Questions related to a specific session context

- ✅ **When user is IN a specific session**
- ✅ **Questions about session content/transcript**
- ✅ **Context-aware responses based on session data**
- ✅ **Requires authentication** (user must be in the session)

**Examples:**

- "Can you explain what the professor just said about arrays?"
- "Summarize today's lecture"
- "What did we cover in the first 10 minutes?"

### **Decision Flow for Extension:**

````javascript
// Check if user is in a specific session
if (currentSessionId && isUserInSession) {
  // Use session-specific AI
  endpoint = `/api/sessions/${currentSessionId}/ai`;
  requiresAuth = true;
} else {
  // Use generic AI
  endpoint = `/api/ai-general/general/ask-stream`;
  requiresAuth = false;
}

## 🔧 Extension Code Fix Required

Update your extension's AI endpoint URLs:

### Before (Broken):

```javascript
const response = await fetch(
  "https://asklynk-backend-424701115132.us-central1.run.app/api/ai/general/ask-stream",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question: userQuestion }),
  }
);
````
`````

### After (Fixed):

```javascript
const response = await fetch(
  "https://asklynk-backend-424701115132.us-central1.run.app/api/ai-general/general/ask-stream",
  {
    method: "POST",
    credentials: "include", // IMPORTANT: Add this for proper auth handling
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question: userQuestion }),
  }
);
```

## 🏗️ Complete Implementation Example

Here's a complete extension implementation using the proper endpoint selection:

```javascript
class AskLynkExtension {
  constructor() {
    this.baseURL = "https://asklynk-backend-424701115132.us-central1.run.app";
    this.currentSessionId = null;
    this.isAuthenticated = false;
  }

  // Check authentication status
  async checkAuth() {
    try {
      const response = await fetch(`${this.baseURL}/api/auth/status`, {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        this.isAuthenticated = data.authenticated;
        this.currentSessionId = data.sessionId || null;
        return true;
      }
    } catch (error) {
      console.log("Auth check failed, using anonymous mode");
    }

    this.isAuthenticated = false;
    this.currentSessionId = null;
    return false;
  }

  // Smart endpoint selection
  getAIEndpoint() {
    if (this.isAuthenticated && this.currentSessionId) {
      return {
        url: `${this.baseURL}/api/sessions/${this.currentSessionId}/ai`,
        requiresAuth: true,
      };
    } else {
      return {
        url: `${this.baseURL}/api/generic-ai/ask-stream`,
        requiresAuth: false,
      };
    }
  }

  // Main AI query function
  async askQuestion(question) {
    // Always check auth first
    await this.checkAuth();

    const endpoint = this.getAIEndpoint();

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        credentials: "include", // Always include for proper session handling
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body.getReader();
      let result = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        result += chunk;
      }

      return result;
    } catch (error) {
      console.error("AI query failed:", error);
      throw error;
    }
  }

  // Usage examples
  async exampleUsage() {
    try {
      // This will automatically choose the right endpoint
      const answer = await this.askQuestion("What is machine learning?");
      console.log("AI Response:", answer);
    } catch (error) {
      console.error("Extension error:", error);
    }
  }
}

// Initialize extension
const askLynk = new AskLynkExtension();
```

## 📋 All Available Endpoints for Extension

### 🤖 **AI Endpoints (Work Anonymous & Authenticated)**

```javascript
// Streaming AI response
POST / api / generic - ai / ask - stream;

// Non-streaming AI response
POST / api / generic - ai / ask;
```

### 🔑 **Authentication Endpoints**

```javascript
// Check if user is authenticated
GET / api / auth / check;

// Get session details
GET / api / auth / session;

// Logout user
POST / api / auth / logout;
```

### 🎓 **Session Management**

```javascript
// Get user's sessions
GET / api / sessions;

// Get specific session details
GET / api / sessions / { sessionId };

// Join a session
POST / api / sessions / { sessionId } / join;

// Get session messages/questions
GET / api / sessions / { sessionId } / questions;
```

### 💬 **Submit Questions to Sessions**

```javascript
// Submit anonymous question
POST / api / anonymous / { sessionId } / question;

// Submit identified question (with user name)
POST / api / anonymous / { sessionId } / identified - question;
```

## 🧪 Test Endpoints

After making the changes, test these endpoints:

```bash
# Test anonymous AI access (should work)
curl -X POST https://asklynk-backend-424701115132.us-central1.run.app/api/generic-ai/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is JavaScript?"}'

# Test streaming AI (should work)
curl -X POST https://asklynk-backend-424701115132.us-central1.run.app/api/generic-ai/ask-stream \
  -H "Content-Type: application/json" \
  -d '{"question": "Explain arrays in programming"}'

# Test auth check
curl https://asklynk-backend-424701115132.us-central1.run.app/api/auth/check \
  -H "Cookie: your-session-cookie"
```

## 🎯 Complete Working Examples

### AI Request (Streaming)

```javascript
async function sendAIMessage(question) {
  try {
    const response = await fetch(
      "https://asklynk-backend-424701115132.us-central1.run.app/api/generic-ai/ask-stream",
      {
        method: "POST",
        credentials: "include", // Essential for auth
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
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
  } catch (error) {
    console.error("AI Request failed:", error);
  }
}
```

### Authentication Check

```javascript
async function checkAuth() {
  try {
    const response = await fetch(
      "https://asklynk-backend-424701115132.us-central1.run.app/api/auth/check",
      {
        method: "GET",
        credentials: "include", // Required for cookie auth
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const result = await response.json();

    if (result.isAuthenticated) {
      console.log("User is authenticated:", result.user);
      return result.user;
    } else {
      console.log("User is not authenticated");
      return null;
    }
  } catch (error) {
    console.error("Auth check failed:", error);
    return null;
  }
}
```

### Submit Question to Session

```javascript
async function submitQuestion(sessionId, question, isAnonymous = true) {
  const endpoint = isAnonymous ? "question" : "identified-question";

  try {
    const response = await fetch(
      `https://asklynk-backend-424701115132.us-central1.run.app/api/anonymous/${sessionId}/${endpoint}`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: question,
          relevance_score: 0.8, // Optional
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("Question submitted:", result);
    return result;
  } catch (error) {
    console.error("Question submission failed:", error);
    throw error;
  }
}
```

### Get User Sessions

```javascript
async function getUserSessions() {
  try {
    const response = await fetch(
      "https://asklynk-backend-424701115132.us-central1.run.app/api/sessions",
      {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status === 401) {
      console.log("User not authenticated");
      return [];
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error("Failed to get sessions:", error);
    return [];
  }
}
```

## 🔧 Extension Manifest Requirements

Make sure your extension manifest includes these permissions:

```json
{
  "permissions": ["cookies", "storage"],
  "host_permissions": [
    "https://asklynk-backend-424701115132.us-central1.run.app/*"
  ]
}
```

## 📝 Request Headers Checklist

For all API requests, ensure you include:

✅ `Content-Type: application/json`  
✅ `credentials: "include"`  
✅ Proper request body (JSON.stringify)  
✅ Error handling for HTTP status codes

## 🚨 Common Issues & Solutions

### Issue: Still getting 401 errors

**Solution**: Ensure `credentials: "include"` is in ALL requests

### Issue: AI responses not working

**Solution**: Use `/api/generic-ai/ask-stream` (not `/api/ai/general/ask-stream`)

### Issue: Session endpoints not working

**Solution**: User must be authenticated first (check `/api/auth/check`)

### Issue: CORS errors

**Solution**: Extension ID should be added to backend CORS config (let us know your extension ID)

## ✅ Status & Next Steps

- ✅ **Backend**: Fixed and deployed with correct routes
- ⚠️ **Extension**: Needs these URL updates and credentials
- 📖 **Documentation**: Complete API reference provided

### Required Changes Summary:

1. **Change URL**: `/api/ai/general/ask-stream` → `/api/generic-ai/ask-stream`
2. **Add credentials**: `credentials: "include"` to all fetch requests
3. **Update all endpoint paths** as documented above
4. **Test authentication flow** with provided examples

The backend is ready and all endpoints are working correctly. The extension just needs these URL and authentication updates!

````

### After (Fixed):

```javascript
const response = await fetch(
  "https://asklynk-backend-424701115132.us-central1.run.app/api/ai-general/general/ask-stream",
  {
    method: "POST",
    credentials: "include", // IMPORTANT: Add this for proper auth handling
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ question: userQuestion }),
  }
);
```

## 📝 Key Changes Needed in Extension

1. **Update URL**: Change `/api/ai/general/` to `/api/ai-general/general/`
2. **Add credentials**: Include `credentials: "include"` in all fetch requests
3. **Handle auth properly**: The endpoint works with or without authentication

## 🧪 Test Endpoints

After making the changes, test these endpoints:

```bash
# Test anonymous access (should work)
curl -X POST https://asklynk-backend-424701115132.us-central1.run.app/api/ai-general/general/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is JavaScript?"}'

# Test streaming (should work)
curl -X POST https://asklynk-backend-424701115132.us-central1.run.app/api/ai-general/general/ask-stream \
  -H "Content-Type: application/json" \
  -d '{"question": "Explain arrays in programming"}'
```

## 🎯 Complete Working Example

```javascript
async function sendAIMessage(question) {
  try {
    const response = await fetch(
      "https://asklynk-backend-424701115132.us-central1.run.app/api/ai-general/general/ask-stream",
      {
        method: "POST",
        credentials: "include", // Essential for auth
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Handle streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
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
  } catch (error) {
    console.error("AI Request failed:", error);
  }
}
```

## ✅ Status

- ✅ **Backend**: Fixed and deployed
- ⚠️ **Extension**: Needs URL update and credentials addition
- 📖 **Documentation**: Updated with correct endpoints

The backend is ready - the extension just needs these URL and credentials updates!
````
