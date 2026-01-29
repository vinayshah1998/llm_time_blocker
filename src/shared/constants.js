// Shared constants for LLM Time Blocker
// Used by background.js (via importScripts) and content pages (via script tag)

(function(global) {
  global.LLM_BLOCKER_CONSTANTS = {
    DEFAULT_BLOCKED_SITES: ['youtube.com', 'instagram.com', 'reddit.com', 'twitter.com', 'x.com'],
    APPROVAL_DURATION_MS: 30 * 60 * 1000,
    UNLOCK_PHRASE: 'I understand this defeats the purpose of this extension'
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
