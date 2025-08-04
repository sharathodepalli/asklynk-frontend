// Test Script for AskLynk Extension Authentication
// Copy and paste this into the browser console to test auth communication

console.log('🧪 AskLynk Extension Auth Test Script');

// Extension ID - REPLACE THIS WITH YOUR ACTUAL EXTENSION ID
const EXTENSION_ID = 'YOUR_EXTENSION_ID_HERE'; // Get this from chrome://extensions/

// Test data
const testAuthData = {
  type: 'LOGIN_SUCCESS',
  userId: 'test_user_123',
  username: 'john.doe',
  role: 'student',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token'
};

// Function to test external message sending
function testExtensionAuth() {
  console.log('📤 Sending LOGIN_SUCCESS message to extension...');
  
  if (!EXTENSION_ID || EXTENSION_ID === 'YOUR_EXTENSION_ID_HERE') {
    console.error('❌ Please set the correct EXTENSION_ID first!');
    console.log('💡 Get the Extension ID from chrome://extensions/');
    return;
  }
  
  chrome.runtime.sendMessage(EXTENSION_ID, testAuthData, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Error:', chrome.runtime.lastError.message);
    } else {
      console.log('✅ Response from extension:', response);
      
      if (response && response.success) {
        console.log('🎉 SUCCESS: Extension received auth data!');
        
        // Test if auth state is stored
        setTimeout(() => {
          testAuthStorage();
        }, 500);
      } else {
        console.log('❌ FAILED: Extension rejected auth data');
      }
    }
  });
}

// Function to test auth storage verification
function testAuthStorage() {
  console.log('🔍 Testing auth storage verification...');
  
  chrome.runtime.sendMessage(EXTENSION_ID, { type: 'TEST_AUTH_STORAGE' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Storage test error:', chrome.runtime.lastError.message);
    } else {
      console.log('📊 Storage test results:', response);
      
      if (response.matches) {
        console.log('✅ SUCCESS: Auth state properly stored and matches!');
      } else {
        console.log('❌ WARNING: Stored state doesn\'t match current state');
        console.log('Current:', response.currentState);
        console.log('Stored:', response.storedState);
      }
    }
  });
}

// Function to check current auth state
function checkAuthState() {
  console.log('🔍 Checking current auth state...');
  
  chrome.runtime.sendMessage(EXTENSION_ID, { type: 'CHECK_AUTH' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ Auth check error:', chrome.runtime.lastError.message);
    } else {
      console.log('📊 Current auth state:', response);
      
      if (response.isLoggedIn) {
        console.log('✅ User is logged in:', response.user.username);
      } else {
        console.log('❌ User is not logged in');
      }
    }
  });
}

// Instructions
console.log('📋 Instructions:');
console.log('1. Replace EXTENSION_ID with your actual extension ID');
console.log('2. Run: testExtensionAuth() - to simulate login');
console.log('3. Run: checkAuthState() - to check current state');
console.log('4. Run: testAuthStorage() - to verify storage');

// Auto-detect if we can find the extension ID
if (typeof chrome !== 'undefined' && chrome.management) {
  chrome.management.getAll((extensions) => {
    const askLynkExt = extensions.find(ext => ext.name.toLowerCase().includes('asklynk'));
    if (askLynkExt) {
      console.log('🔍 Found potential AskLynk extension:', askLynkExt.id);
      console.log('💡 You can use this ID: ' + askLynkExt.id);
    }
  });
}

// Export functions globally for easy access
window.testExtensionAuth = testExtensionAuth;
window.checkAuthState = checkAuthState;
window.testAuthStorage = testAuthStorage;

console.log('🚀 Test functions ready! Use testExtensionAuth() to start.');
