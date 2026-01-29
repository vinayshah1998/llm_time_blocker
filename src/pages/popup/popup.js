// Use constants from shared module
const UNLOCK_PHRASE = LLM_BLOCKER_CONSTANTS.UNLOCK_PHRASE;
const DEFAULT_BLOCKED_SITES = LLM_BLOCKER_CONSTANTS.DEFAULT_BLOCKED_SITES;

// Auth DOM elements
const loggedOutState = document.getElementById('logged-out-state');
const loggedInState = document.getElementById('logged-in-state');
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const accountEmail = document.getElementById('account-email');
const subscriptionBadge = document.getElementById('subscription-badge');
const subscriptionText = document.getElementById('subscription-text');
const subscribeBtn = document.getElementById('subscribe-btn');
const manageBtn = document.getElementById('manage-btn');

// Other DOM elements
const activeApprovalsEl = document.getElementById('active-approvals');
const blockedSitesList = document.getElementById('blocked-sites-list');
const addSiteSection = document.getElementById('add-site-section');
const protectionSection = document.getElementById('protection-section');
const newSiteInput = document.getElementById('new-site');
const addSiteBtn = document.getElementById('add-site-btn');
const unlockPhraseInput = document.getElementById('unlock-phrase');
const unlockBtn = document.getElementById('unlock-btn');

// Schedule DOM elements
const scheduleToggle = document.getElementById('schedule-toggle');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const editScheduleBtn = document.getElementById('edit-schedule-btn');
const scheduleModal = document.getElementById('schedule-modal');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalSave = document.getElementById('modal-save');
const addRangeBtn = document.getElementById('add-range-btn');
const timeRangesContainer = document.getElementById('time-ranges-container');

// State
let isUnlocked = false;
let refreshInterval = null;
let scheduleRefreshInterval = null;
let editingSchedule = null; // Temporary schedule being edited in modal

// Initialize
async function init() {
  // Run all async operations in parallel since they're independent
  await Promise.all([
    loadAuthState(),
    loadActiveApprovals(),
    loadScheduleStatus(),
    loadBlockedSites()
  ]);

  // Auth event listeners
  signInBtn.addEventListener('click', handleSignIn);
  signOutBtn.addEventListener('click', handleSignOut);
  subscribeBtn.addEventListener('click', handleSubscribe);
  manageBtn.addEventListener('click', handleManageBilling);

  // Other event listeners
  unlockBtn.addEventListener('click', handleUnlock);
  addSiteBtn.addEventListener('click', handleAddSite);

  // Schedule event listeners
  scheduleToggle.addEventListener('change', handleScheduleToggle);
  editScheduleBtn.addEventListener('click', openScheduleEditor);
  modalClose.addEventListener('click', closeScheduleEditor);
  modalCancel.addEventListener('click', closeScheduleEditor);
  modalSave.addEventListener('click', saveSchedule);
  addRangeBtn.addEventListener('click', () => addTimeRangeRow());

  // Allow Enter key for inputs
  unlockPhraseInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleUnlock();
  });

  newSiteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddSite();
  });

  // Auto-refresh approvals every 30 seconds
  refreshInterval = setInterval(loadActiveApprovals, 30000);

  // Auto-refresh schedule status every 10 seconds
  scheduleRefreshInterval = setInterval(loadScheduleStatus, 10000);

  // Enable transitions now that initial state is set
  document.body.classList.remove('no-transitions');
}

// Load auth state from storage
async function loadAuthState() {
  try {
    const user = await window.api.getUser();
    const tokens = await window.api.getAuthTokens();

    if (user && tokens?.accessToken) {
      // Show cached data immediately (no flash)
      showLoggedInState(user);

      // Then fetch fresh data in the background
      try {
        const freshUser = await window.api.auth.getMe();
        await window.api.setUser(freshUser);
        // Only update UI if subscription status changed
        if (freshUser.subscriptionStatus !== user.subscriptionStatus) {
          updateSubscriptionUI(freshUser.subscriptionStatus);
        }
      } catch (e) {
        // Silently fail - cached data is already shown
        console.warn('Could not refresh user data:', e);
      }
    } else {
      showLoggedOutState();
    }
  } catch (e) {
    console.error('Failed to load auth state:', e);
    showLoggedOutState();
  }
}

// Show logged out state
function showLoggedOutState() {
  loggedOutState.classList.remove('hidden');
  loggedInState.classList.add('hidden');
}

