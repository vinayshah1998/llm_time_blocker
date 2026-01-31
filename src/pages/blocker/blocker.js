// Get DOM elements
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const blockedUrlEl = document.getElementById('blocked-url');
const errorMessageEl = document.getElementById('error-message');

// Get the blocked URL from query params
const urlParams = new URLSearchParams(window.location.search);
const blockedUrl = urlParams.get('url');

// Message history for LLM context
let messageHistory = [];

// Initialize
function init() {
  if (!blockedUrl) {
    showError('No URL specified. This page should not be accessed directly.');
    return;
  }

  blockedUrlEl.textContent = blockedUrl;

  // Add initial assistant message
  addMessage('assistant', `You're trying to access a blocked site. This site has been blocked to help you stay focused.

If you believe you have a legitimate reason to access it, explain your justification. I'll need specifics - vague reasons like "research" or "learning" won't cut it.

What's your reason for needing access?`);

  // Set up anti-paste/anti-cheat measures
  setupAntiCheat();

  // Set up send button
  sendBtn.addEventListener('click', handleSend);
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Enable send button when there's input
  userInput.addEventListener('input', () => {
    sendBtn.disabled = userInput.value.trim().length === 0;
  });
}

// Anti-cheat measures to prevent paste
function setupAntiCheat() {
  // Disable paste
  userInput.addEventListener('paste', (e) => {
    e.preventDefault();
    showError('Paste is disabled. You must type your justification manually.');
  });

  // Disable drop
  userInput.addEventListener('drop', (e) => {
    e.preventDefault();
    showError('Drag and drop is disabled. You must type your justification manually.');
  });

  // Block keyboard shortcuts for paste
  userInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      showError('Paste is disabled. You must type your justification manually.');
    }
  });
}

// Add a message to the chat
function addMessage(role, content, className = '') {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${role} ${className}`.trim();
  messageEl.textContent = content;
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show loading indicator
function showLoading() {
  const loadingEl = document.createElement('div');
  loadingEl.className = 'message assistant loading';
  loadingEl.id = 'loading-indicator';
  loadingEl.innerHTML = `
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  chatMessages.appendChild(loadingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove loading indicator
function removeLoading() {
  const loadingEl = document.getElementById('loading-indicator');
  if (loadingEl) {
    loadingEl.remove();
  }
}

// Show error message
function showError(message) {
  errorMessageEl.textContent = message;
  errorMessageEl.classList.add('visible');
  setTimeout(() => {
    errorMessageEl.classList.remove('visible');
  }, 5000);
}

// Handle sending a message
async function handleSend() {
  const message = userInput.value.trim();
  if (!message) return;

  // Clear input and disable button
  userInput.value = '';
  sendBtn.disabled = true;

  // Add user message to chat
  addMessage('user', message);

  // Add to message history
  messageHistory.push({ role: 'user', content: message });

  // Show loading indicator
  showLoading();

  try {
    // Check if user is authenticated
    const tokens = await window.api.getAuthTokens();
    if (!tokens?.accessToken) {
      removeLoading();
      showError('Please sign in to use LLM Time Blocker.');
      addMessage('assistant', 'Error: You need to sign in to use this service. Click the extension icon to sign in or create an account.', 'error');
      return;
    }

    // Call the LLM via backend proxy
    const result = await callLLM(messageHistory);

    removeLoading();

    // Add assistant response to chat
    addMessage('assistant', result.response);

    // Add to message history
    messageHistory.push({ role: 'assistant', content: result.response });

    // Check if access was granted
    if (result.response.includes('[ACCESS GRANTED]')) {
      await handleAccessGranted();
    }

  } catch (error) {
    removeLoading();
    console.error('LLM API error:', error);

    // Handle specific error codes
    if (error.code === 'SUBSCRIPTION_REQUIRED') {
      showError('A subscription is required. Click the extension icon to subscribe.');
      addMessage('assistant', 'Error: An active subscription is required to use this service. Click the extension icon to subscribe ($5/month with 7-day free trial).', 'error');
    } else if (error.code === 'SUBSCRIPTION_ENDED') {
      showError('Your subscription has ended. Please resubscribe to continue.');
      addMessage('assistant', 'Error: Your subscription has ended. Click the extension icon to resubscribe.', 'error');
    } else if (error.code === 'RATE_LIMIT_EXCEEDED' || error.code === 'DAILY_LIMIT_EXCEEDED') {
      showError('Rate limit exceeded. Please wait before sending more messages.');
      addMessage('assistant', 'Error: You\'ve sent too many messages. Please wait a moment before trying again.', 'error');
    } else if (error.status === 401) {
      showError('Session expired. Please sign in again.');
      addMessage('assistant', 'Error: Your session has expired. Click the extension icon to sign in again.', 'error');
    } else if (error instanceof TypeError && error.message === 'Failed to fetch') {
      showError('Unable to reach the server. Please check your internet connection and try again.');
      addMessage('assistant', 'Error: Unable to reach the server. Please check your internet connection and try again.', 'error');
    } else if (error.name === 'AbortError' || error.code === 'TIMEOUT') {
      showError('Request timed out. The server may be experiencing issues. Please try again.');
      addMessage('assistant', 'Error: The request timed out. The server may be experiencing issues. Please try again.', 'error');
    } else {
      showError('Something went wrong. Please try again in a moment.');
      addMessage('assistant', 'Error: Something went wrong. Please try again in a moment.', 'error');
    }
  }
}

// Call the LLM via backend proxy
async function callLLM(messages) {
  return await window.api.llm.chat(messages, blockedUrl);
}

// Handle access granted
async function handleAccessGranted() {
  addMessage('system', 'Access granted for 30 minutes. Redirecting...', 'granted');

  // Grant approval via background script
  await chrome.runtime.sendMessage({
    type: 'GRANT_APPROVAL',
    url: blockedUrl
  });

  // Redirect after a brief delay
  setTimeout(() => {
    window.location.href = blockedUrl;
  }, 1500);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
