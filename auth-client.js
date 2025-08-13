/**
 * Production-Grade Authentication API Client
 * Secure, scalable, and robust authentication for AskLynk Chrome Extension
 */

// Import configuration (ensure auth-config.js is loaded first)
const {
    CONFIG,
    API_ENDPOINTS,
    SECURITY_CONFIG,
    AuthUtils,
    AuthError,
    NetworkError,
    ValidationError,
    TokenExpiredError,
    RateLimitError
} = window.AuthConfig || {};

class AuthApiClient {
    constructor() {
        this.requestQueue = new Map();
        this.rateLimitData = new Map();
        this.retryCache = new Map();
        this.isRefreshingToken = false;
        this.refreshPromise = null;
        
        // Initialize request interceptors
        this.initializeInterceptors();
        
        AuthUtils.logAuthEvent('auth_client_initialized');
    }
    
    /**
     * Initialize request/response interceptors
     */
    initializeInterceptors() {
        // Create a base request method with interceptors
        this.originalFetch = fetch.bind(window);
    }
    
    /**
     * Make secure API request with automatic retries and rate limiting
     */
    async secureRequest(endpoint, options = {}, retryCount = 0) {
        const requestId = AuthUtils.generateRequestId();
        const startTime = Date.now();
        
        try {
            // Rate limiting check
            await this.checkRateLimit(endpoint);
            
            // Prepare request
            const url = AuthUtils.buildApiUrl(endpoint);
            const requestOptions = await this.prepareRequest(options, requestId);
            
            AuthUtils.logAuthEvent('api_request_start', {
                endpoint,
                method: requestOptions.method,
                requestId,
                retryCount
            });
            
            // Make request
            const response = await this.originalFetch(url, requestOptions);
            const duration = Date.now() - startTime;
            
            // Handle response
            const result = await this.handleResponse(response, endpoint, requestId, duration);
            
            // Clear retry cache on success
            this.retryCache.delete(`${endpoint}_${JSON.stringify(options)}`);
            
            return result;
            
        } catch (error) {
            return this.handleRequestError(error, endpoint, options, retryCount, requestId);
        }
    }
    
