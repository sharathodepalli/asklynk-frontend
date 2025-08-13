// AskLynk Editor JavaScript
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 AskLynk Editor initialized');
    
    // Load user information
    loadUserInfo();
    
    // Set up logout functionality
    setupLogout();
});

async function loadUserInfo() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
        
        if (response && response.success && response.isLoggedIn) {
            const usernameElement = document.querySelector('.username');
            if (usernameElement) {
                usernameElement.textContent = response.user.username;
                usernameElement.classList.remove('loading');
            }
            console.log('✅ User info loaded:', response.user);
        } else {
            console.warn('⚠️ User not authenticated, redirecting...');
            // Redirect back to popup or login
            chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
            window.close();
        }
    } catch (error) {
        console.error('❌ Failed to load user info:', error);
    }
}

function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            console.log('🚪 Logout clicked');
            
            try {
                const response = await chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
                
                if (response && response.success) {
                    console.log('✅ Logout successful');
                    // Close this tab and optionally open popup
                    window.close();
                } else {
                    console.error('❌ Logout failed:', response);
                }
            } catch (error) {
                console.error('❌ Logout error:', error);
            }
        });
    }
}

// Listen for auth state changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Editor received message:', message.type);
    
    if (message.type === 'AUTH_CHANGED' && !message.authState.isAuthenticated) {
        console.log('🔄 User logged out, closing editor');
        window.close();
    }
    
    sendResponse({ success: true });
});
