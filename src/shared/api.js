// API client for LLM Time Blocker backend
// Handles authentication, token refresh, and API calls

const API_BASE_URL = 'https://backend-production-e828f.up.railway.app';
// For development, uncomment the line below:
// const API_BASE_URL = 'http://localhost:3000';

// Error codes for handling specific situations
const ErrorCodes = {
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
  SUBSCRIPTION_ENDED: 'SUBSCRIPTION_ENDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DAILY_LIMIT_EXCEEDED: 'DAILY_LIMIT_EXCEEDED',
};

// Custom error class for API errors
class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// Get stored auth tokens
async function getAuthTokens() {
  const data = await chrome.storage.local.get(['authTokens']);
  return data.authTokens || null;
}

// Store auth tokens
async function setAuthTokens(tokens) {
  await chrome.storage.local.set({ authTokens: tokens });
}

// Clear auth tokens (logout)
async function clearAuthTokens() {
  await chrome.storage.local.remove(['authTokens', 'user']);
}

// Store user data
async function setUser(user) {
  await chrome.storage.local.set({ user });
}

// Get stored user data
async function getUser() {
  const data = await chrome.storage.local.get(['user']);
  return data.user || null;
}

// Refresh access token using refresh token
async function refreshAccessToken() {
  const tokens = await getAuthTokens();
  if (!tokens?.refreshToken) {
    throw new ApiError('No refresh token available', 401);
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!response.ok) {
    // Clear tokens if refresh fails
    await clearAuthTokens();
    const data = await response.json().catch(() => ({}));
    throw new ApiError(
      data.error || 'Session expired. Please log in again.',
      response.status,
      data.code
    );
  }

  const data = await response.json();
  await setAuthTokens(data.tokens);
  await setUser(data.user);
  return data.tokens;
}

// Make authenticated API request with auto-refresh
async function apiRequest(endpoint, options = {}) {
  let tokens = await getAuthTokens();

  if (!tokens?.accessToken) {
    throw new ApiError('Not authenticated', 401);
  }

  const makeRequest = async (accessToken) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });

    return response;
  };

  let response = await makeRequest(tokens.accessToken);

  // If token expired, try to refresh and retry
  if (response.status === 401) {
    const data = await response.json().catch(() => ({}));
    if (data.code === ErrorCodes.TOKEN_EXPIRED) {
      try {
        tokens = await refreshAccessToken();
        response = await makeRequest(tokens.accessToken);
      } catch (refreshError) {
        throw refreshError;
      }
    }
  }

  // Parse response
  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      responseData.error || `Request failed with status ${response.status}`,
      response.status,
      responseData.code
    );
  }

  return responseData;
}

// Auth API functions
const authApi = {
  async signup(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(data.error || 'Signup failed', response.status, data.code);
    }

    await setAuthTokens(data.tokens);
    await setUser(data.user);
    return data;
  },

  async login(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(data.error || 'Login failed', response.status, data.code);
    }

    await setAuthTokens(data.tokens);
    await setUser(data.user);
    return data;
  },

  async loginWithGoogle(accessToken) {
    const response = await fetch(`${API_BASE_URL}/api/auth/oauth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(data.error || 'Google login failed', response.status, data.code);
    }

    await setAuthTokens(data.tokens);
    await setUser(data.user);
    return data;
  },

  async logout() {
    try {
      const tokens = await getAuthTokens();
      if (tokens?.refreshToken) {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      }
    } catch (e) {
      // Ignore errors during logout
    }
    await clearAuthTokens();
  },

  async getMe() {
    return apiRequest('/api/auth/me');
  },
};

// Billing API functions
const billingApi = {
  async createCheckoutSession(successUrl, cancelUrl) {
    return apiRequest('/api/billing/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ successUrl, cancelUrl }),
    });
  },

  async createPortalSession(returnUrl) {
    return apiRequest('/api/billing/create-portal-session', {
      method: 'POST',
      body: JSON.stringify({ returnUrl }),
    });
  },

  async getSubscriptionStatus() {
    return apiRequest('/api/billing/subscription-status');
  },
};

// LLM API functions
const llmApi = {
  async chat(messages, blockedUrl) {
    return apiRequest('/api/llm/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, blockedUrl }),
    });
  },
};

// Export everything
window.api = {
  ApiError,
  ErrorCodes,
  getAuthTokens,
  setAuthTokens,
  clearAuthTokens,
  getUser,
  setUser,
  auth: authApi,
  billing: billingApi,
  llm: llmApi,
};
