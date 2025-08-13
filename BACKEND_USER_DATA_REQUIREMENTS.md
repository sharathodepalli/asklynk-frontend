# 🎯 **CRITICAL: Backend User Data Requirements**

## 🚨 **Current Issue**
The extension is successfully authenticating but **user data is missing or incomplete**. The extension logs show:
- `✅ Auth state updated - currentUser: Object` ✅ 
- `✅ User is authenticated: Object` ✅
- BUT user name and role are not displaying ❌

## 🔧 **Required Backend API Responses**

### **1. POST /api/auth/extension/session**
**What Frontend Sends:**
```json
{
  "supabase_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-from-supabase",
    "email": "user@example.com",
    "user_metadata": { /* Supabase metadata */ }
  },
  "extension_auth": true
}
```

**What Backend Must Return:**
```json
{
  "success": true,
  "message": "Session created successfully"
}
```

**CRITICAL:** Backend must also set an HttpOnly cookie with the session.

### **2. GET /api/auth/session** ⭐ **MOST IMPORTANT**
**What Extension Sends:**
- Cookies automatically included with request
- No body required

**What Backend MUST Return:**
```json
{
  "user": {
    "id": "user-unique-id",
    "username": "John Doe",
    "full_name": "John Doe", 
    "email": "user@example.com",
    "role": "professor"
  }
}
```

## 🎯 **Extension User Data Requirements**

Based on code analysis, the extension expects these user properties:

### **Required Fields:**
```javascript
{
  id: "string",           // REQUIRED - Used for API calls
  username: "string",     // REQUIRED - Primary display name
  email: "string",        // REQUIRED - Fallback display name
  role: "string"          // REQUIRED - "professor" or "student"
}
```

### **Optional Fields:**
```javascript
{
  full_name: "string",    // Alternative to username
  name: "string"          // Alternative to username
}
```

### **How Extension Uses Each Field:**

1. **`id`** - Used for:
   - API calls to `/api/sessions/professor/{id}`
   - Creating sessions
   - Message attribution

2. **`username` or `full_name`** - Used for:
   - Display in chat header: `currentUser.username || currentUser.full_name || 'User'`
   - User initials: `(currentUser.username || currentUser.full_name || 'U').charAt(0)`
   - Popup display: `user.username || user.name || 'User'`

3. **`email`** - Used for:
   - Fallback display name
   - Popup subtitle display

4. **`role`** - Used for:
   - UI role display: `capitalizeFirstLetter(currentUser.role || 'User')`
   - Feature access: `if (currentUser.role === 'professor')`
   - Session creation permissions

## 🧪 **Test Your Backend Response**

### **Test Command:**
```bash
# After user signs in through extension, test session endpoint:
curl -X GET "https://asklynk-backend-424701115132.us-central1.run.app/api/auth/session" \
  -H "Cookie: your-session-cookie-here" \
  -H "Accept: application/json" \
  -v
```

### **Expected Response:**
```json
{
  "user": {
    "id": "12345",
    "username": "John Doe",
    "email": "john@example.com", 
    "role": "professor"
  }
}
```

## ❌ **Common Backend Mistakes**

### **1. Wrong Response Structure:**
```json
// ❌ WRONG - Extension expects "user" property
{
  "id": "123",
  "username": "John",
  "role": "professor"
}

// ✅ CORRECT - Wrap in "user" object
{
  "user": {
    "id": "123", 
    "username": "John",
    "role": "professor"
  }
}
```

### **2. Missing Required Fields:**
```json
// ❌ WRONG - Missing username and role
{
  "user": {
    "id": "123",
    "email": "john@example.com"
  }
}

// ✅ CORRECT - All required fields present
{
  "user": {
    "id": "123",
    "username": "John Doe",
    "email": "john@example.com", 
    "role": "professor"
  }
}
```

### **3. Wrong Role Values:**
```json
// ❌ WRONG - Extension expects lowercase
{
  "user": {
    "role": "Professor"  // Should be "professor"
  }
}

// ✅ CORRECT - Lowercase role values
{
  "user": {
    "role": "professor"  // or "student"
  }
}
```

## 🔄 **Data Flow Summary**

1. **Frontend** → **Backend**: Creates session with Supabase user data
2. **Backend**: Stores session and user data in database
3. **Extension** → **Backend**: Requests session validation 
4. **Backend** → **Extension**: Returns complete user object
5. **Extension**: Displays user name and role in UI

## 🎯 **Action Items for Backend Team**

### **Immediate Tasks:**
1. ✅ Verify `/api/auth/extension/session` creates session properly
2. ✅ Verify `/api/auth/session` returns user data in correct format
3. ✅ Test with actual extension auth flow
4. ✅ Ensure all required user fields are included

### **Debug Steps:**
1. **Check session creation logs** when extension authenticates
2. **Verify user data** is being stored with username and role
3. **Test session validation** returns complete user object
4. **Confirm cookie settings** work with chrome-extension origin

## 🚀 **Quick Test Script**

```javascript
// Test in browser console after extension auth:
chrome.runtime.sendMessage({type: 'CHECK_AUTH'}, (response) => {
  console.log('Auth Response:', response);
  if (response.user) {
    console.log('✅ User ID:', response.user.id);
    console.log('✅ Username:', response.user.username);
    console.log('✅ Email:', response.user.email);
    console.log('✅ Role:', response.user.role);
  } else {
    console.log('❌ No user data received');
  }
});
```

---

**🔥 The extension auth flow is working perfectly - we just need the backend to return complete user data in the session validation response!**