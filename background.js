// AskLynk Chrome Extension Background Service Worker - MV3 Secure Auth
// Implements Extension-Side Auth Flow with hosted login and session cookies

console.log('🚀 AskLynk Background Script Starting...');

// Production Configuration
const CONFIG = {
    AUTH_ORIGIN: 'https://asklynk.vercel.app', // Hosted login page
    API_ORIGIN: 'https://asklynk-backend-424701115132.us-central1.run.app', // Production API backend
    IS_DEVELOPMENT: false,
    EXTENSION_ID: 'gbkjeipbkdgbimeagdgomebmjaggnbel' // Production extension ID
};

console.log('🔧 Extension Config:', { 
    extensionId: chrome.runtime.id,
    authOrigin: CONFIG.AUTH_ORIGIN,
    apiOrigin: CONFIG.API_ORIGIN 
});

// Logger utility
const Logger = {
    log: (...args) => console.log('[AskLynk BG]', ...args),
    error: (...args) => console.error('[AskLynk BG]', ...args),
    warn: (...args) => console.warn('[AskLynk BG]', ...args)
};

// Session state - only store minimal data, auth is via cookies
let sessionState = {
    isAuthenticated: false,
    user: null,
    lastChecked: null
};

// Utility functions for storage
const storage = {
    async set(data) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set(data, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    },
    
    async get(keys = null) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(keys, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(result);
                }
            });
        });
    },
    
    async remove(keys) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve();
                }
            });
        });
    }
};

// Session management functions
async function checkSession() {
    Logger.log('🔍 Checking session with API...');
    
    try {
        const response = await fetch(`${CONFIG.API_ORIGIN}/api/auth/session`, {
            method: 'GET',
            credentials: 'include', // Include cookies
            headers: {
                'Accept': 'application/json'
            }
        });
        
        Logger.log('📡 Session check response:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            Logger.log('✅ Session valid:', data.user);
            
            sessionState = {
                isAuthenticated: true,
                user: data.user,
                lastChecked: Date.now()
            };
            
            // Store minimal user data locally (no tokens)
            await storage.set({ 
                sessionUser: data.user,
                lastSessionCheck: Date.now()
            });
            
            return { success: true, isAuthenticated: true, user: data.user };
        } else {
            Logger.log('❌ Session invalid or expired');
            sessionState = {
                isAuthenticated: false,
                user: null,
                lastChecked: Date.now()
            };
            
            await storage.remove(['sessionUser', 'lastSessionCheck']);
            return { success: true, isAuthenticated: false, user: null };
        }
        
    } catch (error) {
        Logger.error('❌ Session check failed:', error);
        return { success: false, error: error.message };
    }
}

async function startSignIn() {
    Logger.log('🚀 Starting secure sign-in flow...');
    
    try {
        // Get the redirect URI from Chrome Identity API (standard pattern)
        const redirectUri = chrome.identity.getRedirectURL('cb');
        Logger.log('🔗 Chrome Identity Redirect URI:', redirectUri);
        
        // Construct the auth URL with the Chrome Identity redirect URI
        const authUrl = `${CONFIG.AUTH_ORIGIN}/?extension=true&returnUrl=${encodeURIComponent(redirectUri)}&api_base=${encodeURIComponent(CONFIG.API_ORIGIN)}`;
        Logger.log('🔐 Auth URL:', authUrl);
        
        // Launch the web auth flow
        const resultUrl = await new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            }, (responseUrl) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(responseUrl);
                }
            });
        });
        
        Logger.log('🔄 Auth flow completed with URL:', resultUrl);
        
        // Check for success indicator (ok=1 parameter)
        if (resultUrl && resultUrl.includes('ok=1')) {
            Logger.log('✅ Auth flow successful (ok=1 detected), checking session...');
            
            // Wait a moment for the cookie to be set
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Check session to get user data
            const sessionResult = await checkSession();
            
            if (sessionResult.success && sessionResult.isAuthenticated) {
                Logger.log('✅ Sign-in completed successfully');
                
                // Broadcast auth change to extension components
                broadcastAuthChange();
                
                return { 
                    success: true, 
                    user: sessionResult.user,
                    message: 'Sign-in successful'
                };
            } else {
                throw new Error('Session validation failed after login');
            }
        } else {
            throw new Error('Authentication was cancelled or failed');
        }
        
    } catch (error) {
        Logger.error('❌ Sign-in failed:', error);
        return { 
            success: false, 
            error: error.message,
            userCancelled: error.message.includes('cancelled')
        };
    }
}

