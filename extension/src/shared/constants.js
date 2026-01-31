// Shared constants for LLM Time Blocker
// Used by background.js (via importScripts) and content pages (via script tag)

(function(global) {
  global.LLM_BLOCKER_CONSTANTS = {
    DEFAULT_BLOCKED_SITES: ['youtube.com', 'instagram.com', 'reddit.com', 'twitter.com', 'x.com'],
    APPROVAL_DURATION_MS: 30 * 60 * 1000,
    // Intentionally visible - this is a friction mechanism, not a security boundary.
    // Users who inspect source code to find this phrase are demonstrating deliberate intent.
    UNLOCK_PHRASE_HASH: '3813af79de5393f0e286b82c4e9543bff40f1c23bc230be5c5de34d20a6b1bca'
  };

  global.verifyUnlockPhrase = async function(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === global.LLM_BLOCKER_CONSTANTS.UNLOCK_PHRASE_HASH;
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