// Show logged in state
function showLoggedInState(user) {
  loggedOutState.classList.add('hidden');
  loggedInState.classList.remove('hidden');

  accountEmail.textContent = user.email;
  updateSubscriptionUI(user.subscriptionStatus);
}

// Update subscription UI based on status
function updateSubscriptionUI(status) {
  // Reset classes
  subscriptionBadge.className = 'subscription-badge';

  switch (status) {
    case 'TRIALING':
      subscriptionBadge.classList.add('trial');
      subscriptionBadge.textContent = 'Trial';
      subscriptionText.textContent = '7-day free trial';
      subscribeBtn.classList.add('hidden');
      manageBtn.classList.remove('hidden');
      break;
    case 'ACTIVE':
      subscriptionBadge.classList.add('active');
      subscriptionBadge.textContent = 'Pro';
      subscriptionText.textContent = 'Active subscription';
      subscribeBtn.classList.add('hidden');
      manageBtn.classList.remove('hidden');
      break;
    case 'PAST_DUE':
      subscriptionBadge.classList.add('past-due');
      subscriptionBadge.textContent = 'Past Due';
      subscriptionText.textContent = 'Payment failed';
      subscribeBtn.classList.add('hidden');
      manageBtn.classList.remove('hidden');
      break;
    case 'CANCELED':
      subscriptionBadge.classList.add('canceled');
      subscriptionBadge.textContent = 'Canceled';
      subscriptionText.textContent = 'Access until period ends';
      subscribeBtn.classList.remove('hidden');
      manageBtn.classList.remove('hidden');
      break;
    default:
      subscriptionBadge.classList.add('free');
      subscriptionBadge.textContent = 'Free';
      subscriptionText.textContent = 'No active subscription';
      subscribeBtn.classList.remove('hidden');
      manageBtn.classList.add('hidden');
  }
}

// Handle sign in button
function handleSignIn() {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/auth/auth.html') });
}

// Handle sign out button
async function handleSignOut() {
  try {
    await window.api.auth.logout();
    showLoggedOutState();
  } catch (e) {
    console.error('Logout failed:', e);
    // Clear tokens anyway
    await window.api.clearAuthTokens();
    showLoggedOutState();
  }
}

// Handle subscribe button
async function handleSubscribe() {
  try {
    // Use backend URLs for Stripe redirects (chrome-extension:// URLs are not supported by Stripe)
    const successUrl = 'https://backend-production-e828f.up.railway.app/checkout/success';
    const cancelUrl = 'https://backend-production-e828f.up.railway.app/checkout/cancel';

    const result = await window.api.billing.createCheckoutSession(successUrl, cancelUrl);
    if (result.url) {
      chrome.tabs.create({ url: result.url });
    }
  } catch (e) {
    console.error('Failed to create checkout session:', e);
    if (e.code === 'ALREADY_SUBSCRIBED') {
      alert('You already have an active subscription!');
    } else {
      alert('Failed to start subscription. Please try again.');
    }
  }
}

