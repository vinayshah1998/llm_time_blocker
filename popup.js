// The unlock phrase required to modify blocked sites
const UNLOCK_PHRASE = 'I understand this defeats the purpose of this extension';

// Default blocked sites
const DEFAULT_BLOCKED_SITES = [
  'youtube.com',
  'instagram.com',
  'reddit.com',
  'twitter.com',
  'x.com'
];

// DOM elements
const apiKeyInput = document.getElementById('api-key');
const saveApiKeyBtn = document.getElementById('save-api-key');
const apiKeyStatus = document.getElementById('api-key-status');
const activeApprovalsEl = document.getElementById('active-approvals');
const blockedSitesList = document.getElementById('blocked-sites-list');
const addSiteSection = document.getElementById('add-site-section');
const protectionSection = document.getElementById('protection-section');
const newSiteInput = document.getElementById('new-site');
const addSiteBtn = document.getElementById('add-site-btn');
const unlockPhraseInput = document.getElementById('unlock-phrase');
const unlockBtn = document.getElementById('unlock-btn');

// State
let isUnlocked = false;
let refreshInterval = null;

// Initialize
async function init() {
  await loadApiKey();
  await loadActiveApprovals();
  await loadBlockedSites();

  // Event listeners
  saveApiKeyBtn.addEventListener('click', saveApiKey);
  unlockBtn.addEventListener('click', handleUnlock);
  addSiteBtn.addEventListener('click', handleAddSite);

  // Allow Enter key for inputs
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveApiKey();
  });

  unlockPhraseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUnlock();
  });

  newSiteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddSite();
  });

  // Auto-refresh approvals every 30 seconds
  refreshInterval = setInterval(loadActiveApprovals, 30000);
}

// Load API key from storage
async function loadApiKey() {
  const data = await chrome.storage.local.get(['apiKey']);
  if (data.apiKey) {
    apiKeyInput.value = '••••••••••••••••••••';
    apiKeyInput.dataset.hasKey = 'true';
    showStatus(apiKeyStatus, 'API key is set', 'success');
  }
}

// Save API key
async function saveApiKey() {
  const apiKey = apiKeyInput.value.trim();

  if (!apiKey || apiKey === '••••••••••••••••••••') {
    showStatus(apiKeyStatus, 'Please enter a valid API key', 'error');
    return;
  }

  if (!apiKey.startsWith('sk-')) {
    showStatus(apiKeyStatus, 'Invalid API key format', 'error');
    return;
  }

  await chrome.storage.local.set({ apiKey });
  apiKeyInput.value = '••••••••••••••••••••';
  apiKeyInput.dataset.hasKey = 'true';
  showStatus(apiKeyStatus, 'API key saved!', 'success');
}

// Load active approvals
async function loadActiveApprovals() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_APPROVAL_STATUS' });
  const approvals = response.approvals || {};

  if (Object.keys(approvals).length === 0) {
    activeApprovalsEl.innerHTML = '<p class="empty-state">No active approvals</p>';
    return;
  }

  activeApprovalsEl.innerHTML = '';
  for (const [tabId, info] of Object.entries(approvals)) {
    const itemEl = document.createElement('div');
    itemEl.className = 'approval-item';

    // Truncate tab title if too long
    const displayTitle = info.tabTitle
      ? (info.tabTitle.length > 30 ? info.tabTitle.substring(0, 27) + '...' : info.tabTitle)
      : info.domain;

    itemEl.innerHTML = `
      <div class="approval-info">
        <span class="approval-domain" title="${info.tabTitle || info.domain}">${displayTitle}</span>
        <span class="approval-time">${info.remainingMins} min left</span>
      </div>
      <button class="revoke-btn" data-tab-id="${tabId}" title="Revoke access">&times;</button>
    `;
    activeApprovalsEl.appendChild(itemEl);
  }

  // Add event listeners for revoke buttons
  document.querySelectorAll('.revoke-btn').forEach(btn => {
    btn.addEventListener('click', () => handleRevokeApproval(btn.dataset.tabId));
  });
}

// Handle revoke approval
async function handleRevokeApproval(tabId) {
  await chrome.runtime.sendMessage({ type: 'REVOKE_APPROVAL', tabId });
  await loadActiveApprovals();
}

// Load blocked sites
async function loadBlockedSites() {
  const data = await chrome.storage.local.get(['blockedSites']);
  const blockedSites = data.blockedSites || DEFAULT_BLOCKED_SITES;

  renderBlockedSites(blockedSites);
}

// Render blocked sites list
function renderBlockedSites(sites) {
  blockedSitesList.innerHTML = '';

  for (const site of sites) {
    const li = document.createElement('li');
    li.className = 'site-item';
    li.innerHTML = `
      <span class="site-name">${site}</span>
      ${isUnlocked ? `<button class="remove-site-btn" data-site="${site}">&times;</button>` : ''}
    `;
    blockedSitesList.appendChild(li);
  }

  // Add event listeners for remove buttons
  if (isUnlocked) {
    document.querySelectorAll('.remove-site-btn').forEach(btn => {
      btn.addEventListener('click', () => handleRemoveSite(btn.dataset.site));
    });
  }
}

// Handle unlock
function handleUnlock() {
  const phrase = unlockPhraseInput.value.trim();

  if (phrase.toLowerCase() === UNLOCK_PHRASE.toLowerCase()) {
    isUnlocked = true;
    protectionSection.classList.add('hidden');
    addSiteSection.classList.add('visible');
    loadBlockedSites(); // Re-render with remove buttons
  } else {
    unlockPhraseInput.value = '';
    unlockPhraseInput.placeholder = 'Incorrect phrase. Try again...';
  }
}

// Handle add site
async function handleAddSite() {
  const newSite = newSiteInput.value.trim().toLowerCase();

  if (!newSite) return;

  // Basic validation
  if (!newSite.includes('.') || newSite.includes(' ')) {
    newSiteInput.value = '';
    newSiteInput.placeholder = 'Invalid domain format';
    return;
  }

  // Remove protocol if present
  const cleanSite = newSite.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const data = await chrome.storage.local.get(['blockedSites']);
  const blockedSites = data.blockedSites || DEFAULT_BLOCKED_SITES;

  if (blockedSites.includes(cleanSite)) {
    newSiteInput.value = '';
    newSiteInput.placeholder = 'Site already blocked';
    return;
  }

  blockedSites.push(cleanSite);
  await chrome.storage.local.set({ blockedSites });

  newSiteInput.value = '';
  newSiteInput.placeholder = 'e.g., facebook.com';
  renderBlockedSites(blockedSites);
}

// Handle remove site
async function handleRemoveSite(site) {
  const data = await chrome.storage.local.get(['blockedSites']);
  const blockedSites = data.blockedSites || DEFAULT_BLOCKED_SITES;

  const index = blockedSites.indexOf(site);
  if (index > -1) {
    blockedSites.splice(index, 1);
    await chrome.storage.local.set({ blockedSites });
    renderBlockedSites(blockedSites);
  }
}

// Show status message
function showStatus(element, message, type) {
  element.textContent = message;
  element.className = `status ${type}`;

  setTimeout(() => {
    if (type === 'success') {
      element.textContent = '';
    }
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
