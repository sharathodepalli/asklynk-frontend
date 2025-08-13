/**
 * Service Worker Compatible Configuration for AskLynk Chrome Extension
 * This version doesn't use Chrome APIs during import
 */

// Configuration object - static configuration that works in service workers
const CONFIG_DATA = {
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

// Environment detection function - to be called when Chrome APIs are ready
const detectEnvironment = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      const manifest = chrome.runtime.getManifest();
      return (
        manifest.version_name === 'development' || 
        manifest.name.includes('Dev') ||
        manifest.name.includes('Development')
      ) ? 'development' : 'production';
    }
  } catch (error) {
    // Default to production for safety
    console.warn('Environment detection failed:', error);
  }
  return 'production';
};

// Get current environment configuration - safe to call anytime
const getEnvironmentConfig = () => {
  const environment = detectEnvironment();
  return {
    ...CONFIG_DATA[environment],
    IS_DEVELOPMENT: environment === 'development',
    IS_PRODUCTION: environment === 'production'
  };
};

// Make available globally for service worker
if (typeof self !== 'undefined') {
  // Service worker context
  self.getEnvironmentConfig = getEnvironmentConfig;
  self.CONFIG_DATA = CONFIG_DATA;
}
