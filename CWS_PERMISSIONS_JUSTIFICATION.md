# Chrome Web Store Permissions Justification

## `<all_urls>` Host Permission

### Why this permission is required

LLM Time Blocker allows users to configure a custom list of websites they want to block. Because the block list is entirely user-defined and can include **any domain**, the extension must be able to intercept navigation to any URL. There is no way to predict at install time which domains a user will add.

### Specific usage in code

The `<all_urls>` permission enables three core behaviors in the background service worker (`src/background/background.js`):

1. **Navigation interception** (`webNavigation.onBeforeNavigate`, line 331): Every main-frame navigation is checked against the user's configured block list. If the destination matches a blocked domain, the tab is redirected to the extension's blocker page. Without `<all_urls>`, the extension could not observe navigations to user-added domains.

2. **Navigation-away detection** (`webNavigation.onCommitted`, line 301): When a user has an active approval for a blocked site and navigates away to a different domain, the extension revokes the approval. This requires observing committed navigations across all origins.

3. **Expiration overlay injection** (`chrome.scripting.executeScript`, line 233): When an approval timer expires, the extension injects a brief visual overlay into the blocked page before redirecting. The `scripting` permission combined with `<all_urls>` allows this injection on any domain the user has blocked.

### Why narrower permissions are insufficient

- **Static host permissions** cannot cover a user-configurable block list that may include any domain.
- **`activeTab`** only grants access after a user gesture on the popup and does not enable passive navigation monitoring.
- **Optional host permissions** (`chrome.permissions.request`) could theoretically be requested per-domain, but `webNavigation.onBeforeNavigate` must already be listening on the target URL pattern to intercept it. By the time the user navigates to a blocked site, it is too late to request the permission.

### Data handling

The extension does **not** read, collect, or transmit page content from any website. It only inspects the URL hostname to determine whether it matches the user's block list. No browsing data leaves the extension except for LLM chat messages that the user explicitly types on the blocker page.

## Other Permissions

| Permission | Justification |
|---|---|
| `storage` | Persist user settings: blocked site list, approval timestamps, schedule configuration, and auth tokens. |
| `webNavigation` | Observe navigation events to intercept blocked sites and detect navigation away from approved sites. |
| `activeTab` | Access the current tab for popup interactions. |
| `alarms` | Schedule approval expiration timers so access is automatically revoked after 30 minutes. |
| `scripting` | Inject the expiration overlay into blocked pages when an approval timer expires. |
| `tabs` | Query and update tabs for redirection, and read tab titles for the active-approvals display. |
| `identity` | Google OAuth sign-in for user authentication. |
| `https://api.llmtimeblocker.com/*` | Backend API for authentication, billing, and LLM chat proxying. |
