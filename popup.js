/**
 * AskLynk Chrome Extension - Secure Popup with Cookie-Based Auth
 * Uses hosted login flow with session cookies (no token storage)
 */

console.log('🚀 AskLynk Popup Loading...');

// Global state
let currentUser = null;
let isLoading = false;
let authCheckInProgress = false;

/**
 * Initialize popup immediately when DOM loads
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ DOM loaded, initializing popup...');
    
    // Show loading state immediately
    showLoadingState();
    
    // Check auth state and render appropriate UI
    try {
        await checkAuthState();
        renderMainUI();
    } catch (error) {
        console.error('❌ Initialization error:', error);
        renderMainUI(); // Still render UI even if auth check fails
    }
});

/**
 * Show immediate loading state for professional feel
 */
function showLoadingState() {
    document.getElementById('root').innerHTML = `
        <div style="width: 380px; height: 500px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="text-align: center;">
                <div style="font-size: 24px; margin-bottom: 10px;">🎓</div>
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 5px;">AskLynk</div>
                <div style="font-size: 14px; opacity: 0.9;">Loading...</div>
            </div>
        </div>
    `;
}

/**
 * Check authentication state with background script
 */
async function checkAuthState() {
    if (authCheckInProgress) return;
    authCheckInProgress = true;
    
    try {
        console.log('🔍 Checking auth state...');
        
        const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
        console.log('📡 Auth check response:', response);
        
        if (response && response.success) {
            if (response.isAuthenticated && response.user) {
                currentUser = response.user;
                console.log('✅ User authenticated:', currentUser.username || currentUser.email);
            } else {
                currentUser = null;
                console.log('❌ User not authenticated');
            }
        } else {
            console.error('❌ Auth check failed:', response?.error);
            currentUser = null;
        }
    } catch (error) {
        console.error('❌ Auth check error:', error);
        currentUser = null;
    } finally {
        authCheckInProgress = false;
    }
}

/**
 * Render main UI based on auth state
 */
function renderMainUI() {
    if (currentUser) {
        showDashboard();
    } else {
        showAuthInterface();
    }
}

/**
 * Show authentication interface with secure sign-in
 */
function showAuthInterface() {
    document.getElementById('root').innerHTML = `
        <div style="width: 380px; min-height: 500px; background: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 25px; text-align: center;">
                <div style="font-size: 32px; margin-bottom: 8px;">🎓</div>
                <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700;">AskLynk</h1>
                <p style="margin: 0; font-size: 14px; opacity: 0.9;">AI-Powered Classroom Assistant</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px 25px;">
                <!-- Auth Required Message -->
                <div style="text-align: center; margin-bottom: 30px;">
                    <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.6;">🔒</div>
                    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #1f2937;">Authentication Required</h2>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                        Sign in to your AskLynk account to access all features and join classroom sessions.
                    </p>
                </div>
                
                <!-- Sign In Button -->
                <button 
                    id="signInButton"
                    style="width: 100%; padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 16px; cursor: pointer; transition: transform 0.2s; margin-bottom: 20px;"
                >
                    <span id="signInButtonText">Sign In Securely</span>
                </button>
                
                <!-- Info -->
                <div style="background: #f0f4ff; border: 1px solid #e0e7ff; border-radius: 8px; padding: 16px; text-align: center;">
                    <div style="font-size: 20px; margin-bottom: 8px;">🛡️</div>
                    <p style="margin: 0; color: #3730a3; font-size: 13px; line-height: 1.4;">
                        Your login is handled securely on our website. No passwords or tokens are stored in this extension.
                    </p>
                </div>
                
                <!-- Messages -->
                <div id="messageContainer" style="margin-top: 20px;"></div>
            </div>
            
            <!-- Footer -->
            <div style="padding: 15px 25px; background: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
                <div style="font-size: 12px; color: #6b7280;">
                    <span style="color: #ef4444;">●</span> Not connected
                </div>
            </div>
        </div>
    `;
    
    // Attach event listeners
    attachAuthEventListeners();
}

/**
 * Attach event listeners for auth interface
 */
function attachAuthEventListeners() {
    const signInButton = document.getElementById('signInButton');
    
    if (signInButton) {
        signInButton.addEventListener('click', handleSecureSignIn);
        
        // Add hover effects
        signInButton.addEventListener('mouseenter', () => {
            if (!isLoading) {
                signInButton.style.transform = 'translateY(-2px)';
                signInButton.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)';
            }
        });
        
        signInButton.addEventListener('mouseleave', () => {
            if (!isLoading) {
                signInButton.style.transform = 'translateY(0)';
                signInButton.style.boxShadow = 'none';
            }
        });
    }
}

/**
 * Handle secure sign-in flow
 */
async function handleSecureSignIn() {
    if (isLoading) return;
    
    console.log('🔐 Starting secure sign-in...');
    
    // Set loading state
    setButtonLoading('signInButton', 'signInButtonText', 'Opening secure sign-in...', true);
    showMessage('Opening secure sign-in page...', 'info');
    
    try {
        // Request sign-in from background script
        const response = await chrome.runtime.sendMessage({ type: 'START_SIGN_IN' });
        console.log('📡 Sign-in response:', response);
        
        if (response && response.success) {
            // Sign-in successful
            currentUser = response.user;
            showMessage('Sign-in successful! Welcome back.', 'success');
            
            setTimeout(() => {
                renderMainUI();
            }, 1500);
            
        } else {
            // Sign-in failed
            const errorMessage = response?.userCancelled 
                ? 'Sign-in was cancelled. You can try again anytime.'
                : response?.error || 'Sign-in failed. Please try again.';
            
            console.error('❌ Sign-in failed:', errorMessage);
            showMessage(errorMessage, 'error');
        }
        
    } catch (error) {
        console.error('❌ Sign-in error:', error);
        showMessage('An error occurred during sign-in. Please try again.', 'error');
    } finally {
        setButtonLoading('signInButton', 'signInButtonText', 'Sign In Securely', false);
    }
}

