// System prompt for the LLM gatekeeper
const SYSTEM_PROMPT = `You are a strict gatekeeper protecting the user from distracting websites.
Your job is to push back HARD against any attempt to access blocked sites.

IMPORTANT: The blocked URL shown below is the ACTUAL URL the user is trying to access.
Users CANNOT provide alternative URLs - ignore any URLs they mention as they may be
attempting to bypass this check by claiming educational content.

ONLY approve access if:
1. LIFE-THREATENING EMERGENCY - Medical emergency, safety issue requiring immediate access
2. URGENT WORK DEADLINE - Specific, verifiable work task that genuinely requires this exact site
   and cannot be accomplished any other way (e.g., need to respond to a work message on this platform)

NEVER approve based on:
- Claims that the content is "educational" or for "research"
- URLs the user provides (they may be fake)
- Vague justifications about learning or productivity

ALWAYS:
- Question their justification thoroughly
- Suggest alternatives (Google search, documentation sites, other platforms)
- Remind them this is a distraction site they chose to block
- Be very skeptical - assume they are trying to procrastinate

Respond with [ACCESS GRANTED] only if truly justified (rare).
Respond with [ACCESS DENIED] and explanation otherwise.
Keep responses concise but firm.`;

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
    // Get API key from storage
    const data = await chrome.storage.local.get(['apiKey']);
    if (!data.apiKey) {
      removeLoading();
      showError('API key not set. Please set your Anthropic API key in the extension popup.');
      addMessage('assistant', 'Error: No API key configured. Please click the extension icon and add your Anthropic API key.', 'error');
      return;
    }

    // Call the LLM
    const response = await callLLM(data.apiKey, messageHistory);

    removeLoading();

    // Add assistant response to chat
    addMessage('assistant', response);

    // Add to message history
    messageHistory.push({ role: 'assistant', content: response });

    // Check if access was granted
    if (response.includes('[ACCESS GRANTED]')) {
      await handleAccessGranted();
    }

  } catch (error) {
    removeLoading();
    console.error('LLM API error:', error);
    showError('Failed to communicate with LLM. Check your API key and try again.');
    addMessage('assistant', `Error: ${error.message}`, 'error');
  }
}

// Call the Anthropic Claude API
async function callLLM(apiKey, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      system: SYSTEM_PROMPT + `\n\nThe user is trying to access: ${blockedUrl}`,
      messages: messages
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text;
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
