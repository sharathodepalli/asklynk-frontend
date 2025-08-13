/**
 * Production-Grade Authentication Configuration
 * AskLynk Chrome Extension - Secure, Scalable Auth System
 */

// Environment detection
const getEnvironment = () => {
    try {
        const manifest = chrome.runtime.getManifest();
        if (manifest.name.includes('Dev') || manifest.version_name === 'development') {
            return 'development';
        }
        return 'production';
    } catch {
        return 'production'; // Default to production for safety
    }
};

// Production-grade configuration
const AUTH_CONFIG = {
    development: {
        API_BASE_URL: 'http://localhost:3000',
        API_VERSION: 'v1',
        FRONTEND_URL: 'http://localhost:5173',
        DEBUG_MODE: true,
        TOKEN_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 days in dev
        REFRESH_THRESHOLD: 24 * 60 * 60 * 1000   // 1 day
    },
    production: {
        API_BASE_URL: 'https://asklynk-bkend.vercel.app',
        API_VERSION: 'v1',
        FRONTEND_URL: 'https://asklynk.vercel.app',
        DEBUG_MODE: false,
        TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000,   // 7 days in production
        REFRESH_THRESHOLD: 60 * 60 * 1000        // 1 hour
    }
};

// Current environment config
const ENV = getEnvironment();
const CONFIG = {
    ...AUTH_CONFIG[ENV],
    ENVIRONMENT: ENV,
    IS_DEVELOPMENT: ENV === 'development',
    IS_PRODUCTION: ENV === 'production'
};

// API Endpoints
const API_ENDPOINTS = {
    AUTH: {
        LOGIN: '/api/auth/login',
        REGISTER: '/api/auth/register', 
        REFRESH: '/api/auth/refresh',
        LOGOUT: '/api/auth/logout',
        VALIDATE: '/api/auth/validate',
        FORGOT_PASSWORD: '/api/auth/forgot-password',
        RESET_PASSWORD: '/api/auth/reset-password'
    },
    USER: {
        PROFILE: '/api/user/profile',
        UPDATE: '/api/user/update',
        SESSIONS: '/api/user/sessions'
    },
    SESSIONS: {
        CREATE: '/api/sessions',
        JOIN: '/api/sessions/join',
        LIST: '/api/sessions',
        GET: '/api/sessions'
    }
};

// Security configuration
const SECURITY_CONFIG = {
    TOKEN_STORAGE_KEY: 'asklynk_auth_token_v2',
    REFRESH_TOKEN_KEY: 'asklynk_refresh_token_v2',
    USER_DATA_KEY: 'asklynk_user_data_v2',
    AUTH_STATE_KEY: 'asklynk_auth_state_v2',
    
    // Rate limiting
    MAX_LOGIN_ATTEMPTS: 5,
    LOGIN_LOCKOUT_TIME: 15 * 60 * 1000,      // 15 minutes
    RATE_LIMIT_WINDOW: 60 * 1000,            // 1 minute
    MAX_REQUESTS_PER_WINDOW: 20,
    
    // Retry configuration
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY_BASE: 1000,                  // 1 second
    RETRY_DELAY_MAX: 10000,                  // 10 seconds
    
    // Token validation
    TOKEN_REFRESH_BUFFER: 5 * 60 * 1000,     // Refresh 5 minutes before expiry
    MAX_TOKEN_AGE: 30 * 24 * 60 * 60 * 1000, // 30 days max
    
    // Input validation
    MAX_EMAIL_LENGTH: 254,
    MAX_PASSWORD_LENGTH: 128,
    MAX_USERNAME_LENGTH: 50,
    MIN_PASSWORD_LENGTH: 8
};

// Utility functions
class AuthUtils {
    /**
     * Generate unique request ID for tracking
     */
    static generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Generate UUID v4
     */
    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
    /**
     * Sanitize user input
     */
    static sanitizeInput(input, maxLength = 255) {
        if (typeof input !== 'string') return '';
        
        return input
            .trim()
            .replace(/[<>\"'&]/g, '') // Basic XSS prevention
            .substring(0, maxLength);
    }
    
    /**
     * Validate email format
     */
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= SECURITY_CONFIG.MAX_EMAIL_LENGTH;
    }
    
    /**
     * Validate password strength
     */
    static validatePassword(password) {
        if (!password || password.length < SECURITY_CONFIG.MIN_PASSWORD_LENGTH) {
            return { valid: false, message: `Password must be at least ${SECURITY_CONFIG.MIN_PASSWORD_LENGTH} characters` };
        }
        
        if (password.length > SECURITY_CONFIG.MAX_PASSWORD_LENGTH) {
            return { valid: false, message: `Password must be less than ${SECURITY_CONFIG.MAX_PASSWORD_LENGTH} characters` };
        }
        
        // Check for at least one number and one letter
        if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
            return { valid: false, message: 'Password must contain at least one letter and one number' };
        }
        
        return { valid: true, message: 'Password is valid' };
    }
    
