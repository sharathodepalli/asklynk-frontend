# Chrome Extension API Documentation

**Last Updated**: August 12, 2025  
**Backend URL**: `https://asklynk-backend-424701115132.us-central1.run.app`  
**Authentication**: Cookie-based sessions (NOT tokens)

## 🔑 Authentication Overview

The backend uses **cookie-based authentication** with HTTP-only session cookies. The extension should:

- Use `credentials: 'include'` in all fetch requests
- Never manage tokens manually
- Rely on browser's automatic cookie handling

## 📋 Authentication Endpoints

### 1. Check Authentication Status

**Endpoint**: `GET /api/auth/check`  
**Purpose**: Verify if user is authenticated  
**Usage**: Call this before any major action

```javascript
// Usage Example
const response = await fetch(
  "https://asklynk-backend-424701115132.us-central1.run.app/api/auth/check",
  {
    method: "GET",
    credentials: "include", // REQUIRED
    headers: {
      "Content-Type": "application/json",
    },
  }
);

const result = await response.json();
```

**Response Format**:

```json
// Success (authenticated)
{
  "isAuthenticated": true,
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "full_name": "John Doe",
    "role": "student"
  }
}

// Not authenticated
{
  "isAuthenticated": false,
  "success": false,
  "error": "No session found"
}
```

### 2. Get Session Information

**Endpoint**: `GET /api/auth/session`  
**Purpose**: Get detailed session info including expiry

```javascript
const response = await fetch(
  "https://asklynk-backend-424701115132.us-central1.run.app/api/auth/session",
  {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }
);
```

**Response Format**:

```json
{
  "ok": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "full_name": "John Doe",
    "role": "student"
  },
  "expires_at": "2025-08-13T02:00:00.000Z"
}
```

### 3. Logout

**Endpoint**: `POST /api/auth/logout`  
**Purpose**: Clear session and logout user

```javascript
const response = await fetch(
  "https://asklynk-backend-424701115132.us-central1.run.app/api/auth/logout",
  {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }
);
```

**Response Format**:

```json
{
  "ok": true,
  "message": "Logged out successfully"
}
```

## 🎓 Session Management Endpoints

### 1. Get User's Sessions

**Endpoint**: `GET /api/sessions`  
**Purpose**: Get all sessions user has access to

```javascript
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
```

**Response Format**:

```json
{
  "ok": true,
  "data": [
    {
      "id": "session-uuid",
      "title": "Introduction to Computer Science",
      "code": "CS101",
      "status": "active",
      "created_at": "2025-08-12T10:00:00Z",
      "professor_id": "prof-uuid"
    }
  ]
}
```

### 2. Get Session Details

**Endpoint**: `GET /api/sessions/{sessionId}`  
**Purpose**: Get detailed information about a specific session

```javascript
const sessionId = "1899d382-3921-4271-b44d-94356f0c9bf7";
const response = await fetch(
  `https://asklynk-backend-424701115132.us-central1.run.app/api/sessions/${sessionId}`,
  {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }
);
```

### 3. Join Session

**Endpoint**: `POST /api/sessions/{sessionId}/join`  
**Purpose**: Join a session as a student

```javascript
const response = await fetch(
  `https://asklynk-backend-424701115132.us-central1.run.app/api/sessions/${sessionId}/join`,
  {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }
);
```

## 💬 Question/Message Endpoints

### 1. Get Session Questions

**Endpoint**: `GET /api/sessions/{sessionId}/questions`  
**Purpose**: Get all questions in a session (professor view)

```javascript
const response = await fetch(
  `https://asklynk-backend-424701115132.us-central1.run.app/api/sessions/${sessionId}/questions`,
  {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
  }
);
```

### 2. Submit Anonymous Question

**Endpoint**: `POST /api/anonymous/{sessionId}/question`  
**Purpose**: Submit an anonymous question to a session

```javascript
const response = await fetch(
  `https://asklynk-backend-424701115132.us-central1.run.app/api/anonymous/${sessionId}/question`,
  {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: "What is the difference between let and const?",
      relevance_score: 0.8,
    }),
  }
);
```

### 3. Submit Public Question

**Endpoint**: `POST /api/anonymous/{sessionId}/identified-question`  
**Purpose**: Submit a question with user's name visible

```javascript
const response = await fetch(
  `https://asklynk-backend-424701115132.us-central1.run.app/api/anonymous/${sessionId}/identified-question`,
  {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: "Could you explain this concept again?",
      relevance_score: 0.9,
    }),
  }
);
```

## 🔒 Error Handling

### Common HTTP Status Codes

- **200**: Success
- **401**: Not authenticated (redirect to login)
- **403**: Forbidden (insufficient permissions)
- **404**: Resource not found
- **500**: Server error

### Error Response Format

```json
{
  "ok": false,
  "error": "Error message here"
}
```

## 🛠 Extension Implementation Guide

### 1. Authentication Check Pattern

```javascript
async function ensureAuthenticated() {
  try {
    const response = await fetch("/api/auth/check", {
      credentials: "include",
    });

    const result = await response.json();

    if (!result.isAuthenticated) {
      // Redirect to login
      redirectToLogin();
      return null;
    }

    return result.user;
  } catch (error) {
    console.error("Auth check failed:", error);
    redirectToLogin();
    return null;
  }
}
```

### 2. API Call Wrapper

```javascript
async function apiCall(endpoint, options = {}) {
  const url = `https://asklynk-backend-424701115132.us-central1.run.app${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include", // Always include cookies
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === 401 || response.status === 403) {
    // Authentication failed, redirect to login
    redirectToLogin();
    throw new Error("Authentication required");
  }

  return response.json();
}
```

### 3. Login Redirect

```javascript
function redirectToLogin() {
  const loginUrl = new URL("https://your-login-page.com/login");
  loginUrl.searchParams.set("extension", "true");
  loginUrl.searchParams.set("returnUrl", window.location.href);
  loginUrl.searchParams.set(
    "api_base",
    "https://asklynk-backend-424701115132.us-central1.run.app"
  );

  window.open(loginUrl.toString(), "_blank");
}
```

## ⚙️ Required Manifest Permissions

```json
{
  "permissions": ["cookies", "storage"],
  "host_permissions": [
    "https://asklynk-backend-424701115132.us-central1.run.app/*"
  ]
}
```

## 🌐 CORS Configuration

The backend is configured to accept requests from:

- `chrome-extension://dokfobplbpfdbnlfhhaemkebcjbjkmpp`
- `chrome-extension://gbkjeipbkdgbimeagdgomebmjaggnbel`

If your extension ID is different, it needs to be added to the backend CORS configuration.

## 🚨 Critical Points

### ✅ DO:

- Always use `credentials: 'include'` in fetch requests
- Check authentication before making API calls
- Handle 401/403 responses by redirecting to login
- Use cookie-based authentication exclusively

### ❌ DON'T:

- Use Authorization headers with tokens
- Store or manage tokens manually
- Try to parse or validate session cookies
- Cache authentication state beyond basic UX

## 📞 Support

If you encounter issues:

1. Check browser console for CORS errors
2. Verify extension ID is in backend CORS config
3. Ensure `credentials: 'include'` is used in all requests
4. Check that cookies are being sent in browser dev tools

**Backend Status**: ✅ Fully functional and properly configured  
**Extension Status**: ⚠️ Needs to implement cookie-based auth flow
