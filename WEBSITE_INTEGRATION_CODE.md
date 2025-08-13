# Website Integration Code for AskLynk Extension

## 🎯 The Problem
After the user successfully signs in on your website, the website needs to send the authentication data back to the Chrome extension so the extension knows the user is now authenticated.

## 🔧 Solution: Add This Code to Your Website

### Step 1: Detect Extension Authentication Request
Add this to your website's authentication completion page (after successful login):

```javascript
// Check if this login was initiated by the Chrome extension
const urlParams = new URLSearchParams(window.location.search);
const fromExtension = urlParams.get('extension_auth') === 'true' || urlParams.get('from_extension') === 'true';

if (fromExtension) {
    console.log('🔍 Login initiated by AskLynk extension');
    
    // After successful authentication, send data to extension
    sendAuthToExtension(userAuthData);
}
```

### Step 2: Send Authentication Data to Extension
```javascript
async function sendAuthToExtension(userAuthData) {
    try {
        // Your extension ID (get this from chrome://extensions/)
        const extensionId = 'YOUR_EXTENSION_ID_HERE'; // Replace with actual extension ID
        
        // Prepare auth data
        const authMessage = {
            type: 'LOGIN_SUCCESS',
            token: userAuthData.accessToken,      // JWT token from your auth system
            userId: userAuthData.user.id,         // User ID
            username: userAuthData.user.username, // Username
            email: userAuthData.user.email,       // Email (optional)
            role: userAuthData.user.role || 'user' // Role (optional)
        };
        
        console.log('📤 Sending auth data to extension:', authMessage);
        
        // Send message to extension
        chrome.runtime.sendMessage(extensionId, authMessage, (response) => {
            console.log('📥 Extension response:', response);
            
            if (chrome.runtime.lastError) {
                console.error('❌ Failed to send to extension:', chrome.runtime.lastError);
                // Handle error - maybe show a message to user
                showMessage('Extension communication failed. Please refresh and try again.', 'error');
            } else if (response && response.success) {
                console.log('✅ Authentication sent to extension successfully!');
                // Success! Close this tab or redirect
                showMessage('Authentication successful! You can close this tab.', 'success');
                
                // Auto-close tab after 2 seconds
                setTimeout(() => {
                    window.close();
                }, 2000);
            } else {
                console.error('❌ Extension rejected authentication:', response);
                showMessage('Authentication failed. Please try again.', 'error');
            }
        });
        
    } catch (error) {
        console.error('❌ Error sending auth to extension:', error);
        showMessage('Failed to communicate with extension.', 'error');
    }
}

function showMessage(text, type = 'info') {
    // Implementation depends on your UI framework
    // Example for simple alert:
    alert(text);
    
    // Or create a notification div:
    /*
    const div = document.createElement('div');
    div.textContent = text;
    div.className = `notification ${type}`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
    */
}
```

### Step 3: Complete Integration Example

```javascript
// Complete example for your authentication success page
document.addEventListener('DOMContentLoaded', function() {
    // Check if this login was initiated by the extension
    const urlParams = new URLSearchParams(window.location.search);
    const fromExtension = urlParams.get('extension_auth') === 'true' || 
                          urlParams.get('from_extension') === 'true';
    
    if (fromExtension) {
        console.log('🔍 Handling extension authentication...');
        
        // Wait for your auth system to complete, then send data to extension
        // This depends on how your authentication system works
        
        // Option A: If you have the user data immediately available
        if (window.currentUser && window.authToken) {
            sendAuthToExtension({
                user: window.currentUser,
                accessToken: window.authToken
            });
        }
        
        // Option B: If you need to fetch user data from your API
        /*
        fetchUserData().then(userData => {
            sendAuthToExtension(userData);
        });
        */
        
        // Option C: Listen for your auth system's success event
        /*
        document.addEventListener('authComplete', (event) => {
            sendAuthToExtension(event.detail);
        });
        */
    }
});

// You can also trigger this manually after successful login
function onLoginSuccess(userData) {
    // Your existing login success logic
    // ...
    
    // If this was from extension, send data back
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('extension_auth') === 'true') {
        sendAuthToExtension(userData);
    }
}
```

## 🚀 Testing the Integration

### Step 1: Get Your Extension ID
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Find "AskLynk" extension and copy its ID

### Step 2: Update the Code
Replace `'YOUR_EXTENSION_ID_HERE'` with your actual extension ID

### Step 3: Test the Flow
1. Click "Sign In" on the extension
2. Complete authentication on your website
3. The website should automatically send data to extension and close the tab
4. Extension should show user as authenticated

## 🔍 Debugging

Add this to your website's console to test:

```javascript
// Test extension communication
const extensionId = 'YOUR_EXTENSION_ID_HERE';

// Test if extension is available
chrome.runtime.sendMessage(extensionId, { type: 'CHECK_EXTENSION' }, (response) => {
    if (chrome.runtime.lastError) {
        console.error('Extension not found:', chrome.runtime.lastError);
    } else {
        console.log('✅ Extension found:', response);
    }
});

// Test sending auth data
chrome.runtime.sendMessage(extensionId, {
    type: 'LOGIN_SUCCESS',
    token: 'test-token',
    userId: 'test-user-123',
    username: 'testuser',
    email: 'test@example.com',
    role: 'user'
}, (response) => {
    console.log('Auth test response:', response);
});
```

## 📋 Required User Data Fields

The extension expects these fields:
- ✅ **token** (required) - JWT access token
- ✅ **userId** (required) - Unique user identifier  
- ✅ **username** (required) - Display name
- ⚪ **email** (optional) - User email
- ⚪ **role** (optional) - User role (defaults to 'user')

## ⚠️ Important Notes

1. **Extension ID**: Must match exactly - get it from `chrome://extensions/`
2. **URL Parameters**: Extension adds `?extension_auth=true&from_extension=true`
3. **Auto-close**: Website should close the tab after successful auth
4. **Error Handling**: Always check for `chrome.runtime.lastError`
5. **Testing**: Use the test functions to verify communication works

This integration will fix the authentication flow and allow users to sign in properly!