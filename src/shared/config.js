// Configuration for LLM Time Blocker
// Change the API_BASE_URL here to switch between environments

(function(global) {
  global.LLM_BLOCKER_CONFIG = {
    // Production
    API_BASE_URL: 'https://backend-production-e828f.up.railway.app',

    // Development - uncomment the line below and comment out Production:
    // API_BASE_URL: 'http://localhost:3000',
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