    /**
     * Prepare request with headers, authentication, and security
     */
    async prepareRequest(options, requestId) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Request-ID': requestId,
                'X-Extension-Version': chrome.runtime.getManifest().version,
                'X-Environment': CONFIG.ENVIRONMENT
            }
        };
        
        // Merge options
        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };
        
        // Add authentication if available
        const token = await this.getValidToken();
        if (token && !options.skipAuth) {
            mergedOptions.headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Add CSRF protection for state-changing requests
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(mergedOptions.method)) {
            mergedOptions.headers['X-CSRF-Token'] = await this.getCsrfToken();
        }
        
        return mergedOptions;
    }
    
    /**
     * Handle API response with proper error handling
     */
    async handleResponse(response, endpoint, requestId, duration) {
        const statusCode = response.status;
        
        AuthUtils.logAuthEvent('api_response_received', {
            endpoint,
            statusCode,
            requestId,
            duration
        });
        
        // Handle different status codes
        if (statusCode === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After')) || 60;
            throw new RateLimitError('Rate limit exceeded', retryAfter);
        }
        
        if (statusCode === 401) {
            // Token expired or invalid
            await this.clearStoredAuth();
            throw new TokenExpiredError('Authentication token expired');
        }
        
        if (statusCode >= 500) {
            throw new NetworkError('Server error occurred', {
                statusCode,
                endpoint
            });
        }
        
        // Parse response
        let data;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (parseError) {
                throw new NetworkError('Invalid JSON response', {
                    statusCode,
                    parseError: parseError.message
                });
            }
        } else {
            data = await response.text();
        }
        
        // Handle API-level errors
        if (!response.ok) {
            const errorMessage = data?.message || data?.error || `Request failed with status ${statusCode}`;
            throw new AuthError(errorMessage, `HTTP_${statusCode}`, {
                statusCode,
                data,
                endpoint
            });
        }
        
        return data;
    }
    
    /**
     * Handle request errors with retry logic
     */
    async handleRequestError(error, endpoint, options, retryCount, requestId) {
        const maxRetries = SECURITY_CONFIG.MAX_RETRY_ATTEMPTS;\n        const cacheKey = `${endpoint}_${JSON.stringify(options)}`;\n        \n        AuthUtils.logAuthEvent('api_request_error', {\n            endpoint,\n            error: error.message,\n            errorType: error.constructor.name,\n            retryCount,\n            requestId\n        });\n        \n        // Don't retry certain errors\n        const nonRetryableErrors = [\n            ValidationError,\n            TokenExpiredError,\n            RateLimitError\n        ];\n        \n        const isNonRetryable = nonRetryableErrors.some(ErrorClass => error instanceof ErrorClass);\n        \n        if (isNonRetryable || retryCount >= maxRetries) {\n            // Log final failure\n            AuthUtils.logAuthEvent('api_request_failed_final', {\n                endpoint,\n                error: error.message,\n                totalAttempts: retryCount + 1,\n                requestId\n            });\n            \n            throw error;\n        }\n        \n        // Calculate backoff delay\n        const delay = AuthUtils.calculateBackoffDelay(retryCount);\n        \n        AuthUtils.logAuthEvent('api_request_retry_scheduled', {\n            endpoint,\n            retryCount: retryCount + 1,\n            delayMs: delay,\n            requestId\n        });\n        \n        // Wait and retry\n        await AuthUtils.delay(delay);\n        return this.secureRequest(endpoint, options, retryCount + 1);\n    }\n    \n    /**\n     * Rate limiting implementation\n     */\n    async checkRateLimit(endpoint) {\n        const now = Date.now();\n        const windowStart = now - SECURITY_CONFIG.RATE_LIMIT_WINDOW;\n        \n        // Clean old entries\n        for (const [key, timestamps] of this.rateLimitData.entries()) {\n            this.rateLimitData.set(\n                key, \n                timestamps.filter(timestamp => timestamp > windowStart)\n            );\n        }\n        \n        // Check current endpoint rate limit\n        const requests = this.rateLimitData.get(endpoint) || [];\n        \n        if (requests.length >= SECURITY_CONFIG.MAX_REQUESTS_PER_WINDOW) {\n            const oldestRequest = Math.min(...requests);\n            const retryAfter = Math.ceil((oldestRequest + SECURITY_CONFIG.RATE_LIMIT_WINDOW - now) / 1000);\n            \n            throw new RateLimitError(\n                `Rate limit exceeded for ${endpoint}. Try again in ${retryAfter} seconds.`,\n                retryAfter\n            );\n        }\n        \n        // Add current request\n        requests.push(now);\n        this.rateLimitData.set(endpoint, requests);\n    }\n    \n    /**\n     * Get valid authentication token (with automatic refresh)\n     */\n    async getValidToken() {\n        try {\n            const storedToken = await this.getStoredToken();\n            \n            if (!storedToken) {\n                return null;\n            }\n            \n            // Check if token needs refresh\n            if (AuthUtils.isTokenExpired(storedToken)) {\n                return await this.refreshTokenIfNeeded();\n            }\n            \n            return storedToken;\n            \n        } catch (error) {\n            AuthUtils.logAuthEvent('token_validation_failed', {\n                error: error.message\n            });\n            \n            // Clear invalid tokens\n            await this.clearStoredAuth();\n            return null;\n        }\n    }\n    \n    /**\n     * Refresh token with single-flight pattern\n     */\n    async refreshTokenIfNeeded() {\n        // Prevent multiple simultaneous refresh requests\n        if (this.isRefreshingToken) {\n            return await this.refreshPromise;\n        }\n        \n        this.isRefreshingToken = true;\n        \n        this.refreshPromise = this.performTokenRefresh();\n        \n        try {\n            const result = await this.refreshPromise;\n            return result;\n        } finally {\n            this.isRefreshingToken = false;\n            this.refreshPromise = null;\n        }\n    }\n    \n    /**\n     * Perform actual token refresh\n     */\n    async performTokenRefresh() {\n        try {\n            const refreshToken = await this.getStoredRefreshToken();\n            \n            if (!refreshToken) {\n                throw new TokenExpiredError('No refresh token available');\n            }\n            \n            const response = await this.secureRequest(\n                API_ENDPOINTS.AUTH.REFRESH,\n                {\n                    method: 'POST',\n                    body: JSON.stringify({ refresh_token: refreshToken }),\n                    skipAuth: true // Don't use expired token for refresh\n                }\n            );\n            \n            // Store new tokens\n            await this.storeAuthData(response.user, response.access_token, response.refresh_token);\n            \n            AuthUtils.logAuthEvent('token_refreshed_successfully');\n            \n            return response.access_token;\n            \n        } catch (error) {\n            AuthUtils.logAuthEvent('token_refresh_failed', {\n                error: error.message\n            });\n            \n            // Clear invalid refresh token\n            await this.clearStoredAuth();\n            throw error;\n        }\n    }\n    \n    /**\n     * Get CSRF token for state-changing requests\n     */\n    async getCsrfToken() {\n        // For now, use a simple timestamp-based token\n        // In production, you might want to fetch this from your API\n        return AuthUtils.simpleHash(`${Date.now()}_${chrome.runtime.id}`);\n    }\n    \n    /**\n     * Store authentication data securely\n     */\n    async storeAuthData(user, accessToken, refreshToken) {\n        const authData = {\n            user,\n            accessToken,\n            refreshToken,\n            timestamp: Date.now(),\n            expiresAt: Date.now() + CONFIG.TOKEN_EXPIRY\n        };\n        \n        // Store in Chrome storage\n        await chrome.storage.local.set({\n            [SECURITY_CONFIG.AUTH_STATE_KEY]: {\n                isLoggedIn: true,\n                user,\n                lastUpdate: Date.now()\n            },\n            [SECURITY_CONFIG.TOKEN_STORAGE_KEY]: accessToken,\n            [SECURITY_CONFIG.REFRESH_TOKEN_KEY]: refreshToken,\n            [SECURITY_CONFIG.USER_DATA_KEY]: user\n        });\n        \n        AuthUtils.logAuthEvent('auth_data_stored', {\n            userId: user.id,\n            username: user.username\n        });\n    }\n    \n    /**\n     * Get stored authentication token\n     */\n    async getStoredToken() {\n        const result = await chrome.storage.local.get([SECURITY_CONFIG.TOKEN_STORAGE_KEY]);\n        return result[SECURITY_CONFIG.TOKEN_STORAGE_KEY] || null;\n    }\n    \n    /**\n     * Get stored refresh token\n     */\n    async getStoredRefreshToken() {\n        const result = await chrome.storage.local.get([SECURITY_CONFIG.REFRESH_TOKEN_KEY]);\n        return result[SECURITY_CONFIG.REFRESH_TOKEN_KEY] || null;\n    }\n    \n    /**\n     * Get stored user data\n     */\n    async getStoredUserData() {\n        const result = await chrome.storage.local.get([\n            SECURITY_CONFIG.USER_DATA_KEY,\n            SECURITY_CONFIG.AUTH_STATE_KEY\n        ]);\n        \n        return {\n            user: result[SECURITY_CONFIG.USER_DATA_KEY] || null,\n            authState: result[SECURITY_CONFIG.AUTH_STATE_KEY] || null\n        };\n    }\n    \n    /**\n     * Clear stored authentication data\n     */\n    async clearStoredAuth() {\n        await chrome.storage.local.remove([\n            SECURITY_CONFIG.AUTH_STATE_KEY,\n            SECURITY_CONFIG.TOKEN_STORAGE_KEY,\n            SECURITY_CONFIG.REFRESH_TOKEN_KEY,\n            SECURITY_CONFIG.USER_DATA_KEY\n        ]);\n        \n        AuthUtils.logAuthEvent('auth_data_cleared');\n    }\n    \n    /**\n     * Check authentication status\n     */\n    async checkAuthStatus() {\n        try {\n            const token = await this.getValidToken();\n            const { user, authState } = await this.getStoredUserData();\n            \n            const isAuthenticated = !!(token && user && authState?.isLoggedIn);\n            \n            return {\n                success: true,\n                isLoggedIn: isAuthenticated,\n                user: isAuthenticated ? user : null,\n                token: isAuthenticated ? token : null,\n                lastActivity: authState?.lastUpdate || null\n            };\n            \n        } catch (error) {\n            AuthUtils.logAuthEvent('auth_status_check_failed', {\n                error: error.message\n            });\n            \n            return {\n                success: false,\n                isLoggedIn: false,\n                user: null,\n                token: null,\n                error: error.message\n            };\n        }\n    }\n    \n    /**\n     * Authenticate user with email and password\n     */\n    async login(email, password) {\n        // Input validation\n        const sanitizedEmail = AuthUtils.sanitizeInput(email, SECURITY_CONFIG.MAX_EMAIL_LENGTH);\n        \n        if (!AuthUtils.isValidEmail(sanitizedEmail)) {\n            throw new ValidationError('Please enter a valid email address', 'email');\n        }\n        \n        const passwordValidation = AuthUtils.validatePassword(password);\n        if (!passwordValidation.valid) {\n            throw new ValidationError(passwordValidation.message, 'password');\n        }\n        \n        // Check for login lockout\n        await this.checkLoginLockout(sanitizedEmail);\n        \n        try {\n            AuthUtils.logAuthEvent('login_attempt_started', {\n                email: sanitizedEmail,\n                timestamp: Date.now()\n            });\n            \n            const response = await this.secureRequest(\n                API_ENDPOINTS.AUTH.LOGIN,\n                {\n                    method: 'POST',\n                    body: JSON.stringify({\n                        email: sanitizedEmail,\n                        password // Never log passwords\n                    }),\n                    skipAuth: true\n                }\n            );\n            \n            // Store authentication data\n            await this.storeAuthData(\n                response.user,\n                response.access_token || response.token,\n                response.refresh_token\n            );\n            \n            // Clear any login lockout\n            await this.clearLoginAttempts(sanitizedEmail);\n            \n            AuthUtils.logAuthEvent('login_successful', {\n                userId: response.user.id,\n                username: response.user.username\n            });\n            \n            return {\n                success: true,\n                user: response.user,\n                message: 'Login successful'\n            };\n            \n        } catch (error) {\n            // Track failed login attempt\n            await this.trackFailedLoginAttempt(sanitizedEmail);\n            \n            AuthUtils.logAuthEvent('login_failed', {\n                email: sanitizedEmail,\n                error: error.message,\n                errorType: error.constructor.name\n            });\n            \n            throw error;\n        }\n    }\n    \n    /**\n     * Register new user account\n     */\n    async register(userData) {\n        // Input validation\n        const { email, password, username, role = 'user' } = userData;\n        \n        const sanitizedEmail = AuthUtils.sanitizeInput(email, SECURITY_CONFIG.MAX_EMAIL_LENGTH);\n        const sanitizedUsername = AuthUtils.sanitizeInput(username, SECURITY_CONFIG.MAX_USERNAME_LENGTH);\n        \n        if (!AuthUtils.isValidEmail(sanitizedEmail)) {\n            throw new ValidationError('Please enter a valid email address', 'email');\n        }\n        \n        if (!sanitizedUsername || sanitizedUsername.length < 2) {\n            throw new ValidationError('Username must be at least 2 characters long', 'username');\n        }\n        \n        const passwordValidation = AuthUtils.validatePassword(password);\n        if (!passwordValidation.valid) {\n            throw new ValidationError(passwordValidation.message, 'password');\n        }\n        \n        try {\n            AuthUtils.logAuthEvent('registration_attempt_started', {\n                email: sanitizedEmail,\n                username: sanitizedUsername,\n                role\n            });\n            \n            const response = await this.secureRequest(\n                API_ENDPOINTS.AUTH.REGISTER,\n                {\n                    method: 'POST',\n                    body: JSON.stringify({\n                        email: sanitizedEmail,\n                        password,\n                        username: sanitizedUsername,\n                        role\n                    }),\n                    skipAuth: true\n                }\n            );\n            \n            // Store authentication data if auto-login after registration\n            if (response.access_token && response.user) {\n                await this.storeAuthData(\n                    response.user,\n                    response.access_token,\n                    response.refresh_token\n                );\n            }\n            \n            AuthUtils.logAuthEvent('registration_successful', {\n                userId: response.user?.id,\n                username: response.user?.username,\n                autoLogin: !!(response.access_token)\n            });\n            \n            return {\n                success: true,\n                user: response.user,\n                message: response.message || 'Registration successful',\n                requiresVerification: response.requiresVerification || false\n            };\n            \n        } catch (error) {\n            AuthUtils.logAuthEvent('registration_failed', {\n                email: sanitizedEmail,\n                error: error.message,\n                errorType: error.constructor.name\n            });\n            \n            throw error;\n        }\n    }\n    \n    /**\n     * Logout user\n     */\n    async logout() {\n        try {\n            const token = await this.getStoredToken();\n            \n            if (token) {\n                // Notify server about logout\n                try {\n                    await this.secureRequest(\n                        API_ENDPOINTS.AUTH.LOGOUT,\n                        { method: 'POST' }\n                    );\n                } catch (error) {\n                    // Server logout failed, but continue with local cleanup\n                    AuthUtils.logAuthEvent('server_logout_failed', {\n                        error: error.message\n                    });\n                }\n            }\n            \n            // Clear local authentication data\n            await this.clearStoredAuth();\n            \n            AuthUtils.logAuthEvent('logout_successful');\n            \n            return {\n                success: true,\n                message: 'Logged out successfully'\n            };\n            \n        } catch (error) {\n            AuthUtils.logAuthEvent('logout_failed', {\n                error: error.message\n            });\n            \n            // Even if logout fails, clear local data\n            await this.clearStoredAuth();\n            \n            return {\n                success: false,\n                error: error.message,\n                message: 'Logout completed (with errors)'\n            };\n        }\n    }\n    \n    /**\n     * Check and enforce login lockout\n     */\n    async checkLoginLockout(email) {\n        const lockoutKey = `login_attempts_${AuthUtils.simpleHash(email)}`;\n        const result = await chrome.storage.local.get([lockoutKey]);\n        const attempts = result[lockoutKey] || { count: 0, firstAttempt: Date.now() };\n        \n        const timeSinceFirst = Date.now() - attempts.firstAttempt;\n        \n        // Reset attempts if lockout window has passed\n        if (timeSinceFirst > SECURITY_CONFIG.LOGIN_LOCKOUT_TIME) {\n            await chrome.storage.local.remove([lockoutKey]);\n            return;\n        }\n        \n        // Check if locked out\n        if (attempts.count >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {\n            const remainingTime = Math.ceil(\n                (SECURITY_CONFIG.LOGIN_LOCKOUT_TIME - timeSinceFirst) / 1000 / 60\n            );\n            \n            throw new AuthError(\n                `Too many failed login attempts. Please try again in ${remainingTime} minutes.`,\n                'LOGIN_LOCKOUT',\n                { remainingMinutes: remainingTime }\n            );\n        }\n    }\n    \n    /**\n     * Track failed login attempt\n     */\n    async trackFailedLoginAttempt(email) {\n        const lockoutKey = `login_attempts_${AuthUtils.simpleHash(email)}`;\n        const result = await chrome.storage.local.get([lockoutKey]);\n        const attempts = result[lockoutKey] || { count: 0, firstAttempt: Date.now() };\n        \n        attempts.count++;\n        attempts.lastAttempt = Date.now();\n        \n        await chrome.storage.local.set({ [lockoutKey]: attempts });\n    }\n    \n    /**\n     * Clear login attempts after successful login\n     */\n    async clearLoginAttempts(email) {\n        const lockoutKey = `login_attempts_${AuthUtils.simpleHash(email)}`;\n        await chrome.storage.local.remove([lockoutKey]);\n    }\n}\n\n// Create singleton instance\nconst authClient = new AuthApiClient();\n\n// Export for use in other files\nif (typeof module !== 'undefined' && module.exports) {\n    module.exports = { AuthApiClient, authClient };\n} else {\n    window.AuthApiClient = AuthApiClient;\n    window.authClient = authClient;\n}\n\nif (CONFIG?.IS_DEVELOPMENT) {\n    console.log('🔐 Auth API Client initialized:', authClient);\n}