async function signOut() {
    Logger.log('🚪 Starting sign-out...');
    
    try {
        // Call logout endpoint to clear server-side session
        const response = await fetch(`${CONFIG.API_ORIGIN}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include', // Include cookies to clear them
            headers: {
                'Accept': 'application/json'
            }
        });
        
        Logger.log('📡 Logout response:', response.status);
        
        // Clear local session state regardless of server response
        sessionState = {
            isAuthenticated: false,
            user: null,
            lastChecked: Date.now()
        };
        
        // Clear stored user data
        await storage.remove(['sessionUser', 'lastSessionCheck']);
        
        // Broadcast auth change
        broadcastAuthChange();
        
        Logger.log('✅ Sign-out completed');
        return { success: true };
        
    } catch (error) {
        Logger.error('❌ Sign-out error:', error);
        
        // Still clear local state even if server call failed
        sessionState = {
            isAuthenticated: false,
            user: null,
            lastChecked: Date.now()
        };
        
        await storage.remove(['sessionUser', 'lastSessionCheck']);
        broadcastAuthChange();
        
        return { success: true }; // Return success since local state is cleared
    }
}

// API proxy function - all API calls go through background with cookies
async function proxyApiCall({ url, method = 'GET', body = null, headers = {} }) {
    Logger.log('📡 Proxying API call:', method, url);
    
    try {
        const fetchOptions = {
            method,
            credentials: 'include', // Always include cookies
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                ...headers
            }
        };
        
        if (body && method !== 'GET') {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
        
        const response = await fetch(url, fetchOptions);
        
        Logger.log('📡 API response:', response.status);
        
        // If unauthorized, check if session expired
        if (response.status === 401) {
            Logger.log('🔒 Unauthorized response, session may have expired');
            await checkSession(); // Update session state
            broadcastAuthChange();
        }
        
        const data = await response.json();
        
        return {
            ok: response.ok,
            status: response.status,
            data: data
        };
        
    } catch (error) {
        Logger.error('❌ API call failed:', error);
        return {
            ok: false,
            status: 0,
            error: error.message
        };
    }
}

// Broadcast auth changes to all extension components
function broadcastAuthChange() {
    const authChangeMessage = {
        type: 'AUTH_CHANGED',
        authState: {
            isAuthenticated: sessionState.isAuthenticated,
            user: sessionState.user
        }
    };
    
    // Send to popup and other extension pages
    chrome.runtime.sendMessage(authChangeMessage).catch(() => {
        Logger.log('ℹ️ No extension listeners for AUTH_CHANGED');
    });
    
    // Send to all content scripts
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, authChangeMessage).catch(() => {
                // Ignore errors for tabs without content scripts
            });
        });
    });
    
    Logger.log('📨 Auth change broadcasted');
}

// Message handlers
const messageHandlers = {
    // Check current authentication status
    CHECK_AUTH: async () => {
        Logger.log('🔍 CHECK_AUTH request');
        
        // If we have recent session data, return it
        if (sessionState.lastChecked && (Date.now() - sessionState.lastChecked) < 30000) {
            Logger.log('📊 Returning cached session state');
            return {
                success: true,
                isAuthenticated: sessionState.isAuthenticated,
                user: sessionState.user
            };
        }
        
        // Otherwise check with server
        const sessionResult = await checkSession();
        return {
            success: sessionResult.success,
            isAuthenticated: sessionResult.isAuthenticated,
            user: sessionResult.user,
            error: sessionResult.error
        };
    },
    
    // Start the sign-in flow
    START_SIGN_IN: async () => {
        Logger.log('🚀 START_SIGN_IN request');
        return await startSignIn();
    },
    
    // Sign out
    SIGN_OUT: async () => {
        Logger.log('🚪 SIGN_OUT request');
        return await signOut();
    },
    
    // Proxy API calls
    API_CALL: async (message) => {
        Logger.log('📡 API_CALL request:', message.url);
        return await proxyApiCall({
            url: message.url,
            method: message.method,
            body: message.body,
            headers: message.headers
        });
    },
    
    // Health check
    HEALTH_CHECK: async () => {
        Logger.log('🏥 HEALTH_CHECK');
        return {
            success: true,
            timestamp: Date.now(),
            extensionId: CONFIG.EXTENSION_ID,
            authStatus: sessionState.isAuthenticated,
            message: 'Background script is working!'
        };
    },
    
    // Handle callback result from callback.html
    AUTH_CALLBACK_RESULT: async (message) => {
        Logger.log('🔄 AUTH_CALLBACK_RESULT received:', message);
        
        if (message.success) {
            Logger.log('✅ Callback confirmed success, checking session...');
            await checkSession();
            broadcastAuthChange();
            return { success: true };
        } else {
            Logger.log('❌ Callback reported failure:', message.error);
            return { success: false, error: message.error };
        }
    }
};

// Main message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    Logger.log('📨 Message received:', message.type);
    
    (async () => {
        try {
            const handler = messageHandlers[message.type];
            if (!handler) {
                Logger.warn('❓ Unknown message type:', message.type);
                return { success: false, error: `Unknown message type: ${message.type}` };
            }
            
            const result = await handler(message);
            Logger.log('✅ Message handled:', message.type, result);
            return result;
        } catch (error) {
            Logger.error('❌ Message handler error:', error);
            return { success: false, error: error.message };
        }
    })().then((result) => {
        try {
            sendResponse(result);
        } catch (e) {
            Logger.log('ℹ️ Response channel already closed for:', message.type);
        }
    }).catch((error) => {
        Logger.error('❌ Async handler error:', error);
        try {
            sendResponse({ success: false, error: error.message });
        } catch (e) {
            Logger.log('ℹ️ Response channel already closed after error for:', message.type);
        }
    });
    
    return true; // Keep message channel open for async response
});

// Initialize extension
async function init() {
    Logger.log('🚀 Initializing extension...');
    
    try {
        // Load any stored user data
        const stored = await storage.get(['sessionUser', 'lastSessionCheck']);
        
        if (stored.sessionUser) {
            sessionState.user = stored.sessionUser;
            sessionState.lastChecked = stored.lastSessionCheck;
            
            // Check if session is still valid
            await checkSession();
        }
        
        Logger.log('✅ Extension initialized');
        Logger.log('📊 Session state:', sessionState);
    } catch (error) {
        Logger.error('❌ Init failed:', error);
    }
}

// Extension lifecycle handlers
chrome.runtime.onInstalled.addListener(async (details) => {
    Logger.log('📦 Extension event:', details.reason);
    
    if (details.reason === 'install') {
        Logger.log('🆕 First install - clearing any stored data');
        await storage.remove(['sessionUser', 'lastSessionCheck']);
    }
    
    await init();
});

chrome.runtime.onStartup.addListener(async () => {
    Logger.log('🌅 Browser startup');
    await init();
});

// Initialize immediately
init();

Logger.log('🎯 Background script ready with secure auth flow!');