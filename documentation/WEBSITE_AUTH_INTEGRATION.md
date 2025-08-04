# Website Authentication Integration with Chrome Extension

## Overview

This document explains how the AskLynk website should communicate authentication success back to the Chrome extension after a user logs in.

## Current Auth Flow

1. User clicks "Sign In" in Chrome extension
2. Extension opens: `https://asklynk-gzn56f93d-sharath-chandra-s-projects.vercel.app/auth?extension_auth=true&from_extension=true`
3. User completes login on website
4. **[MISSING STEP]** Website needs to notify extension of successful login
5. Extension should update its authentication state

## Problem

The extension is not receiving authentication data from the website after successful login.

## Solution: Two Methods Available

### Method 1: External Message (Recommended)

After successful login, the website should send a message to the extension:

```javascript
// On your auth success page, add this JavaScript:
if (window.location.search.includes("extension_auth=true")) {
  // Get the extension ID (you'll need to replace this with actual extension ID)
  const extensionId = "YOUR_EXTENSION_ID_HERE";

  // Send authentication data to extension
  chrome.runtime.sendMessage(
    extensionId,
    {
      type: "LOGIN_SUCCESS",
      userId: user.id, // Required: User ID
      username: user.username, // Required: Username
      role: user.role, // Optional: User role
      token: user.token, // Required: Authentication token
    },
    (response) => {
      if (response && response.success) {
        console.log("Extension notified successfully");
        // Close the auth tab or redirect as needed
        window.close();
      }
    }
  );
}
```

### Method 2: URL Redirect (Alternative)

Redirect to a special success URL with user data in query parameters:

```javascript
// After successful login, redirect to:
const successUrl =
  `https://asklynk-gzn56f93d-sharath-chandra-s-projects.vercel.app/auth-success?` +
  `username=${encodeURIComponent(user.username)}&` +
  `userId=${encodeURIComponent(user.id)}&` +
  `role=${encodeURIComponent(user.role)}&` +
  `token=${encodeURIComponent(user.token)}`;

window.location.href = successUrl;
```

## Required Data Fields

The extension expects these fields in the authentication data:

| Field      | Type   | Required | Description                              |
| ---------- | ------ | -------- | ---------------------------------------- |
| `userId`   | string | ✅ Yes   | Unique user identifier                   |
| `username` | string | ✅ Yes   | User's username                          |
| `token`    | string | ✅ Yes   | Authentication token                     |
| `role`     | string | ❌ No    | User's role (e.g., 'student', 'teacher') |

## Testing the Integration

### 1. Check Extension ID

First, you need the actual extension ID. You can find it by:

- Installing the extension in developer mode
- Going to `chrome://extensions/`
- Finding the extension ID under the extension details

### 2. Test External Message Method

Add this test code to your auth page:

```javascript
// Test function - add to your auth page
function testExtensionMessage() {
  const extensionId = "YOUR_ACTUAL_EXTENSION_ID";

  chrome.runtime.sendMessage(
    extensionId,
    {
      type: "LOGIN_SUCCESS",
      userId: "test123",
      username: "testuser",
      role: "student",
      token: "test_token_12345",
    },
    (response) => {
      console.log("Extension response:", response);
    }
  );
}

// Call this after successful login
testExtensionMessage();
```

### 3. Verify Extension Receives Message

Open the extension's background script console:

1. Go to `chrome://extensions/`
2. Find AskLynk extension
3. Click "Inspect views: background page"
4. Look for logs like: "Received external message"

## Example Implementation

Here's a complete example for your auth success handler:

```javascript
// auth-success.js - Add to your authentication success page

function notifyExtensionOfLogin(userData) {
  // Check if this is an extension-initiated auth
  const urlParams = new URLSearchParams(window.location.search);
  const isExtensionAuth = urlParams.get("extension_auth") === "true";

  if (!isExtensionAuth) {
    console.log("Not an extension auth, skipping extension notification");
    return;
  }

  // Extension ID - Replace with your actual extension ID
  const extensionId = "YOUR_EXTENSION_ID_HERE";

  try {
    chrome.runtime.sendMessage(
      extensionId,
      {
        type: "LOGIN_SUCCESS",
        userId: userData.id,
        username: userData.username,
        role: userData.role,
        token: userData.authToken,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error sending message to extension:",
            chrome.runtime.lastError
          );
        } else if (response && response.success) {
          console.log("Extension notified successfully");
          // Close the auth window
          setTimeout(() => {
            window.close();
          }, 1000);
        } else {
          console.error("Extension returned error:", response);
        }
      }
    );
  } catch (error) {
    console.error("Failed to notify extension:", error);
  }
}

// Call this function after successful login with user data
// notifyExtensionOfLogin(yourUserDataObject);
```

## Troubleshooting

### Extension Not Receiving Messages

1. **Check Extension ID**: Make sure you're using the correct extension ID
2. **Check Manifest**: Verify your domain is in `externally_connectable`
3. **Check Console**: Look for errors in both website and extension consoles
4. **Check URL Parameters**: Ensure `extension_auth=true` is present

### Message Format Issues

1. **Required Fields**: Ensure `userId`, `username`, and `token` are provided
2. **Data Types**: All fields should be strings
3. **Message Type**: Must be exactly `'LOGIN_SUCCESS'`

### Window Closing Issues

1. **Timing**: Add a small delay before closing window
2. **Error Handling**: Only close window on successful response
3. **Fallback**: Provide manual close button if auto-close fails

## Next Steps

1. **Get Extension ID**: Install extension and find the actual extension ID
2. **Implement Method 1**: Add external message sending to your auth success flow
3. **Test Integration**: Verify extension receives auth data
4. **Handle Edge Cases**: Add error handling and fallbacks
5. **Production Testing**: Test with the production extension

## Questions?

If you need clarification on any part of this integration, please let me know and I can provide more specific guidance or examples.
