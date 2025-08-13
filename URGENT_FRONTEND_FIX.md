# 🚨 URGENT: Frontend Website Fix Required

## Problem
The Chrome extension is correctly opening:
```
https://asklynk.vercel.app/?extension=true&returnUrl=https%3A%2F%2F[ID].chromiumapp.org%2Fcb&api_base=https%3A%2F%2Fasklynk-bkend.vercel.app
```

But the website is redirecting to `/auth` instead of handling the extension parameters at the root route.

## Required Frontend Changes

### 1. **Root Route Handler** (Priority: HIGH)
The website **MUST** handle extension auth at the **root path** (`/`) not `/auth`:

```javascript
// At the root page (https://asklynk.vercel.app/)
const urlParams = new URLSearchParams(window.location.search);
const isExtensionAuth = urlParams.get('extension') === 'true';

if (isExtensionAuth) {
    console.log('🔌 Extension auth request detected');
    const returnUrl = urlParams.get('returnUrl');
    const apiBase = urlParams.get('api_base');
    
    // Handle extension auth flow here
    // (Use the code from frontend-auth-requirements-updated.md)
}
```

### 2. **Stop Redirecting to /auth**
Remove any automatic redirects from root (`/`) to `/auth` when extension parameters are present.

### 3. **Success Redirect Format**
After successful Supabase authentication, redirect with **ok=1**:
```javascript
// ✅ CORRECT - Extension expects ok=1
window.location.href = `${returnUrl}?ok=1`;

// ❌ WRONG - Don't use success=true
// window.location.href = `${returnUrl}?success=true`;
```

### 4. **Error Redirect Format**
For errors, redirect WITHOUT the ok=1 parameter:
```javascript
// For errors
window.location.href = `${returnUrl}?error=${encodeURIComponent(error.message)}`;
```

## Testing URLs

Extension will open:
```
https://asklynk.vercel.app/?extension=true&returnUrl=https%3A%2F%2F[EXTENSION_ID].chromiumapp.org%2Fcb&api_base=https%3A%2F%2Fasklynk-backend-424701115132.us-central1.run.app
```

Should redirect back to:
```
https://[EXTENSION_ID].chromiumapp.org/cb?ok=1
```

## Backend Endpoints Required
- ✅ `POST /api/auth/extension/session` - Create session from Supabase token
- ✅ `GET /api/auth/session` - Validate session
- ✅ `POST /api/auth/logout` - Clear session

All endpoints must support `credentials: 'include'` for cookie handling.

---
**CRITICAL:** The website must handle extension auth at the ROOT PATH, not redirect to /auth!