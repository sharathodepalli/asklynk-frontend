# 🎯 **Updated Frontend Requirements - Chrome Identity API Flow**

## **Key Change: Standard Chrome Identity API Pattern**

### **What the Extension Now Sends:**
```
https://asklynk.vercel.app/?extension=true&returnUrl=https://[EXTENSION_ID].chromiumapp.org/cb&api_base=https://asklynk-backend-424701115132.us-central1.run.app
```

**Note:** The `returnUrl` is now a standard Chrome Identity callback URL, not a custom extension page.

### **Required Frontend Implementation:**

```javascript
// 1. Detect Extension Auth Request
const urlParams = new URLSearchParams(window.location.search);
const isExtensionAuth = urlParams.get('extension') === 'true';
const returnUrl = urlParams.get('returnUrl'); // Chrome Identity callback URL
const apiBase = urlParams.get('api_base');

console.log('Auth Debug:', { isExtensionAuth, returnUrl, apiBase });

// 2. After Successful Supabase Authentication
async function handleSuccessfulAuth(supabaseSession) {
    if (isExtensionAuth && returnUrl && apiBase) {
        try {
            console.log('🔄 Creating backend session for extension...');
            
            // Create backend session from Supabase token
            const response = await fetch(`${apiBase}/api/auth/extension/session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseSession.access_token}`
                },
                credentials: 'include', // CRITICAL for cookie setting
                body: JSON.stringify({
                    supabase_token: supabaseSession.access_token,
                    user: supabaseSession.user,
                    extension_auth: true
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Backend session creation failed: ${errorText}`);
            }
            
            console.log('✅ Backend session created successfully');
            
            // Clear Supabase session (extension will use backend cookies)
            await supabase.auth.signOut();
            
            console.log('🔄 Redirecting back to extension with ok=1...');
            
            // ⭐ KEY CHANGE: Redirect to Chrome Identity callback with ok=1
            window.location.href = `${returnUrl}?ok=1`;
            
        } catch (error) {
            console.error('❌ Extension auth error:', error);
            // Redirect with error (no ok=1 parameter)
            window.location.href = `${returnUrl}?error=${encodeURIComponent(error.message)}`;
        }
    } else {
        // Normal web auth flow
        handleNormalWebAuth(supabaseSession);
    }
}

// 3. Error Handling
function handleAuthError(error) {
    if (isExtensionAuth && returnUrl) {
        console.error('❌ Extension auth failed:', error);
        window.location.href = `${returnUrl}?error=${encodeURIComponent(error.message)}`;
    } else {
        // Handle normal web auth error
        throw error;
    }
}
```

### **🔍 Key Differences from Previous Version:**

| **Aspect** | **Previous (Custom)** | **Current (Chrome Identity)** |
|------------|----------------------|-------------------------------|
| **Callback URL** | `chrome-extension://ID/callback.html` | `https://ID.chromiumapp.org/cb` |
| **Success Indicator** | `?success=true` | `?ok=1` |
| **Error Handling** | `?error=message` | No `ok=1` parameter or `?error=message` |

### **✅ Success Criteria:**

1. **Detect Extension Request:** ✅ Check for `?extension=true`
2. **Complete Supabase Auth:** ✅ Normal login flow
3. **Create Backend Session:** ✅ POST to `/api/auth/extension/session`
4. **Set Session Cookie:** ✅ Use `credentials: 'include'` 
5. **Clear Supabase Session:** ✅ Call `supabase.auth.signOut()`
6. **Redirect with Success:** ✅ `${returnUrl}?ok=1`

### **🧪 Testing Checklist:**

- [ ] Extension opens correct URL with Chrome Identity callback
- [ ] Frontend detects `extension=true` parameter
- [ ] Supabase authentication completes normally
- [ ] Backend session creation succeeds with `credentials: 'include'`
- [ ] Supabase session is cleared after backend session
- [ ] Redirect to `${returnUrl}?ok=1` happens
- [ ] Extension detects `ok=1` and validates session
- [ ] All subsequent API calls work with cookies

### **🚨 Common Issues to Check:**

1. **CORS Configuration:** Backend must allow `chrome-extension://` origins
2. **Cookie Domain:** Must be `.asklynk.com` for subdomain sharing
3. **Cookie Attributes:** `HttpOnly, Secure, SameSite=None`
4. **Redirect URL:** Must be exact `returnUrl` from parameter
5. **Error Encoding:** Use `encodeURIComponent()` for error messages

### **Example Complete Flow:**

```
1. Extension → https://asklynk.vercel.app/?extension=true&returnUrl=https://abc123.chromiumapp.org/cb&api_base=https://asklynk-backend-424701115132.us-central1.run.app
2. User → Completes Supabase login
3. Frontend → POST https://asklynk-backend-424701115132.us-central1.run.app/api/auth/extension/session (with credentials)
4. Backend → Sets HttpOnly cookie + responds 200 OK
5. Frontend → Clears Supabase session
6. Frontend → Redirects to https://abc123.chromiumapp.org/cb?ok=1
7. Extension → Detects ok=1, calls GET /api/auth/session
8. Extension → Updates UI with authenticated user
```

That's it! The extension is now properly configured for the Chrome Identity API flow. 🎉