    /**
     * Build API URL
     */
    static buildApiUrl(endpoint) {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${CONFIG.API_BASE_URL}${cleanEndpoint}`;
    }
    
    /**
     * Exponential backoff delay
     */
    static calculateBackoffDelay(attempt) {
        const delay = Math.min(
            SECURITY_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt),
            SECURITY_CONFIG.RETRY_DELAY_MAX
        );
        
        // Add jitter to prevent thundering herd
        const jitter = Math.random() * 0.3 * delay;
        return delay + jitter;
    }
    
    /**
     * Check if token is expired
     */
    static isTokenExpired(token) {
        try {
            if (!token) return true;
            
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiry = payload.exp * 1000; // Convert to milliseconds
            const now = Date.now();
            
            return now >= (expiry - SECURITY_CONFIG.TOKEN_REFRESH_BUFFER);
        } catch {
            return true; // If we can't parse, assume expired
        }
    }
    
    /**
     * Extract token payload
     */
    static getTokenPayload(token) {
        try {
            if (!token) return null;
            
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload;
        } catch {
            return null;
        }
    }
    
    /**
     * Create delay promise
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Hash string (simple hash for non-cryptographic purposes)
     */
    static simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return Math.abs(hash).toString(36);
    }
    
    /**
     * Log auth events (production-safe logging)
     */
    static logAuthEvent(event, data = {}) {
        const logData = {
            event,
            timestamp: Date.now(),
            environment: CONFIG.ENVIRONMENT,
            extensionVersion: chrome.runtime.getManifest().version,
            requestId: this.generateRequestId(),
            ...data
        };
        
        if (CONFIG.IS_DEVELOPMENT) {
            console.log('🔐 Auth Event:', logData);
        } else {
            // In production, you might want to send this to analytics
            // this.sendToAnalytics(logData);
        }
        
        return logData;
    }
    
    /**
     * Secure random string generation
     */
    static generateSecureRandom(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        
        const values = new Uint32Array(length);
        crypto.getRandomValues(values);
        
        for (let i = 0; i < length; i++) {
            result += chars[values[i] % chars.length];
        }
        
        return result;
    }
}

// Error classes for different auth scenarios
class AuthError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'AuthError';
        this.code = code;
        this.details = details;
        this.timestamp = Date.now();
    }
}

class NetworkError extends AuthError {
    constructor(message, details = {}) {
        super(message, 'NETWORK_ERROR', details);
        this.name = 'NetworkError';
    }
}

class ValidationError extends AuthError {
    constructor(message, field, details = {}) {
        super(message, 'VALIDATION_ERROR', { field, ...details });
        this.name = 'ValidationError';
        this.field = field;
    }
}

class TokenExpiredError extends AuthError {
    constructor(message = 'Token has expired') {
        super(message, 'TOKEN_EXPIRED');
        this.name = 'TokenExpiredError';
    }
}

class RateLimitError extends AuthError {
    constructor(message = 'Too many requests', retryAfter = 60) {
        super(message, 'RATE_LIMIT_EXCEEDED', { retryAfter });
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}

// Export configuration and utilities
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        CONFIG,
        API_ENDPOINTS,
        SECURITY_CONFIG,
        AuthUtils,
        AuthError,
        NetworkError,
        ValidationError,
        TokenExpiredError,
        RateLimitError
    };
} else {
    // Browser environment
    window.AuthConfig = {
        CONFIG,
        API_ENDPOINTS,
        SECURITY_CONFIG,
        AuthUtils,
        AuthError,
        NetworkError,
        ValidationError,
        TokenExpiredError,
        RateLimitError
    };
}

// Debug information
if (CONFIG.IS_DEVELOPMENT) {
    console.log('🔧 AskLynk Auth Config Loaded:', {
        environment: CONFIG.ENVIRONMENT,
        apiBase: CONFIG.API_BASE_URL,
        debugMode: CONFIG.DEBUG_MODE,
        version: chrome?.runtime?.getManifest?.()?.version || 'unknown'
    });
}