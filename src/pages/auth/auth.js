// Auth page handler for LLM Time Blocker

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginFormEl = document.getElementById('login-form-el');
const signupFormEl = document.getElementById('signup-form-el');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const googleSigninBtn = document.getElementById('google-signin');
const authError = document.getElementById('auth-error');
const errorMessage = document.getElementById('error-message');
const authSuccess = document.getElementById('auth-success');
const successMessage = document.getElementById('success-message');

// Tab switching
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;

    // Update active tab
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show corresponding form
    if (tab === 'login') {
      loginForm.classList.add('active');
      signupForm.classList.remove('active');
    } else {
      signupForm.classList.add('active');
      loginForm.classList.remove('active');
    }

    // Clear messages
    hideError();
    hideSuccess();
  });
});

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  authError.classList.add('visible');
  authSuccess.classList.remove('visible');
}

// Hide error message
function hideError() {
  authError.classList.remove('visible');
}

// Show success message
function showSuccess(message) {
  successMessage.textContent = message;
  authSuccess.classList.add('visible');
  authError.classList.remove('visible');
}

// Hide success message
function hideSuccess() {
  authSuccess.classList.remove('visible');
}

// Set button loading state
function setLoading(button, loading) {
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = '<span class="loading-spinner"></span>Please wait...';
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText;
  }
}

// Handle login
loginFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showError('Please fill in all fields');
    return;
  }

  setLoading(loginBtn, true);

  try {
    await window.api.auth.login(email, password);
    showSuccess('Login successful! Redirecting...');

    // Close this tab and notify the extension
    setTimeout(() => {
      window.close();
    }, 1000);
  } catch (error) {
    showError(error.message || 'Login failed. Please try again.');
  } finally {
    setLoading(loginBtn, false);
  }
});

// Handle signup
signupFormEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;

  if (!email || !password || !confirm) {
    showError('Please fill in all fields');
    return;
  }

  if (password.length < 8) {
    showError('Password must be at least 8 characters');
    return;
  }

  if (password !== confirm) {
    showError('Passwords do not match');
    return;
  }

  setLoading(signupBtn, true);

  try {
    await window.api.auth.signup(email, password);
    showSuccess('Account created! Redirecting...');

    // Close this tab and notify the extension
    setTimeout(() => {
      window.close();
    }, 1000);
  } catch (error) {
    showError(error.message || 'Signup failed. Please try again.');
  } finally {
    setLoading(signupBtn, false);
  }
});

// Handle Google sign-in
googleSigninBtn.addEventListener('click', async () => {
  hideError();
  setLoading(googleSigninBtn, true);

  try {
    // Get Google access token via chrome.identity.getAuthToken
    const { accessToken } = await window.oauth.initiateGoogleAuth();

    // Send access token to backend for verification and JWT token exchange
    await window.api.auth.loginWithGoogle(accessToken);

    showSuccess('Login successful! Redirecting...');

    // Close this tab
    setTimeout(() => {
      window.close();
    }, 1000);
  } catch (error) {
    // Handle user cancellation gracefully
    if (error.message?.includes('canceled') || error.message?.includes('cancelled') || error.message?.includes('The user did not approve')) {
      hideError();
    } else {
      showError(error.message || 'Google sign-in failed. Please try again.');
    }
  } finally {
    setLoading(googleSigninBtn, false);
  }
});

// Check if already logged in
async function checkAuth() {
  try {
    const tokens = await window.api.getAuthTokens();
    if (tokens?.accessToken) {
      // Already logged in, close this page
      showSuccess('Already logged in! Closing...');
      setTimeout(() => {
        window.close();
      }, 500);
    }
  } catch (e) {
    // Not logged in, stay on this page
  }
}

// Initialize
checkAuth();