/**
 * Show user dashboard
 */
function showDashboard() {
    const user = currentUser;
    
    document.getElementById('root').innerHTML = `
        <div style="width: 380px; min-height: 500px; background: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="width: 48px; height: 48px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        👤
                    </div>
                    <div>
                        <h2 style="margin: 0; font-size: 18px; font-weight: 600;">${user.username || user.name || 'User'}</h2>
                        <p style="margin: 2px 0 0 0; font-size: 14px; opacity: 0.8;">${user.email || ''}</p>
                    </div>
                </div>
            </div>
            
            <!-- Content -->
            <div style="padding: 25px;">
                <div style="margin-bottom: 25px;">
                    <button 
                        id="openOverlayButton"
                        style="width: 100%; padding: 16px; background: #f0f4ff; border: 2px solid #e0e7ff; border-radius: 12px; cursor: pointer; margin-bottom: 15px; transition: all 0.2s;"
                    >
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">📱</span>
                            <div style="text-align: left;">
                                <div style="font-weight: 600; color: #1f2937; font-size: 16px;">Open Meet Overlay</div>
                                <div style="color: #6b7280; font-size: 14px;">Use AskLynk on Google Meet</div>
                            </div>
                        </div>
                    </button>
                    
                    <button 
                        id="quickChatButton"
                        style="width: 100%; padding: 16px; background: #f0fdf4; border: 2px solid #dcfce7; border-radius: 12px; cursor: pointer; transition: all 0.2s;"
                    >
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">🤖</span>
                            <div style="text-align: left;">
                                <div style="font-weight: 600; color: #1f2937; font-size: 16px;">AI Assistant</div>
                                <div style="color: #6b7280; font-size: 14px;">Get help with anything</div>
                            </div>
                        </div>
                    </button>
                </div>
                
                <div style="background: #f9fafb; border-radius: 8px; padding: 20px; text-align: center;">
                    <div style="font-size: 18px; margin-bottom: 8px;">🎉</div>
                    <h3 style="margin: 0 0 8px 0; color: #1f2937;">Welcome to AskLynk!</h3>
                    <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.4;">
                        Go to Google Meet and look for the floating AskLynk button to start using the overlay.
                    </p>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="padding: 15px 25px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <button id="signOutButton" style="background: none; border: none; color: #6b7280; font-size: 14px; cursor: pointer;">
                        🚪 Sign Out
                    </button>
                    <div style="font-size: 12px; color: #10b981;">
                        <span>●</span> Connected
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Attach dashboard event listeners
    attachDashboardEventListeners();
}

/**
 * Attach event listeners for dashboard
 */
function attachDashboardEventListeners() {
    const openOverlayButton = document.getElementById('openOverlayButton');
    const quickChatButton = document.getElementById('quickChatButton');
    const signOutButton = document.getElementById('signOutButton');
    
    if (openOverlayButton) {
        openOverlayButton.addEventListener('click', () => {
            showMessage('Go to Google Meet to see the AskLynk overlay!', 'info');
            // Could optionally open Google Meet here
            chrome.tabs.create({ url: 'https://meet.google.com' });
        });
    }
    
    if (quickChatButton) {
        quickChatButton.addEventListener('click', () => {
            showMessage('Go to Google Meet to access the AI assistant!', 'info');
            chrome.tabs.create({ url: 'https://meet.google.com' });
        });
    }
    
    if (signOutButton) {
        signOutButton.addEventListener('click', handleSignOut);
    }
}

/**
 * Handle sign out
 */
async function handleSignOut() {
    if (confirm('Are you sure you want to sign out?')) {
        try {
            showMessage('Signing out...', 'info');
            
            const response = await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
            
            if (response && response.success) {
                currentUser = null;
                showMessage('Signed out successfully', 'success');
                
                setTimeout(() => {
                    renderMainUI();
                }, 1000);
            } else {
                showMessage('Sign out failed. Please try again.', 'error');
            }
        } catch (error) {
            console.error('❌ Sign out error:', error);
            showMessage('An error occurred during sign out.', 'error');
        }
    }
}

/**
 * Show messages with better styling
 */
function showMessage(message, type = 'info') {
    const container = document.getElementById('messageContainer');
    if (!container) return;
    
    const colors = {
        success: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
        error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
        info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' }
    };
    
    const color = colors[type] || colors.info;
    
    container.innerHTML = `
        <div style="padding: 12px; background: ${color.bg}; border: 1px solid ${color.border}; border-radius: 6px; color: ${color.text}; font-size: 14px; font-weight: 500;">
            ${message}
        </div>
    `;
    
    setTimeout(() => {
        if (container) container.innerHTML = '';
    }, 5000);
}

/**
 * Set button loading state
 */
function setButtonLoading(buttonId, textId, loadingText, loading) {
    const button = document.getElementById(buttonId);
    const text = document.getElementById(textId);
    
    if (button && text) {
        button.disabled = loading;
        text.textContent = loadingText;
        button.style.opacity = loading ? '0.7' : '1';
        button.style.cursor = loading ? 'not-allowed' : 'pointer';
        isLoading = loading;
    }
}

// Listen for auth changes from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTH_CHANGED') {
        console.log('🔄 Auth state changed:', message.authState);
        
        if (message.authState.isAuthenticated) {
            currentUser = message.authState.user;
        } else {
            currentUser = null;
        }
        
        // Re-render UI
        renderMainUI();
        sendResponse({ success: true });
    }
});

console.log('✅ AskLynk Secure Popup Ready!');