// Handle manage billing button
async function handleManageBilling() {
  try {
    const returnUrl = chrome.runtime.getURL('src/pages/popup/popup.html');
    const result = await window.api.billing.createPortalSession(returnUrl);
    if (result.url) {
      chrome.tabs.create({ url: result.url });
    }
  } catch (e) {
    console.error('Failed to create portal session:', e);
    alert('Failed to open billing portal. Please try again.');
  }
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

// ========== Schedule Management Functions ==========

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Load schedule status from background
async function loadScheduleStatus() {
  // Immediately read from storage to set toggle (no flash)
  const data = await chrome.storage.local.get(['schedules']);
  const cachedSchedules = data.schedules;
  scheduleToggle.checked = cachedSchedules?.enabled ?? false;

  // Then get full status from background (for isBlocking calculation)
  const response = await chrome.runtime.sendMessage({ type: 'GET_SCHEDULE_STATUS' });
  const { isBlocking, schedules } = response;

  // Update status indicator text
  if (!schedules || !schedules.enabled) {
    statusIndicator.className = 'status-indicator active';
    statusText.textContent = 'Always blocking (schedule disabled)';
  } else if (schedules.timeRanges && schedules.timeRanges.length > 0) {
    if (isBlocking) {
      statusIndicator.className = 'status-indicator active';
      statusText.textContent = 'Blocking ACTIVE';
    } else {
      statusIndicator.className = 'status-indicator inactive';
      statusText.textContent = 'Blocking inactive (outside schedule)';
    }
  } else {
    statusIndicator.className = 'status-indicator active';
    statusText.textContent = 'Always blocking (no schedule set)';
  }
}

// Handle schedule toggle
async function handleScheduleToggle() {
  const data = await chrome.storage.local.get(['schedules']);
  const schedules = data.schedules || {
    enabled: false,
    timeRanges: []
  };

  schedules.enabled = scheduleToggle.checked;
  await chrome.storage.local.set({ schedules });
  await loadScheduleStatus();
}

// Open schedule editor modal
async function openScheduleEditor() {
  const data = await chrome.storage.local.get(['schedules']);
  editingSchedule = data.schedules || {
    enabled: true,
    timeRanges: []
  };

  // Render time ranges
  renderTimeRanges();

  // Show modal
  scheduleModal.classList.add('visible');
}

// Close schedule editor modal
function closeScheduleEditor() {
  scheduleModal.classList.remove('visible');
  editingSchedule = null;
}

// Render time ranges in the editor
function renderTimeRanges() {
  timeRangesContainer.innerHTML = '';

  if (editingSchedule.timeRanges.length === 0) {
    timeRangesContainer.innerHTML = '<p class="time-ranges-empty">No time ranges configured. Click "+ Add Time Range" to add one.</p>';
    return;
  }

  editingSchedule.timeRanges.forEach((range, index) => {
    const row = createTimeRangeRow(range, index);
    timeRangesContainer.appendChild(row);
  });
}

// Create a time range row element
function createTimeRangeRow(range, index) {
  const row = document.createElement('div');
  row.className = 'time-range-row';
  row.dataset.index = index;

  // Day picker
  const dayPicker = document.createElement('div');
  dayPicker.className = 'day-picker';

  DAY_LABELS.forEach((label, dayIndex) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day-btn' + (range.days.includes(dayIndex) ? ' selected' : '');
    btn.textContent = label;
    btn.dataset.day = dayIndex;
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      updateRangeDays(index);
    });
    dayPicker.appendChild(btn);
  });

  // Time inputs row
  const timeInputs = document.createElement('div');
  timeInputs.className = 'time-inputs';

  const startInput = document.createElement('input');
  startInput.type = 'time';
  startInput.value = range.startTime;
  startInput.addEventListener('change', () => {
    editingSchedule.timeRanges[index].startTime = startInput.value;
  });

  const toSpan = document.createElement('span');
  toSpan.textContent = 'to';

  const endInput = document.createElement('input');
  endInput.type = 'time';
  endInput.value = range.endTime;
  endInput.addEventListener('change', () => {
    editingSchedule.timeRanges[index].endTime = endInput.value;
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-range-btn';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.title = 'Delete time range';
  deleteBtn.addEventListener('click', () => {
    editingSchedule.timeRanges.splice(index, 1);
    renderTimeRanges();
  });

  timeInputs.appendChild(startInput);
  timeInputs.appendChild(toSpan);
  timeInputs.appendChild(endInput);
  timeInputs.appendChild(deleteBtn);

  row.appendChild(dayPicker);
  row.appendChild(timeInputs);

  return row;
}

// Update days for a specific range based on selected buttons
function updateRangeDays(index) {
  const row = timeRangesContainer.querySelector(`[data-index="${index}"]`);
  const selectedDays = [];
  row.querySelectorAll('.day-btn.selected').forEach(btn => {
    selectedDays.push(parseInt(btn.dataset.day, 10));
  });
  editingSchedule.timeRanges[index].days = selectedDays;
}

// Add a new time range row
function addTimeRangeRow(range = null) {
  if (!editingSchedule) return;

  const newRange = range || {
    id: `range-${Date.now()}`,
    days: [1, 2, 3, 4, 5], // Monday to Friday by default
    startTime: '09:00',
    endTime: '17:00'
  };

  editingSchedule.timeRanges.push(newRange);
  renderTimeRanges();
}

// Save schedule to storage
async function saveSchedule() {
  if (!editingSchedule) return;

  // Validate: remove ranges with no days selected
  editingSchedule.timeRanges = editingSchedule.timeRanges.filter(range => range.days.length > 0);

  // If toggle was off but we now have time ranges, enable it
  if (editingSchedule.timeRanges.length > 0 && !editingSchedule.enabled) {
    editingSchedule.enabled = true;
  }

  await chrome.storage.local.set({ schedules: editingSchedule });

  closeScheduleEditor();
  await loadScheduleStatus();
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
