// Default blocked sites
const DEFAULT_BLOCKED_SITES = [
  'youtube.com',
  'instagram.com',
  'reddit.com',
  'twitter.com',
  'x.com'
];

// Approval duration in milliseconds (30 minutes)
const APPROVAL_DURATION_MS = 30 * 60 * 1000;

// Grace period for navigation checks (to avoid race conditions)
const NAVIGATION_GRACE_PERIOD_MS = 5000;

// Initialize storage with default blocked sites on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['blockedSites']);
  if (!data.blockedSites) {
    await chrome.storage.local.set({ blockedSites: DEFAULT_BLOCKED_SITES });
  }
  // Clean up any old domain-based approvals from previous version
  await chrome.storage.local.remove(['approvals']);
});

// Startup cleanup - validate tabs still exist and clean orphaned approvals
chrome.runtime.onStartup.addListener(async () => {
  await cleanupOrphanedApprovals();
});

// Clean up approvals for tabs that no longer exist
async function cleanupOrphanedApprovals() {
  const data = await chrome.storage.local.get(['tabApprovals']);
  const tabApprovals = data.tabApprovals || {};

  const tabs = await chrome.tabs.query({});
  const existingTabIds = new Set(tabs.map(t => t.id.toString()));

  let changed = false;
  for (const tabId of Object.keys(tabApprovals)) {
    if (!existingTabIds.has(tabId)) {
      // Tab no longer exists, clean up
      const approval = tabApprovals[tabId];
      if (approval.alarmName) {
        await chrome.alarms.clear(approval.alarmName);
      }
      delete tabApprovals[tabId];
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ tabApprovals });
  }
}

// Check if a URL matches any blocked site
function isBlockedSite(url, blockedSites) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    return blockedSites.some(site => {
      const siteLower = site.toLowerCase();
      return hostname === siteLower || hostname.endsWith('.' + siteLower);
    });
  } catch {
    return false;
  }
}

// Get the domain from a URL
function getDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    return null;
  }
}

// Get the base blocked domain that matches a URL
function getMatchingBlockedDomain(url, blockedSites) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    for (const site of blockedSites) {
      const siteLower = site.toLowerCase();
      if (hostname === siteLower || hostname.endsWith('.' + siteLower)) {
        return siteLower;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Check if a specific tab has active approval for a URL
async function hasActiveApprovalForTab(url, tabId) {
  const domain = getDomain(url);
  if (!domain) return false;

  const data = await chrome.storage.local.get(['tabApprovals', 'blockedSites']);
  const tabApprovals = data.tabApprovals || {};
  const blockedSites = data.blockedSites || DEFAULT_BLOCKED_SITES;

  const approval = tabApprovals[tabId.toString()];
  if (!approval) return false;

  // Check if approval is for the same blocked domain (not just exact domain)
  const approvedBlockedDomain = getMatchingBlockedDomain(approval.url, blockedSites);
  const currentBlockedDomain = getMatchingBlockedDomain(url, blockedSites);

  if (approvedBlockedDomain !== currentBlockedDomain) return false;

  // Check if approval is still valid
  if (Date.now() < approval.expiresAt) {
    return true;
  }

  // Approval expired, clean it up
  await revokeApprovalForTab(tabId);
  return false;
}

// Grant approval for a specific tab
async function grantApproval(url, tabId) {
  const domain = getDomain(url);
  if (!domain) return;

  const data = await chrome.storage.local.get(['tabApprovals']);
  const tabApprovals = data.tabApprovals || {};

  const now = Date.now();
  const expiresAt = now + APPROVAL_DURATION_MS;
  const alarmName = `tab-expire-${tabId}`;

  // Create alarm for expiration
  await chrome.alarms.create(alarmName, { when: expiresAt });

  tabApprovals[tabId.toString()] = {
    domain,
    url,
    grantedAt: now,
    expiresAt,
    alarmName
  };

  await chrome.storage.local.set({ tabApprovals });
}

// Revoke approval for a specific tab
async function revokeApprovalForTab(tabId) {
  const data = await chrome.storage.local.get(['tabApprovals']);
  const tabApprovals = data.tabApprovals || {};

  const approval = tabApprovals[tabId.toString()];
  if (approval) {
    // Clear the alarm
    if (approval.alarmName) {
      await chrome.alarms.clear(approval.alarmName);
    }
    delete tabApprovals[tabId.toString()];
    await chrome.storage.local.set({ tabApprovals });
  }
}

// Handle approval expiration
async function handleApprovalExpiration(tabId) {
  const data = await chrome.storage.local.get(['tabApprovals']);
  const tabApprovals = data.tabApprovals || {};
  const approval = tabApprovals[tabId.toString()];

  if (!approval) return;

  const originalUrl = approval.url;

  // Remove approval from storage
  await revokeApprovalForTab(tabId);

  // Check if tab still exists
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) return;

    // Inject expiration overlay
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showExpirationOverlay
    });

    // Redirect to blocker page after delay
    setTimeout(async () => {
      try {
        const blockerUrl = chrome.runtime.getURL('blocker.html') + '?url=' + encodeURIComponent(originalUrl);
        await chrome.tabs.update(tabId, { url: blockerUrl });
      } catch {
        // Tab may have been closed
      }
    }, 1500);
  } catch {
    // Tab doesn't exist anymore
  }
}

