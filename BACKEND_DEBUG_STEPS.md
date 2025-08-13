# 🔧 Backend Debug Steps - 403 Session Validation Error

## 🚨 IMMEDIATE ISSUE
Extension auth flow works perfectly until session validation fails with **403 Forbidden** on:
```
GET https://asklynk-backend-424701115132.us-central1.run.app/api/auth/session
```

## 🧪 TEST THESE BACKEND ENDPOINTS

### 1. **Test Session Endpoint**
```bash
curl -X GET "https://asklynk-backend-424701115132.us-central1.run.app/api/auth/session" \
  -H "Accept: application/json" \
  -v
```
**Expected:** Should return 401 (unauthorized) not 403 (forbidden)

### 2. **Test Extension Session Creation**
```bash
curl -X POST "https://asklynk-backend-424701115132.us-central1.run.app/api/auth/extension/session" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"test": true}' \
  -v
```

### 3. **Test CORS Headers**
```bash
curl -X OPTIONS "https://asklynk-backend-424701115132.us-central1.run.app/api/auth/session" \
  -H "Origin: chrome-extension://gbkjeipbkdgbimeagdgomebmjaggnbel" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

## 🔧 REQUIRED BACKEND FIXES

### **1. CORS Configuration**
Add these origins to CORS:
```
chrome-extension://gbkjeipbkdgbimeagdgomebmjaggnbel
https://asklynk.vercel.app
```

### **2. Session Cookie Configuration**
```javascript
// Cookie must be accessible cross-origin
res.cookie('session_id', sessionId, {
  httpOnly: true,
  secure: true,
  sameSite: 'none',  // CRITICAL for extension access
  domain: '.asklynk.com', // If using subdomain
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

### **3. Required Headers**
```javascript
// CORS headers for extension
res.header('Access-Control-Allow-Origin', 'chrome-extension://gbkjeipbkdgbimeagdgomebmjaggnbel');
res.header('Access-Control-Allow-Credentials', 'true');
res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
```

## 🔍 DEBUG QUESTIONS

1. **Do the endpoints exist?** Check if `/api/auth/session` returns 404 vs 403
2. **Is CORS configured?** 403 often means CORS rejection
3. **Are cookies working?** Frontend should set session cookie during auth
4. **Is the session created?** Frontend must call `POST /api/auth/extension/session`

## 🎯 EXPECTED FLOW

1. Frontend calls: `POST /api/auth/extension/session` (creates session cookie)
2. Extension calls: `GET /api/auth/session` (validates session cookie)
3. Should return: `{ user: {...}, authenticated: true }`

## 🚨 QUICK CHECK
The 403 error suggests the endpoint exists but rejects the request. This is likely:
- **CORS rejection** (most likely)
- **Missing session cookie** (cookie not created by frontend)
- **Wrong endpoint path** (should be `/api/auth/session` not `/auth/session`)