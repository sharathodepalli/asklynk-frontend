/**
 * Environment Configuration for AskLynk Chrome Extension
 * Handles development vs production environment switching
 */

// Environment detection - checks if this is a development build
const isDevelopment = () => {
  // Check if we're in development mode by looking for development indicators
  // This can be set during build process or detected by extension ID
  try {
    const manifest = chrome.runtime.getManifest();
    // Development builds typically have "version_name" or different IDs
    return (
      manifest.version_name === 'development' || 
      manifest.name.includes('Dev') ||
      manifest.name.includes('Development') ||
      chrome.runtime.id === 'development-extension-id' // Will be different in dev
    );
  } catch (error) {
    // Default to production for safety
    return false;
  }
};

// Configuration object
const CONFIG = {
  development: {
    API_BASE_URL: 'http://localhost:3000',
    AUTH_PAGE_URL: 'http://localhost:5173',
    ENVIRONMENT: 'development',
    DEBUG_LOGGING: true
  },
  production: {
    API_BASE_URL: 'https://asklynk-bkend-d5qpx8shx-sharath-chandra-s-projects.vercel.app',
    AUTH_PAGE_URL: 'https://asklynk.vercel.app',
    ENVIRONMENT: 'production',
    DEBUG_LOGGING: false
  }
};

// Get current environment configuration
const getEnvironmentConfig = () => {
  const environment = isDevelopment() ? 'development' : 'production';
  return {
    ...CONFIG[environment],
    IS_DEVELOPMENT: environment === 'development',
    IS_PRODUCTION: environment === 'production'
  };
};

// Export configuration (will be used across all files)
const ENV_CONFIG = getEnvironmentConfig();

// Export individual values for easy access
const API_BASE_URL = ENV_CONFIG.API_BASE_URL;
const AUTH_PAGE_URL = ENV_CONFIG.AUTH_PAGE_URL;
const IS_DEVELOPMENT = ENV_CONFIG.IS_DEVELOPMENT;
const IS_PRODUCTION = ENV_CONFIG.IS_PRODUCTION;
const DEBUG_LOGGING = ENV_CONFIG.DEBUG_LOGGING;

// Enhanced logging functions that respect environment
const Logger = {
  log: (...args) => {
    if (DEBUG_LOGGING) console.log(...args);
  },
  warn: (...args) => {
    if (DEBUG_LOGGING) console.warn(...args);
  },
  error: (...args) => {
    // Always log errors, even in production
    console.error(...args);
  },
  info: (...args) => {
    if (DEBUG_LOGGING) console.info(...args);
  },
  debug: (...args) => {
    if (DEBUG_LOGGING) console.debug(...args);
  }
};

// Helper function to build API URLs
const buildApiUrl = (endpoint) => {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_BASE_URL}/${cleanEndpoint}`;
};

// Helper function to build auth URLs
const buildAuthUrl = (path = '') => {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return cleanPath ? `${AUTH_PAGE_URL}/${cleanPath}` : AUTH_PAGE_URL;
};

// Development utilities (only available in development)
const DevUtils = IS_DEVELOPMENT ? {
  logConfig: () => {
    console.log('🔧 Environment Configuration:', ENV_CONFIG);
  },
  testUrls: () => {
    console.log('🌐 API Base URL:', API_BASE_URL);
    console.log('🔐 Auth Page URL:', AUTH_PAGE_URL);
    console.log('🏗️ Environment:', ENV_CONFIG.ENVIRONMENT);
  },
  switchToProduction: () => {
    console.warn('⚠️ Cannot switch environment at runtime. Rebuild for production.');
  }
} : {};

// Global availability check
console.log(`🚀 AskLynk Extension loaded in ${ENV_CONFIG.ENVIRONMENT} mode`);
if (IS_DEVELOPMENT) {
  console.log('🔧 Development utilities available via DevUtils object');
  window.DevUtils = DevUtils;
}
