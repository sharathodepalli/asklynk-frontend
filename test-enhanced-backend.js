/**
 * Enhanced Backend Integration Test Script
 * 
 * Run this in the browser console after loading the extension
 * to verify the enhanced backend integration is working correctly.
 */

// Test function to verify enhanced backend integration
function testEnhancedBackendIntegration() {
  console.log('🧪 Testing Enhanced Backend Integration...\n');
  
  // Check if required variables exist
  console.log('1. Checking required variables:');
  console.log('   - currentSessionId:', currentSessionId || '❌ Not set');
  console.log('   - currentUser:', currentUser || '❌ Not set');
  console.log('   - makeEnhancedBackendRequest function:', typeof makeEnhancedBackendRequest === 'function' ? '✅' : '❌');
  console.log('   - sendAIQuestion function:', typeof sendAIQuestion === 'function' ? '✅' : '❌');
  
  // Check if old Gemini function is removed
  console.log('\n2. Checking Gemini API removal:');
  console.log('   - makeGeminiRequest function:', typeof makeGeminiRequest === 'function' ? '❌ Still exists' : '✅ Removed');
  
  // Check enhanced backend endpoint configuration
  console.log('\n3. Backend endpoint configuration:');
  const expectedEndpoint = `http://localhost:3000/api/enhanced/sessions/${currentSessionId}/ask`;
  console.log('   - Expected endpoint:', expectedEndpoint);
  
  // Test AI UI elements
  console.log('\n4. Testing AI UI elements:');
  const aiMessages = document.getElementById('lynkk-ai-messages');
  const aiInput = document.getElementById('lynkk-ai-input');
  const aiSend = document.getElementById('lynkk-ai-send');
  
  console.log('   - AI messages container:', aiMessages ? '✅' : '❌');
  console.log('   - AI input field:', aiInput ? '✅' : '❌');
  console.log('   - AI send button:', aiSend ? '✅' : '❌');
  
  // Check enhanced styles
  console.log('\n5. Enhanced backend styles:');
  const styles = document.querySelector('#lynkk-ai-formatting-styles');
  const hasEnhancedStyles = styles && styles.textContent.includes('loading-dots');
  console.log('   - Enhanced loading animations:', hasEnhancedStyles ? '✅' : '❌');
  
  console.log('\n🎯 Integration Status:', 
    currentSessionId && currentUser && 
    typeof makeEnhancedBackendRequest === 'function' && 
    typeof makeGeminiRequest !== 'function' && 
    aiMessages && hasEnhancedStyles
    ? '✅ READY FOR TESTING' 
    : '⚠️ NEEDS ATTENTION'
  );
  
  return {
    sessionId: currentSessionId,
    user: currentUser,
    functions: {
      enhanced: typeof makeEnhancedBackendRequest === 'function',
      gemini: typeof makeGeminiRequest === 'function',
      send: typeof sendAIQuestion === 'function'
    },
    ui: {
      messages: !!aiMessages,
      input: !!aiInput,
      send: !!aiSend
    },
    styles: hasEnhancedStyles
  };
}

// Manual test function for backend request
async function testBackendRequest(question = "What is this session about?") {
  console.log('🔄 Testing manual backend request...');
  
  if (!currentSessionId) {
    console.error('❌ No active session. Please start or join a session first.');
    return;
  }
  
  if (!currentUser) {
    console.error('❌ No authenticated user. Please log in first.');
    return;
  }
  
  try {
    const response = await makeEnhancedBackendRequest(question);
    console.log('✅ Backend response:', response);
    return response;
  } catch (error) {
    console.error('❌ Backend request failed:', error);
    return { error: error.message };
  }
}

// Test AI UI interaction
function testAIUIInteraction(question = "Hello, testing enhanced backend!") {
  console.log('🎮 Testing AI UI interaction...');
  
  const aiInput = document.getElementById('lynkk-ai-input');
  const aiSend = document.getElementById('lynkk-ai-send');
  
  if (!aiInput || !aiSend) {
    console.error('❌ AI UI elements not found');
    return false;
  }
  
  // Simulate user input and click
  aiInput.value = question;
  aiSend.click();
  
  console.log('✅ AI UI interaction triggered');
  return true;
}

// Network debugging helper
function debugNetworkRequests() {
  console.log('🌐 Monitoring network requests to enhanced backend...');
  
  // Override fetch to monitor backend requests
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    if (typeof url === 'string' && url.includes('/api/enhanced/')) {
      console.log('🚀 Enhanced Backend Request:', {
        url: url,
        method: args[1]?.method || 'GET',
        body: args[1]?.body ? JSON.parse(args[1].body) : null
      });
    }
    return originalFetch.apply(this, args);
  };
  
  console.log('✅ Network monitoring active');
}

// Export test functions to global scope
window.testEnhancedBackendIntegration = testEnhancedBackendIntegration;
window.testBackendRequest = testBackendRequest;
window.testAIUIInteraction = testAIUIInteraction;
window.debugNetworkRequests = debugNetworkRequests;

console.log(`
🧪 Enhanced Backend Test Functions Available:

1. testEnhancedBackendIntegration() - Check overall integration status
2. testBackendRequest("your question") - Test direct backend request
3. testAIUIInteraction("test message") - Test AI UI interaction
4. debugNetworkRequests() - Monitor network requests

Run any of these functions in the console to test the integration!
`);
