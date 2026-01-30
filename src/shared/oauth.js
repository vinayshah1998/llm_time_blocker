// OAuth helper functions for Chrome extension
// Uses chrome.identity.getAuthToken() for Chrome Extension OAuth clients

// Initiate Google OAuth flow using chrome.identity.getAuthToken
// This works with "Chrome Extension" type OAuth clients and returns
// a Google access token directly (Chrome handles the OAuth flow internally)
async function initiateGoogleAuth() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error('No token received'));
        return;
      }
      resolve({ accessToken: token });
    });
  });
}

// Revoke the cached auth token (useful for logout or re-authentication)
async function revokeAuthToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

// Export to window for use in other scripts
window.oauth = {
  initiateGoogleAuth,
  revokeAuthToken,
};