// Function to inject into the page to show expiration overlay
function showExpirationOverlay() {
  // Remove any existing overlay
  const existing = document.getElementById('llm-blocker-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'llm-blocker-overlay';
  overlay.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="
        text-align: center;
        color: white;
      ">
        <div style="font-size: 48px; margin-bottom: 20px;">⏰</div>
        <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px;">Access Expired</div>
        <div style="font-size: 16px; opacity: 0.8;">Redirecting to blocker page...</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

// Listen for alarm events
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('tab-expire-')) {
    const tabId = parseInt(alarm.name.split('-')[2], 10);
    await handleApprovalExpiration(tabId);
  }
});

// Listen for tab close events
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await revokeApprovalForTab(tabId);
});

// Listen for navigation events - detect when user navigates away from approved site
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // Only handle main frame navigation
  if (details.frameId !== 0) return;

  // Ignore blocker page navigation
  if (details.url.startsWith(chrome.runtime.getURL(''))) return;

  const tabId = details.tabId;
  const data = await chrome.storage.local.get(['tabApprovals', 'blockedSites']);
  const tabApprovals = data.tabApprovals || {};
  const blockedSites = data.blockedSites || DEFAULT_BLOCKED_SITES;

  const approval = tabApprovals[tabId.toString()];
  if (!approval) return;

  // Grace period check - don't revoke if just granted
  if (Date.now() - approval.grantedAt < NAVIGATION_GRACE_PERIOD_MS) return;

  // Check if navigating to a different blocked domain
  const approvedBlockedDomain = getMatchingBlockedDomain(approval.url, blockedSites);
  const newBlockedDomain = getMatchingBlockedDomain(details.url, blockedSites);

  // If navigating to a different site (different blocked domain or non-blocked site)
  if (newBlockedDomain !== approvedBlockedDomain) {
    // Navigating away from approved domain - revoke approval
    await revokeApprovalForTab(tabId);
  }
});

// Listen for navigation events - block access
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only handle main frame navigation
  if (details.frameId !== 0) return;

  const url = details.url;
  const tabId = details.tabId;

  // Ignore extension pages
  if (url.startsWith(chrome.runtime.getURL(''))) return;

  // Get blocked sites from storage
  const data = await chrome.storage.local.get(['blockedSites']);
  const blockedSites = data.blockedSites || DEFAULT_BLOCKED_SITES;

  // Check if the site is blocked
  if (!isBlockedSite(url, blockedSites)) return;

  // Check if the tab has active approval
  if (await hasActiveApprovalForTab(url, tabId)) return;

  // Redirect to blocker page
  const blockerUrl = chrome.runtime.getURL('blocker.html') + '?url=' + encodeURIComponent(url);

  chrome.tabs.update(tabId, { url: blockerUrl });
});

// Listen for messages from blocker page and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GRANT_APPROVAL') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID' });
      return true;
    }
    grantApproval(message.url, tabId).then(() => {
      sendResponse({ success: true });
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_APPROVAL') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ hasApproval: false });
      return true;
    }
    hasActiveApprovalForTab(message.url, tabId).then((hasApproval) => {
      sendResponse({ hasApproval });
    });
    return true;
  }

  if (message.type === 'GET_APPROVAL_STATUS') {
    (async () => {
      const data = await chrome.storage.local.get(['tabApprovals']);
      const tabApprovals = data.tabApprovals || {};
      const now = Date.now();
      const activeApprovals = {};

      for (const [tabId, approval] of Object.entries(tabApprovals)) {
        const remaining = approval.expiresAt - now;
        if (remaining > 0) {
          // Try to get tab title
          let tabTitle = '';
          try {
            const tab = await chrome.tabs.get(parseInt(tabId, 10));
            tabTitle = tab.title || '';
          } catch {
            // Tab doesn't exist
          }

          activeApprovals[tabId] = {
            domain: approval.domain,
            url: approval.url,
            grantedAt: approval.grantedAt,
            expiresAt: approval.expiresAt,
            remainingMs: remaining,
            remainingMins: Math.ceil(remaining / 60000),
            tabTitle
          };
        }
      }

      sendResponse({ approvals: activeApprovals });
    })();
    return true;
  }

  if (message.type === 'REVOKE_APPROVAL') {
    const tabId = parseInt(message.tabId, 10);
    (async () => {
      const data = await chrome.storage.local.get(['tabApprovals']);
      const tabApprovals = data.tabApprovals || {};
      const approval = tabApprovals[tabId.toString()];

      if (approval) {
        const originalUrl = approval.url;
        await revokeApprovalForTab(tabId);

        // Redirect the tab to blocker page
        try {
          const blockerUrl = chrome.runtime.getURL('blocker.html') + '?url=' + encodeURIComponent(originalUrl);
          await chrome.tabs.update(tabId, { url: blockerUrl });
        } catch {
          // Tab may not exist
        }
      }

      sendResponse({ success: true });
    })();
    return true;
  }
});
